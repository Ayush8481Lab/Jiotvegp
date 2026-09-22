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
      'dishtv-api.revlet.net/service/api/v1/page/stream?path=video%2Fplay%2Ftrailer%2Fsonyliv-1700000659&stream_type=trailer&appVersion=1.0&versionCode=1.0';

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'box-id': 'd430f18d-81bb-9816-38ff-2ebf0f4c4f58',
        'session-id': 'db392d41-4283-4e28-a024-07db367337d7',
        'tenant-code': 'dishtv',
        'referer': 'https://www.dishtv.in/',
        'origin': 'https://www.dishtv.in',
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
