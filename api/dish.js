// api/hello.js — Vercel Serverless Function
// Mirrors the captured SonyLIV app request headers.

export const config = {
  runtime: "nodejs",
};

const API_URL =
  "https://apiv2.sonyliv.com/AGL/5.0/R/ENG/MWEB/IN/RJ/CONTENT/VIDEOURL/VOD/1090543899";

// --- Cookies from your export ---
// In production, set env var SONYLIV_COOKIE on Vercel to override.
const COOKIES = {
  _fbp: "fb.1.1783693222101.247915258225897267",
  ak_bmsc:
    "7F9064E8E408D420DEB5DDEFFDDC86EF~000000000000000000000000000000~YAAQLvEBF9i/gsSgAQAA47WkzwHfASxvkHR8M2aGRtgv6E/f+cxhjgcBloLQr86V0EYU2epcjkkBKQPvyhtH3fyAO+xKPou6WJxybQ+HEQec8/p7C7XXIsPIqJvp2Nw0d/PA5mn4JDja/ecHRl0bpimt0GKsk0BlGUf4DKUTd1Ir8lEx1kiodYt5SDvjrR1tt2IPNB5g0BUZ2qJpxaddyEmgXZFPw9MHiaYGAcv8X2jry4aUTCfa3hZqrrRt/VQ33l/1Ui7EZUR+qtPk1xg0ODF1AkELWiEMSfne/tVaz7558FeageDVl++AWsOKGWa3ttUoJypAaQ2IunHdPjZJlDZr+72TBULykfSmJiaF0xzYzIvgmq0wXH4rrZ1Ip6IFjhKI8rD6U/vKDpxDtNAHndQdp59eNjQYio9x/w==",
  _uetsid: "6f161c507c6a11f19286897dbedd515d",
  bm_sz:
    "686427F993C00377F2E688BF8E2BD3CB~YAAQLvEBF9m/gsSgAQAA47WkzwFjPRgtVmgKgHkUorX9fMk9Px5gGsRGAO6wEAVAAJe5mmDrzUDJOeaYONSlp6uiBPC0LU/XweZmlNy9SZtFMELITEBQeyaV45iZ/0ZJQVNkNkPfDBT1istDsThCo1ZC7kga78eEHxFulspYyR1icSnM7NvfxlcAVUZdHXAkS8hvnSbq/cIRTzn/kzCaPrFZRrfB0ye/BsZ4VZ6FCbjbSCu3TuYUwp4dvWDf3tmpP/yVTV4Olz9PSjtDI9LuRL1PI1WgH4Dva/+o4+pcRXjLrVBx72GhB5hiLFiSADGGoVQiU7lII0tbBbFFrqTYfnGhMpwUcIG+EM8S/i+CBCUNUEhmmgBnUQw3SMdfHjrkntZfOqvjvX8f~3687746~3360054",
  _uetvid: "6f179c907c6a11f1842817aa41339172",
  "WZRK_S_48K-8WW-754Z":
    "%7B%22p%22%3A1%2C%22s%22%3A1790190073%2C%22t%22%3A1790190077%7D",
  _abck:
    "381BB8C448AE74AC00D829FC15814952~-1~YAAQLvEBF9e/gsSgAQAA47WkzxAa4hqyms10dgrDqUIcx+C8mVJJEa8Obxwm+EAPT2pNf0gYjE7LcucaqwpC7E3TBtw6Zr7Dc2NuCO4uXCSK1vORpswLEhloV7xgZ+Ta2CYysegureWhZhPu3sLM4J5S4Dn0s3QdM1HCPmd2eSHZ5RfPP8YZWyEYZNouVZcz/rZa4oDoK8XfR+mnT6H/hlM3OGMGOb31N167r4eMX3gZ9GpocIQQva828XLM3fBoGusYZMgjZL+rn1VTc4q73a3OpG7hf6Mio/2soKLoDLjjqwUL5sCI8/rdGVj8VltQvdnoxSpWHXkZCYcZXoblNZS+cfybTnB8p8b9Abj6bwPDtLpZfG7kmhyV0WHTAWZwA99HcbYHV+2gckeMotKBJ4fu/JdMNL1TJ7fsuTA/D9wKSUSMcbgooUv1/ZtqY7Dhwm3eqsfGrCg6TS8G26jaEOnM0T632b7uW49KAbMADwT6zjE/~-1~-1~-1~-1~-1",
  _ga: "GA1.1.557818348.1783692760",
  _ga_1WZE8VR8Q1: "GS2.1.s1790190090$o2$g1$t1790190143$j7$l0$h0",
  _gcl_au: "1.1.1123904215.1783692756",
  _scid: "MCTdkEAu2HoEC44mnf5UGEg5mReZwmyE",
  _scid_r: "MCTdkEAu2HoEC44mnf5UGEg5mReZwmyE",
  _sctr: "1%7C1783621800000",
  AF_SYNC: "1790190122193",
  afUserId: "c22fd857-a5ee-414a-be9f-72f6451a2528-p",
  ak_cf: "c06m-1hqo-4kw5-ide7",
  bm_sv:
    "8BE7CF17403542AD789D7C4ED51E480C~YAAQLPEBFw5vU5KgAQAA81SlzwH5WGKd5qj2YnDoLijw6i33A8swWeDQ6AsmEiNRFXH01pUG9FzhO11S0YK4F/V9+Vt/7WuTw4RM58lFyrwXnhZX0BPqgT5wfK70YtBY2d5Go8mXQlyMEfsINzHBKoV3U/PA2NeCHWHMyyvIWYbUuglWj80UlA4pyb+Zbr1IQOnzOfX+9sEWQXBbJnIiMsHU3SqnHCJRWQmHy5eDxrCEw+YUDmMxii9DAeLoWLcMsw==~1",
  WZRK_G: "59ba0d0061ca49e19cde69b9b9da07fd",
};

function buildCookieHeader() {
  if (process.env.SONYLIV_COOKIE) return process.env.SONYLIV_COOKIE;
  return Object.entries(COOKIES)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// --- Values from the captured request ---
const ADVERTISER_ID = "af839ff10c614e3cb1fbfdb86f2db494-1790152174305";
const DEVICE_ID = "af839ff10c614e3cb1fbfdb86f2db494-1790152174304";
const SESSION_ID = "bd7c92c81305492faa332ed59dc5fc73-1790188831267";
const APP_VERSION = "3.8.14";
const SENTRY_TRACE = "5091c92ca5be49fa93b89a09b924b482-8a066d0b42e09f32-0";
const BAGGAGE =
  "sentry-environment=prod,sentry-release=3.8.14,sentry-public_key=b80aa90bfd086849eacd76761e1be154,sentry-trace_id=5091c92ca5be49fa93b89a09b924b482,sentry-org_id=4507419074494464,sentry-sampled=false,sentry-sample_rand=0.42995831043390664,sentry-sample_rate=0.1";

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";

const TD_CLIENT_HINTS = JSON.stringify({
  os_name: "Android",
  os_version: "14",
  device_make: "Samsung",
  device_model: "SM-A556B",
  display_res: "360",
  viewport_res: "360",
  conn_type: "4g",
  supp_codec: "H264,H265,AV1,AAC",
  client_throughput: "16000",
  td_user_agent: USER_AGENT,
  hdr_decoder: "UNKNOWN",
  audio_decoder: "STEREO",
  app_version: "3.8.14",
});

function buildHeaders(bodyLength) {
  // Note: pseudo-headers (:authority, :method, :path, :scheme) are set
  // automatically by fetch from the URL and must NOT be provided manually.
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    advertiserid: ADVERTISER_ID,
    app_version: APP_VERSION,
    baggage: BAGGAGE,
    "cache-control": "no-cache",
    "content-length": String(bodyLength),
    "content-type": "application/json",
    device_id: DEVICE_ID,
    origin: "https://www.sonyliv.com",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://www.sonyliv.com/",
    "sec-ch-ua":
      '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "sentry-trace": SENTRY_TRACE,
    session_id: SESSION_ID,
    td_client_hints: TD_CLIENT_HINTS,
    "user-agent": USER_AGENT,
    "x-via-device": "true",
    cookie: buildCookieHeader(),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const bodyObj = req.body && Object.keys(req.body).length ? req.body : {};
    const bodyStr = JSON.stringify(bodyObj);
    const bodyBuf = Buffer.from(bodyStr, "utf8");

    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(bodyBuf.length),
      body: bodyBuf,
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).json({
      ok: upstream.ok,
      status: upstream.status,
      data: payload,
    });
  } catch (err) {
    console.error("Upstream request failed:", err);
    return res.status(502).json({
      error: "Upstream request failed",
      message: err.message,
    });
  }
}
