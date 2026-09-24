export const config = { runtime: 'edge' };

const PREFIX = '/api/proxy';

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

  /* ---------- 1. Resolve the target, preserving the token verbatim ---------- */
  let target = null;

  const afterPrefix = reqUrl.pathname.slice(PREFIX.length).replace(/^\/+/, '');
  if (/^https?:\/\//i.test(afterPrefix)) {
    // path form: /api/proxy/https://cdn/x.m3u8?hdnea=...  (preferred)
    target = afterPrefix + reqUrl.search;
  } else {
    // fallback: /api/proxy?url=<encoded>
    target = reqUrl.searchParams.get('url');
  }

  if (!target) return json({ error: 'no target url' }, 400);

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return json({ error: 'invalid target url' }, 400);
  }
  if (!/^https?:$/.test(targetUrl.protocol)) {
    return json({ error: 'only http(s) allowed' }, 400);
  }

  /* ---------- 2. Build forwarded headers ---------- */
  const fwd = new Headers();
  for (const [k, v] of request.headers) {
    if (STRIP_REQ.has(k) || k.startsWith('x-proxy-')) continue;
    fwd.set(k, v);
  }

  // optional per-request overrides (useful for hotlink-protected CDNs)
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
      // @ts-ignore - edge runtime supports this
      duplex: 'half',
    });
  } catch (e) {
    return json({ error: 'upstream fetch failed', detail: String(e) }, 502);
  }

  /* ---------- 4. Rewrite HLS playlists so segments stay proxied ---------- */
  const isPlaylist =
    /\.m3u8($|\?)/i.test(targetUrl.pathname + targetUrl.search) ||
    (upstream.headers.get('content-type') || '').includes('mpegurl');

  const outHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (STRIP_RES.has(k)) continue;
    outHeaders.set(k, v);
  }
  for (const [k, v] of Object.entries(CORS)) outHeaders.set(k, v);

  if (isPlaylist && upstream.ok) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, targetUrl, origin);
    outHeaders.delete('content-length');
    outHeaders.set('cache-control', 'no-store');
    return new Response(rewritten, {
      status: upstream.status,
      headers: outHeaders,
    });
  }

  /* ---------- 5. Stream everything else straight through ---------- */
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

/** Build a proxied URL for `target`, keeping the query string byte-exact. */
function toProxy(target, origin) {
  // '#' would truncate the path, so escape only that.
  return `${origin}${PREFIX}/${target.replace(/#/g, '%23')}`;
}

/**
 * Rewrite an HLS manifest so every URI points back through this proxy.
 * Also carries the parent's auth token down to child URIs that lack one,
 * which is required when the CDN puts `?hdnea=...` only on the master.
 */
function rewritePlaylist(text, baseUrl, origin) {
  const base = new URL(baseUrl.href);
  const baseQuery = base.search; // includes leading '?' or ''

  const resolve = (uri) => {
    let abs;
    try {
      abs = new URL(uri, base);
    } catch {
      return uri;
    }
    // inherit the parent token if the child has none of its own
    if (!abs.search && baseQuery) abs.search = baseQuery;
    return toProxy(abs.href, origin);
  };

  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        // URI="..." inside #EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA / #EXT-X-I-FRAME-STREAM-INF
        return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${resolve(uri)}"`);
      }
      return resolve(t);
    })
    .join('\n');
}
