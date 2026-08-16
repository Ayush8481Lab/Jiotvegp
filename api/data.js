export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { api, debug } = req.query;

  const API_URLS = {
    1: 'https://premiumplugx.me/hotstar/hotstar.json',
    2: 'https://tiny-flower-1d4d.shoeb66445.workers.dev/',
    3: 'https://myjioapi.bmera5952.workers.dev/'
  };

  // Ultra-realistic browser headers to bypass bot protection
  const headers = {
    'Referer': 'https://premiumplugx.me', // Removed trailing slash just in case
    'Origin': 'https://premiumplugx.me',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive'
  };

  // Advanced fetch function that grabs data and handles errors/blocks
  const fetchApiData = async (url) => {
    try {
      // Added a random timestamp to bypass aggressive file caching
      const fetchUrl = url.includes('.json') ? `${url}?t=${Date.now()}` : url;
      
      const response = await fetch(fetchUrl, { headers, cache: 'no-store' });
      const text = await response.text();

      try {
        const data = JSON.parse(text);
        
        // If data is a direct array, return it
        if (Array.isArray(data)) return { raw: data, text };
        
        // If API wrapped the array inside an object (e.g., { "channels": [...] })
        if (data && typeof data === 'object') {
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) return { raw: data[key], text };
          }
        }
        
        return { raw: [], text };
      } catch (err) {
        // If JSON.parse fails (usually means Cloudflare blocked Vercel and sent HTML)
        return { raw: [], text, error: 'Failed to parse JSON. Server likely sent HTML.' };
      }
    } catch (error) {
      return { raw: [], text: '', error: error.message };
    }
  };

  // Flexible check to match "Sports", "sports", "SPORT", etc.
  const isSports = (item) => {
    if (!item) return false;
    const group = String(item.group || item.Group || "").toLowerCase();
    const category = String(item.category || item.Category || "").toLowerCase();
    return group.includes('sport') || category.includes('sport');
  };

  // ====================================================================
  // CASE 1: Individual Raw Request (e.g., ?api=1, ?api=2)
  // ====================================================================
  if (api && API_URLS[api]) {
    const { raw, text, error } = await fetchApiData(API_URLS[api]);
    
    // SECRET DEBUG MODE: If you go to /api/data?api=1&debug=true
    // It will show you EXACTLY what the premiumplugx server is responding with.
    if (debug === 'true') {
      return res.status(200).json({ 
        fetchStatus: error ? "Failed" : "Success", 
        errorFound: error || "None",
        rawTextReceived: text, 
        parsedArray: raw 
      });
    }

    const sportsData = raw.filter(isSports);
    return res.status(200).json(sportsData);
  }

  // ====================================================================
  // CASE 2: Combined Unified Request (No query params)
  // ====================================================================
  const [res1, res2, res3] = await Promise.all([
    fetchApiData(API_URLS[1]),
    fetchApiData(API_URLS[2]),
    fetchApiData(API_URLS[3])
  ]);

  const combinedResponse = [];

  // 1. Process API 1 (SPORTS1)
  res1.raw.forEach(item => {
    if (isSports(item)) {
      combinedResponse.push({
        name: item.name || "",
        id: String(item.id || ""),
        category: "SPORTS1",
        url: item.mpd_url || item.url || item.mpd || "",
        keyId: item.keyId || "",
        key: item.key || "",
        logo: item.logo || ""
      });
    }
  });

  // 2. Process API 2 (SPORTS2)
  res2.raw.forEach(item => {
    if (isSports(item)) {
      let keyId = "";
      let key = "";
      if (item.clearkey && typeof item.clearkey === 'object') {
        const keys = Object.keys(item.clearkey);
        if (keys.length > 0) {
          keyId = keys[0];
          key = item.clearkey[keyId];
        }
      }
      combinedResponse.push({
        name: item.name || "",
        id: String(item.id || ""),
        category: "SPORTS2",
        url: item.mpd_url || item.url || item.mpd || "",
        keyId: keyId,
        key: key,
        logo: item.logo || ""
      });
    }
  });

  // 3. Process API 3 (SPORTS3)
  res3.raw.forEach(item => {
    if (isSports(item)) {
      combinedResponse.push({
        name: item.name || "",
        id: String(item.id || ""),
        category: "SPORTS3",
        url: item.mpd || item.mpd_url || item.url || "",
        keyId: item.keyId || "",
        key: item.key || "",
        logo: item.logo || ""
      });
    }
  });

  return res.status(200).json(combinedResponse);
}
