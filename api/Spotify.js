/**
 * api/hello.js — Vercel Serverless Function
 * ------------------------------------------------------------------
 * Universal CORS proxy for Spotify (Widevine license + Web API).
 *
 *   GET  /api/hello?url=https://api.spotify.com/v1/me
 *   POST /api/hello?url=https://gae2-spclient.spotify.com/widevine-license/v1/audio/license
 *
 * Binary bodies (Widevine challenge) and binary responses (license)
 * are passed through untouched.
 * ------------------------------------------------------------------
 */

/* ================== CONFIG ================== */

const AUTH_API =
  process.env.AUTH_API || "https://spotifystreamayush.vercel.app/api/Auth";

// Spotify's real client-token issuer (optional)
const CLIENT_TOKEN_API = "https://clienttoken.spotify.com/v1/clienttoken";

// false -> client-token = clientId (what your Auth API returns)
// true  -> exchange clientId for a REAL client-token
const USE_REAL_CLIENT_TOKEN = false;

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

const SPOTIFY_ORIGIN = "https://open.spotify.com";
const SPOTIFY_REFERER = "https://open.spotify.com/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

/* Headers we must NOT forward to the upstream server */
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "origin",
  "referer",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
  "x-vercel-id",
  "x-vercel-forwarded-for",
  "x-vercel-proxied-for",
  ":authority",
  ":method",
  ":path",
  ":scheme",
]);

/* Headers we must NOT send back to the browser */
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
]);

/* ================== TOKEN CACHE ================== */

// Persists across warm invocations of the same lambda instance.
let tokenCache = {
  clientId: null,
  accessToken: null,
  clientToken: null,
  expiresAt: 0,
};

async function getTokens() {
  const now = Date.now();

  if (tokenCache.accessToken && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache;
  }

  const res = await fetch(AUTH_API, {
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Auth API failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (!data.clientId) throw new Error("Auth API: missing clientId");
  if (!data.accessToken) throw new Error("Auth API: missing accessToken");

  let clientToken = data.clientId;

  if (USE_REAL_CLIENT_TOKEN) {
    try {
      const real = await fetchRealClientToken(data.clientId);
      if (real) clientToken = real;
    } catch (_) {
      /* fall back to clientId */
    }
  }

  tokenCache = {
    clientId: data.clientId,
    accessToken: data.accessToken,
    clientToken,
    expiresAt: data.accessTokenExpirationTimestampMs || now + 30 * 60_000,
  };

  return tokenCache;
}

async function fetchRealClientToken(clientId) {
  const res = await fetch(CLIENT_TOKEN_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": DEFAULT_UA,
    },
    body: JSON.stringify({
      client_data: {
        client_version: "1.2.39.594",
        client_id: clientId,
        js_sdk_data: {
          device_brand: "unknown",
          device_model: "unknown",
          os: "windows",
          os_version: "NT 10.0",
          device_id: require("crypto").randomUUID(),
          device_type: "computer",
        },
      },
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json?.granted_token?.token || null;
}

/* ================== HELPERS ================== */

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, obj, status = 200) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(obj, null, 2));
}

/* ================== HANDLER ================== */

export default async function handler(req, res) {
  // ---- CORS preflight ----
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
    return res.end();
  }

  try {
    /* ---------- 1. Resolve target URL ---------- */
    let target = req.query?.url;

    // Fallback: /api/hello/https://host/path
    if (!target) {
      const after = (req.url || "")
        .replace(/^\/+/, "")
        .replace(/^api\/hello\/?/i, "");
      if (/^https?:\/\//i.test(after)) {
        target = decodeURIComponent(after);
      }
    }

    if (!target) {
      return sendJson(res, {
        ok: true,
        usage: "GET|POST /api/hello?url=<encoded target url>",
        example:
          "/api/hello?url=" +
          encodeURIComponent(
            "https://gae2-spclient.spotify.com/widevine-license/v1/audio/license"
          ),
      });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return sendJson(res, { error: "bad_url", message: "Invalid ?url=" }, 400);
    }

    if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
      return sendJson(res, { error: "bad_protocol" }, 400);
    }

    /* ---------- 2. Build upstream headers ---------- */
    const outHeaders = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (STRIP_REQUEST_HEADERS.has(lower)) continue;
      if (typeof value === "string") {
        outHeaders.set(key, value);
      } else if (Array.isArray(value)) {
        outHeaders.set(key, value.join(", "));
      }
    }

    outHeaders.set("origin", SPOTIFY_ORIGIN);
    outHeaders.set("referer", SPOTIFY_REFERER);
    if (!outHeaders.has("user-agent")) outHeaders.set("user-agent", DEFAULT_UA);
    outHeaders.set("accept-encoding", "identity");

    /* ---------- 3. Inject tokens if missing ---------- */
    const hasAuth = outHeaders.has("authorization");
    const hasClientToken = outHeaders.has("client-token");

    if (!hasAuth || !hasClientToken) {
      try {
        const t = await getTokens();
        if (!hasAuth) outHeaders.set("authorization", `Bearer ${t.accessToken}`);
        if (!hasClientToken) outHeaders.set("client-token", t.clientToken);
      } catch (e) {
        if (!hasAuth && !hasClientToken) {
          return sendJson(
            res,
            { error: "token_fetch_failed", message: String(e.message || e) },
            502
          );
        }
      }
    }

    /* ---------- 4. Read raw request body ---------- */
    const method = (req.method || "GET").toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const bodyBuffer = hasBody ? await readRawBody(req) : undefined;

    /* ---------- 5. Fire upstream ---------- */
    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers: outHeaders,
      body: bodyBuffer && bodyBuffer.length ? bodyBuffer : undefined,
      redirect: "follow",
    });

    /* ---------- 6. Build downstream response ---------- */
    res.statusCode = upstream.status;

    upstream.headers.forEach((value, key) => {
      if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      try {
        res.setHeader(key, value);
      } catch (_) {
        /* ignore invalid header names */
      }
    });

    for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);

    const arrayBuffer = await upstream.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    return sendJson(
      res,
      { error: "proxy_error", message: String((err && err.message) || err) },
      502
    );
  }
}

/* Disable Vercel's automatic JSON body parsing so we get raw bytes */
export const config = {
  api: {
    bodyParser: false,
  },
};
