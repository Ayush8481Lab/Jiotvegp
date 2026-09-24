// hello.js — run:  node hello.js
// Node.js 18+ required (built-in fetch)

const URL =
  "https://apiv2.sonyliv.com/AGL/5.0/A/ENG/MWEB/IN/UP/CONTENT/VIDEOURL/VOD/1090543528";

// ---- Random ID generators ----

/**
 * 32 lowercase hex chars (16 random bytes), like:
 *   af839ff10c614e3cb1fbfdb86f2db494
 */
function randomHex32() {
  return require("crypto").randomBytes(16).toString("hex");
}

/**
 * deviceId = <hex32>-<13-digit ms timestamp>
 * e.g. af839ff10c614e3cb1fbfdb86f2db494-1790152174304
 */
function randomDeviceId() {
  const ts = Date.now(); // 13-digit ms epoch
  return `${randomHex32()}-${ts}`;
}

/**
 * ppid = 32 hex chars
 * e.g. 3a4f92a0919d4568931f657896b51b5a
 */
function randomPpid() {
  return randomHex32();
}

async function main() {
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
    const res = await fetch(URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    console.log(
      JSON.stringify(
        {
          ok: res.ok,
          status: res.status,
          deviceId,
          ppid,
          data,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          status: 502,
          deviceId,
          ppid,
          error: err.message,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

main();
