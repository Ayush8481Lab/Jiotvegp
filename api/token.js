// We summon the serverless function to the Mumbai region
// to bypass the geo-restrictions of the distant west.
export const config = { regions: ['bom1'] };

// 40 ScraperAPI Keys provided – the arsenal of the many‑faced proxy
const SCRAPER_KEYS = [
  "8349f5fdab8a553fb89a6653f1b56660", "2a44d87e2cf38e7a8bd06a8a3cdef8cb",
  "10f48295a1791a2239881caf36735c1c", "98d515b0c64b337a9669f47d5e47c3c9",
  "46259507fcbfa2ebaef781828daa2215", "1df83eada3a9bd0235a611e97ebafd61",
  "7c02d837f41c08899f78fa2fb28d45a3", "3165c8fb528085e8a5f338d95860c8c9",
  "525face38db5c7b977b1390ad8c461c3", "a88422bd9f17966c9c6a0f6f3f5a92a3",
  "ad942f0bbbfb4eea726f67fb63e26234", "1d769870af4a8a5085791f4cee9d2426",
  "cd0a4c97b738ef46ceac519fa22136dd", "2f384c76edb42acdded27d129e8d09d5",
  "fcca3f470620002614194b3e12acb385", "7817a900f43d685102a6b82fd406945c",
  "e964417bee5220f4163647d23d5bcd6e", "44e7e337ce8d5d571799f8ef8e8af65c",
  "7edb16618ffc73f976a407301a42d447", "2f8ac4b5040be4ce3ec6607f8b301ce0",
  "18f8df88e2f43405640c3d790424de65", "e9208533ec5cdc69fc577435d09591e7",
  "8d9c34d1d8fa1a747b10fd7fbb972fdb", "4057102224677ac7ce595897cb6344b0",
  "6412370a916316a7c26fc225fbfc0f1e", "8b0a0b26d0ddf7e1ae56f0d21764bab2",
  "314c277af2dc5768e8f0a1120d861fb4", "d75982bd04e32a1cce34950723dcf6bf",
  "5da98ea3c39a8a02825cdea80c136c9d", "ab9aae3c018c1a51b1c4ae30b3a71529",
  "c1148d79a5444d34f5fdba0ffecb6868", "f4aefc202d7eaf46881f6e9197df913a",
  "91abe2dbb5fd21cb3e2fdf54ee46a735", "9216ad1845c11442e59d4f185b1ae640",
  "bfb08ca10f4299b292d9944127b6cf3f", "29a1775866177f1a711a4ec42cc61aea",
  "5d1046737b9fc6ccc36c0d48a601b85d", "85f58709712a420f495dbab6f1693330",
  "dfece35805080536808468a784fcd631", "335259612b2f462a99b8666d4863e675"
];

// A sturdy disguise for the scraping sentinels
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1'
};

/**
 * Tries to fetch the Zee News page through each ScraperAPI key.
 * Returns the first successful response, or null if all keys fail.
 */
async function fetchWithKeyRotation() {
  const baseParams = 'country_code=in&url=https://www.zee5.com/live-tv/zee-news/0-9-zeenews';

  for (const key of SCRAPER_KEYS) {
    const targetUrl = `https://api.scraperapi.com/?api_key=${key}&${baseParams}`;
    try {
      const response = await fetch(targetUrl, { headers: REQUEST_HEADERS });
      if (response.ok) {
        console.log(`Key ${key.slice(0, 6)}... succeeded.`);
        return response;
      }
      console.warn(`Key ${key.slice(0, 6)}... returned status ${response.status}. Trying next.`);
    } catch (err) {
      console.error(`Key ${key.slice(0, 6)}... threw an exception:`, err.message);
    }
  }
  return null; // All keys exhausted
}

export default async function handler(req, res) {
  // We open the gates for CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'This path is forbidden.' });
  }

  try {
    // Rotate through the keys until we pierce the veil
    const response = await fetchWithKeyRotation();

    if (!response) {
      return res.status(502).json({
        success: false,
        error: 'All ScraperAPI keys have been spent or blocked. The abyss has won today.'
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
