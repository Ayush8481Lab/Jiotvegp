// api/hello.js
// Vercel Serverless Function (Node.js runtime)
//
// GET  /api/hello?id=HE_E_10080                → { token, licenseUrl, ... }  (auth only)
// POST /api/hello?id=HE_E_10080  (raw Widevine challenge body)
//                                              → Widevine license (binary)
//
// Flow (POST):
//   client → /api/hello → content-auth-token (get JWT)
//                       → nagra license service (forward challenge with nv-authorizations: <JWT>)
//                       → back to client

import { randomUUID, randomBytes } from 'crypto';

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const AUTH_URL     = 'https://vzy-sso.dish.watcho.com/v1/content-auth-token';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

// Turn off Vercel's automatic body parsing so we get the raw binary challenge
export const config = {
  api: { bodyParser: false },
};

// ------------------------------------------------------------------
// CACHE  (keyed by contentId → { token, licenseUrl, accountId, ts })
// ------------------------------------------------------------------
const tokenCache = new Map();

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

/**
 * Generate a random account id that looks like the original:
 *   web_<32 lowercase hex chars>
 * A new one is created per contentId and reused for CACHE_TTL_MS.
 */
function randomAccountId() {
  return 'web_' + randomBytes(16).toString('hex'); // 32 hex chars
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (req.body && typeof req.body === 'object') {
      return resolve(Buffer.from(JSON.stringify(req.body)));
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function getContentAuth(contentId) {
  const hit = tokenCache.get(contentId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit;

  // Fresh random account id for this content id (cached for CACHE_TTL_MS)
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
    resp = await fetch(AUTH_URL, {
      method: 'POST',
      headers: authHeaders,
      body: payload,
    });
  } catch (e) {
    const err = new Error(e.message);
    err.stage = 'content-auth-token';
    err.accountId = accountId;
    throw err;
  }

  const text = await resp.text();

  if (!resp.ok) {
    const err = new Error('content-auth-token request failed');
    err.stage = 'content-auth-token';
    err.code = resp.status;
    err.body = text;
    err.accountId = accountId;
    err.payload = JSON.parse(payload);
    throw err;
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const err = new Error('content-auth-token returned non-JSON');
    err.stage = 'content-auth-token';
    err.code = resp.status;
    err.body = text;
    err.accountId = accountId;
    throw err;
  }

  const token      = json.token;
  const licenseUrl = json.licenseUrl;

  if (!token || !licenseUrl) {
    const err = new Error('missing token/licenseUrl');
    err.stage = 'content-auth-token';
    err.body = json;
    err.accountId = accountId;
    throw err;
  }

  const entry = { token, licenseUrl, accountId, ts: Date.now() };
  tokenCache.set(contentId, entry);

  // Basic garbage collection so the map doesn't grow forever
  if (tokenCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of tokenCache) {
      if (now - v.ts >= CACHE_TTL_MS) tokenCache.delete(k);
    }
  }

  return entry;
}

// ------------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------------
export default async function handler(req, res) {
  // ---- INPUT -----------------------------------------------------
  const rawId     = req.query?.id;
  const contentId = Array.isArray(rawId) ? rawId[0] : (rawId || '');

  if (!contentId) {
    return res.status(400).json({ error: 'missing ?id=CONTENT_ID' });
  }

  // ---- STEP 1: get content-auth-token (cached 30 min per contentId)
  let auth;
  try {
    auth = await getContentAuth(contentId);
  } catch (e) {
    return res.status(502).json({
      stage: e.stage || 'content-auth-token',
      code: e.code,
      error: e.message,
      accountId: e.accountId,
      body: e.body,
      payload: e.payload,
    });
  }

  const challenge = await readRawBody(req);

  // ---- MODE 1: no body → return auth info as JSON -----------------
  if (!challenge || challenge.length === 0) {
    return res.status(200).json({
      contentId,
      accountId: auth.accountId,
      licenseUrl: auth.licenseUrl,
      token: auth.token,
      cachedFor: Math.round(CACHE_TTL_MS / 1000) + 's',
      message: 'Send a Widevine challenge as raw POST body to get a license.',
    });
  }

  // ---- MODE 2: forward Widevine challenge to nagra ---------------
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
