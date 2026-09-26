// api/hello.js — Vercel Serverless Function
import { randomBytes } from "node:crypto";

const URL =
  "https://ayushlivser.onrender.com/api/https://apiv2.sonyliv.com/AGL/5.0/R/ENG/MWEB/IN/UP/CONTENT/VIDEOURL/VOD/1090543528?contactId=1349216211";

/** 32 lowercase hex chars (16 random bytes) */
function randomHex32() {
  return randomBytes(16).toString("hex");
}

/** deviceId = <hex32>-<13-digit ms timestamp> */
function randomDeviceId() {
  return `${randomHex32()}-${Date.now()}`;
}

/** ppid = 32 hex chars */
function randomPpid() {
  return randomHex32();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const deviceId = randomDeviceId();
  const ppid = randomPpid();

  const payload = {
    actionType: "play",
    browser: "chrome",
    deviceId,
    os: "Android",
    platform: "mweb",
    hasLAURLEnabled: true,
    adsParams: {
      Idtype: "uuid",
      Is_lat: "0",
      ppid,
      preroll: true,
    },
  };

  const userAgent =
    "Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";

  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "content-type": "application/json",
    origin: "https://www.sonyliv.com",
    referer: "https://www.sonyliv.com/",
    "user-agent": userAgent,
    "sec-ch-ua":
      '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
  };

  try {
    const upstream = await fetch(URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).json({
      ok: upstream.ok,
      status: upstream.status,
      deviceId,
      ppid,
      data,
    });
  } catch (err) {
    console.error("Upstream request failed:", err);
    return res.status(502).json({
      ok: false,
      status: 502,
      deviceId,
      ppid,
      error: err.message,
    });
  }
    }
