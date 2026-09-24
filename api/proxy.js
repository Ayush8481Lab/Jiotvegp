export const config = { runtime: 'edge' };

/* ============================================================
 *  CONFIGURE YOUR IDENTITY HERE
 *  These are sent upstream on every request, replacing whatever
 *  the browser sent. Edit and redeploy — no frontend changes.
 * ============================================================ */
const CONFIG = {
  // Full URL of the site the token was issued for. The trailing slash
  // matters on some CDNs — Akamai's referer-whitelist matches exactly.
  REFERER: 'https://sonyliv.com/',

  // Origin header (scheme + host, no path, no trailing slash).
  ORIGIN:  'https://sonyliv.com.com',

  // User-Agent to impersonate. Must look like a real browser.
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',

  // Optional: X-Playback-Session-Id — some Akamai token setups bind to it.
  // Set to null to omit.
  PLAYBACK_SESSION_ID: null,

  // Optional: Cookie to send upstream (e.g. a captured hdnts=… session).
  // Set to null to omit.
  COOKIE: null,

  // Optional: rewrite the upstream Host header. Almost never needed —
  // only set this if the CDN requires a specific Host. Leave null.
  HOST: null,
};
/* ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

const STRIP_REQ = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'upgrade', 'accept-encoding', 'content-length',
  'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-host',
  'x-forwarded-proto', 'x-vercel-ip-country',
  // browser-supplied headers we're about to overwrite
  'referer', 'origin', 'user-agent', 'cookie',
  'x-playback-session-id',
]);

const STRIP_RES = new Set([
  'content-encoding', 'content-length', 'transfer-encoding',
  'connection', 'keep-alive',
]);

const SESSION_PARAM = '__sess';

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const reqUrl = new URL(request.url);
  const origin = reqUrl.origin;
  const debug  = reqUrl.searchParams.get('__debug') === '1';

  const raw = reqUrl.searchParams.get('url');
  if (!raw) return json({ error: 'missing ?url=' }, 400);

  let targetUrl;
  try { targetUrl = new URL(raw); }
  catch { return json({ error: 'invalid target url', got: raw }, 400); }
  if (!/^https?:$/.test(targetUrl.protocol)) return json({ error: 'only http(s)' }, 400);

  const sessionCookie = targetUrl.searchParams.get(SESSION_PARAM);
  if (sessionCookie) targetUrl.searchParams.delete(SESSION_PARAM);

  /* ---------- build forwarded headers ---------- */
  const fwd = new Headers();
  for (const [k, v] of request.headers) {
    if (STRIP_REQ.has(k) || k.startsWith('x-proxy-')) continue;
    fwd.set(k, v);
  }

  // ---- inject the configured identity ----
  if (CONFIG.REFERER)   fwd.set('referer',    CONFIG.REFERER);
  if (CONFIG.ORIGIN)    fwd.set('origin',     CONFIG.ORIGIN);
  if (CONFIG.USER_AGENT)fwd.set('user-agent', CONFIG.USER_AGENT);
  if (CONFIG.PLAYBACK_SESSION_ID)
    fwd.set('x-playback-session-id', CONFIG.PLAYBACK_SESSION_ID);
  if (CONFIG.HOST)      fwd.set('host',       CONFIG.HOST);

  const cookie = sessionCookie || CONFIG.COOKIE;
  if (cookie) fwd.set('cookie', cookie);

  if (debug) {
    return json({
      target:    targetUrl.href,
      forwarded: Object.fromEntries(fwd.entries()),
      config:    CONFIG,
    }, 200);
  }

  /* ---------- fetch upstream ---------- */
  let upstream;
  try {
    upstream = await fetch(targetUrl.href, {
      method: request.method,
      headers: fwd,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
      // @ts-ignore
      duplex: 'half',
    });
  } catch (e) {
    return json({ error: 'fetch failed', detail: String(e) }, 502);
  }

  /* ---------- response headers ---------- */
  const outHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (STRIP_RES.has(k)) continue;
    outHeaders.set(k, v);
  }
  for (const [k, v] of Object.entries(CORS)) outHeaders.set(k, v);
  outHeaders.set('x-proxy-upstream-status', String(upstream.status));

  /* ---------- capture any session cookie Akamai sets ---------- */
  let cookieForRewrite = cookie;
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const name = c.split('=')[0].trim();
    if (/^hdn(ts|tl|ea)$/i.test(name) || /session/i.test(name)) {
      cookieForRewrite = c.split(';')[0];
      break;
    }
  }

  /* ---------- rewrite HLS playlists ---------- */
  const isPlaylist =
    /\.m3u8($|\?)/i.test(targetUrl.pathname + targetUrl.search) ||
    (upstream.headers.get('content-type') || '').includes('mpegurl');

  if (isPlaylist && upstream.ok) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, targetUrl, origin, cookieForRewrite);
    outHeaders.delete('content-length');
    outHeaders.set('cache-control', 'no-store');
    return new Response(rewritten, { status: upstream.status, headers: outHeaders });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

/* ------------------------------------------------------------------ */

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

function toProxy(absUrl, origin, sessionCookie) {
  const u = new URL(absUrl);
  if (sessionCookie) u.searchParams.set(SESSION_PARAM, sessionCookie);
  return `${origin}/api/proxy?url=${encodeURIComponent(u.href)}`;
}

function rewritePlaylist(text, baseUrl, origin, sessionCookie) {
  const base = new URL(baseUrl.href);
  const baseQuery = base.search;

  const resolve = (uri) => {
    let abs;
    try { abs = new URL(uri, base); }
    catch { return uri; }
    if (!abs.search && baseQuery) abs.search = baseQuery;
    return toProxy(abs.href, origin, sessionCookie);
  };

  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${resolve(uri)}"`);
    }
    return resolve(t);
  }).join('\n');
  }
