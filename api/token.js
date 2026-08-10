export default async function handler(req, res) {
  // Set CORS headers if this API will be accessed from a frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Fetch the target webpage (using example.com for demonstration)
    const targetUrl = 'https://www.zee5.com/live-tv/zee-news/0-9-zeenews';
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch the target page' });
    }

    const html = await response.text();

    // 2. Define a regex pattern to locate the token inside the HTML.
    // This example assumes the token is stored in the DOM like: "token":"eyJhb..."
    const tokenRegex = /"token":"(eyJ[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+)"/;
    const match = html.match(tokenRegex);

    // 3. Extract and return the token
    if (match && match[1]) {
      const extractedToken = match[1];
      
      return res.status(200).json({
        success: true,
        token: extractedToken
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Token not found in the HTML source.'
      });
    }

  } catch (error) {
    console.error('Scraping Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error during execution' 
    });
  }
}
