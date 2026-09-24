export const config = { runtime: 'edge' };

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
]);

const STRIP_RES = new Set([
  'content-encoding', 'content-length', 'transfer-encoding',
  'connection', 'keep-alive', 'set-cookie',
]);

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const reqUrl = new URL(request.url);
  const origin = reqUrl.origin;

  /* ---------- 1. Read the target ---------- */
  // searchParams.get() decodes once. Because we encodeURIComponent'd the whole
  // target (token included) on the client, the token comes back byte-exact —
  // '~', '=', '/', '*', ':' inside hdnea=... are all preserved.
  const raw = reqUrl.searchParams.get('url');
  if (!raw) return json({ error: 'missing ?url=' }, 400);

  let targetUrl;
  try {
    targetUrl = new URL(raw);
  } catch {
    return json({ error: 'invalid target url', got: raw }, 400);
  }
  if (!/^https?:$/.test(targetUrl.protocol)) {
    return json({ error: 'only http(s) allowed' }, 400);
  }

  /* ---------- 2. Forward headers ---------- */
  const fwd = new Headers();
  for (const [k, v] of request.headers) {
    if (STRIP_REQ.has(k) || k.startsWith('x-proxy-')) continue;
    fwd.set(k, v);
  }

  // Optional overrides for hotlink-protected CDNs
  const ref = request.headers.get('x-proxy-referer');
  const org = request.headers.get('x-proxy-origin');
  const ua  = request.headers.get('x-proxy-ua');
  if (ref) fwd.set('referer', ref);
  if (org) fwd.set('origin', org);
  if (ua)  fwd.set('user-agent', ua);

  /* ---------- 3. Fetch upstream ---------- */
  let upstream;
  try {
    upstream = await fetch(targetUrl.href, {
      method: request.method,
      headers: fwd,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
      // @ts-ignore edge runtime supports duplex
      duplex: 'half',
    });
  } catch (e) {
    return json({ error: 'upstream fetch failed', detail: String(e) }, 502);
  }

  /* ---------- 4. Prepare response headers ---------- */
  const outHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (STRIP_RES.has(k)) continue;
    outHeaders.set(k, v);
  }
  for (const [k, v] of Object.entries(CORS)) outHeaders.set(k, v);

  /* ---------- 5. Rewrite HLS playlists ---------- */
  const isPlaylist =
    /\.m3u8($|\?)/i.test(targetUrl.pathname + targetUrl.search) ||
    (upstream.headers.get('content-type') || '').includes('mpegurl');

  if (isPlaylist && upstream.ok) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, targetUrl, origin);
    outHeaders.delete('content-length');
    outHeaders.set('cache-control', 'no-store');
    return new Response(rewritten, { status: upstream.status, headers: outHeaders });
  }

  /* ---------- 6. Stream everything else ---------- */
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

/** Wrap a raw target URL into a proxied ?url= URL, preserving the token. */
function toProxy(absUrl, origin) {
  return `${origin}/api/proxy?url=${encodeURIComponent(absUrl)}`;
}

/**
 * Rewrite an HLS manifest so every URI points back through this proxy.
 * If a child URI has no query of its own, inherit the parent's (the token).
 */
function rewritePlaylist(text, baseUrl, origin) {
  const base = new URL(baseUrl.href);
  const baseQuery = base.search; // '?hdnea=...' or ''

  const resolve = (uri) => {
    let abs;
    try {
      abs = new URL(uri, base);
    } catch {
      return uri;
    }
    if (!abs.search && baseQuery) abs.search = baseQuery;
    return toProxy(abs.href, origin);
  };

  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${resolve(uri)}"`);
      }
      return resolve(t);
    })
    .join('\n');
    }
