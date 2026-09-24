

export const config = {
  runtime: "nodejs",
};

const API_URL =
  "https://apiv2.sonyliv.com/AGL/5.0/R/ENG/MWEB/IN/RJ/CONTENT/VIDEOURL/VOD/1090543899";

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";

const TD_CLIENT_HINTS =
  '{"os_name":"Android","os_version":"14","device_make":"Samsung","device_model":"SM-A556B","display_res":"360","viewport_res":"360","conn_type":"4g","supp_codec":"H264,H265,AV1,AAC","client_throughput":"16000","td_user_agent":"Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36","hdr_decoder":"UNKNOWN","audio_decoder":"STEREO","app_version":"3.8.14"}';

// ---- The JSON body ----
// Trimmed down to fit under 261 bytes; padded with trailing spaces (valid JSON
// whitespace) until we hit exactly 261 bytes so content-length matches.
const BODY_TARGET_BYTES = 261;

const baseBody = {
  videoId: "1090543899",
  deviceId: "af839ff10c614e3cb1fbfdb86f2db494-1790152174304",
  advertiserId: "af839ff10c614e3cb1fbfdb86f2db494-1790152174305",
  sessionId: "bd7c92c81305492faa332ed59dc5fc73-1790188831267",
  platform: "ANDROID",
  appVersion: "3.8.14",
  country: "IN",
  state: "RJ",
};

function buildBody() {
  let s = JSON.stringify(baseBody);
  // Trailing whitespace is legal JSON and is ignored by parsers.
  while (Buffer.byteLength(s, "utf8") < BODY_TARGET_BYTES) s += " ";
  // If we overshot (body bigger than target), fall back to the raw JSON.
  if (Buffer.byteLength(s, "utf8") > BODY_TARGET_BYTES) s = s.trimEnd();
  return s;
}

function buildHeaders(bodyLength) {
  return {
    accept: "application/json, text/plain, */*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    advertiserid: "af839ff10c614e3cb1fbfdb86f2db494-1790152174305",
    app_version: "3.8.14",
    baggage:
      "sentry-environment=prod,sentry-release=3.8.14,sentry-public_key=b80aa90bfd086849eacd76761e1be154,sentry-trace_id=5091c92ca5be49fa93b89a09b924b482,sentry-org_id=4507419074494464,sentry-sampled=false,sentry-sample_rand=0.42995831043390664,sentry-sample_rate=0.1",
    "cache-control": "no-cache",
    "content-length": String(bodyLength),
    "content-type": "application/json",
    device_id: "af839ff10c614e3cb1fbfdb86f2db494-1790152174304",
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
    "sentry-trace": "5091c92ca5be49fa93b89a09b924b482-8a066d0b42e09f32-0",
    session_id: "bd7c92c81305492faa332ed59dc5fc73-1790188831267",
    td_client_hints: TD_CLIENT_HINTS,
    "user-agent": USER_AGENT,
    "x-via-device": "true",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const bodyStr = buildBody();
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
