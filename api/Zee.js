// pages/api/hello.js  (or api/hello.js — Next.js Pages API route format)
// Vercel / Next.js Node.js serverless function

import { randomUUID, randomBytes } from 'crypto';

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const AUTH_URL     = 'https://vzy-sso.dish.watcho.com/v1/content-auth-token';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

// CRITICAL: must be at top level. Keeps the raw binary Widevine
// challenge intact instead of letting the framework parse it.
export const config = {
  api: { bodyParser: false },
};

// ------------------------------------------------------------------
// CACHE  keyed by contentId
// ------------------------------------------------------------------
const tokenCache = new Map();

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
function randomAccountId() {
  return 'web_' + randomBytes(16).toString('hex'); // web_<32 hex>
}

async function readRawBody(req) {
  // 1) Already a Buffer (body-parser sometimes produces this)
  if (Buffer.isBuffer(req.body) && req.body.length > 0) return req.body;

  // 2) Already a non-empty string
  if (typeof req.body === 'string' && req.body.length > 0) {
    return Buffer.from(req.body, 'binary');
  }

  // 3) Already a parsed object (JSON body-parser)
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const keys = Object.keys(req.body);
    if (keys.length > 0) {
      if (typeof req.body.challenge === 'string') {
        return Buffer.from(req.body.challenge, 'base64');
      }
      if (typeof req.body.challengeBase64 === 'string') {
        return Buffer.from(req.body.challengeBase64, 'base64');
      }
      return Buffer.from(JSON.stringify(req.body));
    }
  }

  // 4) Read the raw stream (the normal path when bodyParser is off)
  return new Promise((resolve, reject) => {
    if (req.readableEnded) return resolve(Buffer.alloc(0));
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function getContentAuth(contentId) {
  const hit = tokenCache.get(contentId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit;

  const accountId = randomAccountId();

  const payload = JSON.stringify({
    accountId,
    contentId,
    type: '1',
    deviceUniqueId: randomUUID(),
    deviceId: randomUUID(),
    format: 'widevine',
    platform: 'web',
  });

  const authHeaders = {
    'sec-ch-ua-platform': '"Windows"',
    'x-partner-name': 'nagra',
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
    'Content-Type': 'application/json',
    'sec-ch-ua-mobile': '?0',
    'Origin': 'https://www.vzy.one',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': 'https://www.vzy.one/',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  };

  let resp;
  try {
    resp = await fetch(AUTH_URL, { method: 'POST', headers: authHeaders, body: payload });
  } catch (e) {
    const err = new Error(e.message); err.stage = 'content-auth-token'; err.accountId = accountId; throw err;
  }

  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error('content-auth-token request failed');
    err.stage = 'content-auth-token'; err.code = resp.status; err.body = text;
    err.accountId = accountId; err.payload = JSON.parse(payload); throw err;
  }

  let json;
  try { json = JSON.parse(text); }
  catch {
    const err = new Error('content-auth-token returned non-JSON');
    err.stage = 'content-auth-token'; err.code = resp.status; err.body = text; err.accountId = accountId; throw err;
  }

  const { token, licenseUrl } = json;
  if (!token || !licenseUrl) {
    const err = new Error('missing token/licenseUrl');
    err.stage = 'content-auth-token'; err.body = json; err.accountId = accountId; throw err;
  }

  const entry = { token, licenseUrl, accountId, ts: Date.now() };
  tokenCache.set(contentId, entry);

  if (tokenCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of tokenCache) if (now - v.ts >= CACHE_TTL_MS) tokenCache.delete(k);
  }

  return entry;
}

// ------------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------------
export default async function handler(req, res) {
  const rawId     = req.query?.id;
  const contentId = Array.isArray(rawId) ? rawId[0] : (rawId || '');

  if (!contentId) {
    return res.status(400).json({ error: 'missing ?id=CONTENT_ID' });
  }

  // ---- STEP 1: content-auth-token (cached 30 min per contentId) ----
  let auth;
  try {
    auth = await getContentAuth(contentId);
  } catch (e) {
    return res.status(502).json({
      stage: e.stage || 'content-auth-token',
      code: e.code, error: e.message,
      accountId: e.accountId, body: e.body, payload: e.payload,
    });
  }

  // ---- STEP 2: get challenge from every possible source -----------
  let challenge = Buffer.alloc(0);

  // (a) base64 challenge in query string (some players do this)
  if (req.query?.challenge) {
    try { challenge = Buffer.from(String(req.query.challenge), 'base64'); } catch {}
  }

  // (b) body (stream, buffer, string or parsed object)
  if (challenge.length === 0) {
    challenge = await readRawBody(req);
  }

  // ---- MODE 1: no challenge → return auth JSON --------------------
  if (challenge.length === 0) {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    // If it was a POST with a body that we somehow lost, say so loudly
    if (req.method === 'POST' && contentLength > 0) {
      return res.status(502).json({
        stage: 'body-read',
        error: 'POST body was empty despite Content-Length > 0',
        method: req.method,
        contentLength,
        contentType: req.headers['content-type'],
        bodyType: typeof req.body,
        bodyIsBuffer: Buffer.isBuffer(req.body),
        bodyLength: Buffer.isBuffer(req.body)
          ? req.body.length
          : (typeof req.body === 'string' ? req.body.length : null),
        hint: 'Make sure `export const config = { api: { bodyParser: false } }` is at the top of the file.',
      });
    }

    return res.status(200).json({
      contentId,
      accountId: auth.accountId,
      licenseUrl: auth.licenseUrl,
      token: auth.token,
      cachedFor: Math.round(CACHE_TTL_MS / 1000) + 's',
      // --- diagnostics: what did the client actually send? ---
      debug: {
        method: req.method,
        contentType: req.headers['content-type'] || null,
        contentLength: req.headers['content-length'] || null,
        bodyReceived: challenge.length,
      },
      message: 'Send a Widevine challenge as raw POST body to get a license.',
    });
  }

  // ---- MODE 2: forward the Widevine challenge to Nagra -----------
  let upstream;
  try {
    upstream = await fetch(auth.licenseUrl, {
      method: 'POST',
      headers: {
        'sec-ch-ua-platform': '"Windows"',
        'User-Agent': UA,
        'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'nv-authorizations': auth.token,
        'Accept': '*/*',
        'Origin': 'https://www.vzy.one',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Referer': 'https://www.vzy.one/',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Content-Type': 'application/octet-stream',
      },
      body: challenge,
    });
  } catch (e) {
    return res.status(502).json({ stage: 'license', error: e.message });
  }

  const out   = Buffer.from(await upstream.arrayBuffer());
  const ctype = upstream.headers.get('content-type') || 'application/octet-stream';

  res.status(upstream.status || 502);
  res.setHeader('Content-Type', ctype);
  res.setHeader('Content-Length', out.length);
  return res.send(out);
                                        }
