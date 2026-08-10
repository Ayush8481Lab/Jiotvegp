// We summon the serverless function to the Mumbai region
// to bypass the geo-restrictions of the distant west.
export const config = {
  regions: ['bom1'],
};

export default async function handler(req, res) {
  // We open the gates for CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'This path is forbidden.' });
  }

  try {
    const targetUrl = 'https://api.scraperapi.com/?api_key=a88422bd9f17966c9c6a0f6f3f5a92a3&country_code=in&url=https://www.zee5.com/live-tv/zee-news/0-9-zeenews';
    
    // We craft a thicker disguise to fool the sentinels
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      }
    });

    // If the wardens reject us, we shall know exactly why
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `The abyss stared back. Failed to fetch the target page.`,
        statusCode: response.status,
        statusText: response.statusText
      });
    }

    const html = await response.text();

    // We search the HTML tapestry for the elusive platform token
    const tokenRegex = /"platformToken":"(eyJ[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+)"/;
    const match = html.match(tokenRegex);

    if (match && match[1]) {
      const extractedToken = match[1];
      
      return res.status(200).json({
        success: true,
        token: extractedToken
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'The parchment was found, but the token was torn from its pages.'
      });
    }

  } catch (error) {
    console.error('A tragedy occurred in the darkness:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'The server succumbed to an internal sorrow.' 
    });
  }
      }
