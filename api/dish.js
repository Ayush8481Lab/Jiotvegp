// hello.js — works on all Node versions
const https = require("https");

const API_URL =
  "https://apiv2.sonyliv.com/AGL/5.0/A/ENG/MWEB/IN/UP/CONTENT/VIDEOURL/VOD/1090476406";

const options = {
  method: "POST",
  headers: {
    "cookie":
      "sl_device_token=3a4f92a0919d4568931f657896b51b5a-1790188990243; " +
      "sl_ppid=3a4f92a0919d4568931f657896b51b5a; " +
      "ak_cf=g8f0-ju0v-w04o-3rxa",
    "content-type": "application/json",
    "accept": "application/json, text/plain, */*",
    "user-agent": "Mozilla/5.0 (Linux; Android 13) Mobile Safari/537.36",
    "origin": "https://www.sonyliv.com",
    "referer": "https://www.sonyliv.com/",
  },
};

const req = https.request(API_URL, options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
  });
});

req.on("error", (e) => console.error("Request failed:", e));
req.write(JSON.stringify({}));
req.end();
