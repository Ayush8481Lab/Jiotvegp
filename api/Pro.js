// api/token.js
export default async function handler(req, res) {
  // CORS for cross‑origin frontends
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  let targetUrl;
  try {
    targetUrl = new URL(url);
    // Optional: restrict to specific domain for security
    // if (targetUrl.hostname !== 'hubstream.art') throw new Error('Domain not allowed');
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // --- Browser‑like headers ---
  const headers = {
    // Referer – set to the main site (as you requested)
    'Referer': 'https://hubstream.art/',

    // Modern Chrome User‑Agent (Windows)
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',

    // Accept headers (standard for fetching HTML / video / images)
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin', // adjust if needed; for our case, we are proxying from a different origin, but we can pretend
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };

  // Optionally forward some client headers (like Authorization, Cookie) if you need them
  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }
  if (req.headers.cookie) {
    headers['Cookie'] = req.headers.cookie;
  }
  // You can add others: 'If-None-Match', 'Range', etc.

  try {
    const response = await fetch(targetUrl.toString(), {
      headers,
      redirect: 'follow', // default, but explicit
      // You can add a timeout if needed
      // signal: AbortSignal.timeout(10000),
    });

    // Forward the status and headers (except CORS‑related ones we already set)
    res.status(response.status);
    const excludeHeaders = ['access-control-allow-origin', 'access-control-allow-methods', 'connection', 'keep-alive'];
    response.headers.forEach((value, key) => {
      if (!excludeHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Get the body as buffer and send it
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch the requested URL' });
  }
}
