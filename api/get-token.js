// /api/get-token.js
export default async function handler(req, res) {
  // Enable CORS for your Worker domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing file id' });
  }

  try {
    const hubUrl = `https://hubcloud.cx/drive/${id}`;
    const response = await fetch(hubUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `HubCloud returned ${response.status}` });
    }

    const html = await response.text();
    const genUrlMatch = html.match(/https?:\/\/[^"'\s>]*gamerxyt\.com\/hubcloud\.php[^"'\s>]*/i);
    if (!genUrlMatch) {
      return res.status(500).json({ error: 'Could not find generated link' });
    }

    const genUrl = genUrlMatch[0].replace(/&amp;/g, '&');
    const token = new URL(genUrl).searchParams.get('token');
    if (!token) {
      return res.status(500).json({ error: 'Token not found in generated link' });
    }

    return res.status(200).json({ token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
