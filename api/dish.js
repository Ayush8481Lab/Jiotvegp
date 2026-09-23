export default async function handler(req, res) {
  // CORS headers so you can call it from anywhere
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const targetUrl =
      'https://apiv2.sonyliv.com/AGL/5.0/A/ENG/MWEB/IN/UP/CONTENT/VIDEOURL/VOD/1090476406';

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        "cookie": "sl_device_token=3a4f92a0919d4568931f657896b51b5a-1790188990243; sl_ppid=3a4f92a0919d4568931f657896b51b5a; ak_cf=g8f0-ju0v-w04o-3rxa",
        'tenant-code': 'dishtv',
        'referer': 'https://sonyliv.com/',
        'origin': 'https://sonyliv.com,
      },
    });

    const data = await upstream.json();

    res.setHeader('Content-Type', 'application/json');
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({
      error: 'Proxy request failed',
      message: err.message,
    });
  }
}
