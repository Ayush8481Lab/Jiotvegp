export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { api } = req.query;

  const API_URLS = {
    1: 'https://premiumplugx.me/hotstar/hotstar.json',
    2: 'https://tiny-flower-1d4d.shoeb66445.workers.dev/',
    3: 'https://myjioapi.bmera5952.workers.dev/'
  };

  // Upgraded headers to prevent bot-detection/Cloudflare blocks
  const headers = {
    'Referer': 'https://premiumplugx.me/',
    'Origin': 'https://premiumplugx.me',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  };

  // Helper function to safely fetch and parse API data
  const fetchApiData = async (url) => {
    try {
      const response = await fetch(url, { 
        headers, 
        cache: 'no-store' // CRITICAL: Fixes the issue where Vercel returns blank cached data
      });
      
      if (!response.ok) return [];
      
      // Fetch as text first to avoid crashing if the server sends HTML instead of JSON
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.error(`Failed to parse JSON from ${url}`);
        return [];
      }
    } catch (error) {
      console.error(`Network Error fetching ${url}:`, error.message);
      return []; // Return empty array on failure so Promise.all won't break
    }
  };

  // Robust check to match "Sports", "sports", "SPORT", etc., in any field
  const isSports = (item) => {
    const group = String(item.group || "").toLowerCase();
    const category = String(item.category || "").toLowerCase();
    return group.includes('sport') || category.includes('sport');
  };

  // ====================================================================
  // CASE 1: Individual API Request (e.g., ?api=1, ?api=2, ?api=3)
  // No formatting, just filter by Sports group/category.
  // ====================================================================
  if (api && API_URLS[api]) {
    const data = await fetchApiData(API_URLS[api]);
    const sportsData = data.filter(isSports);
    return res.status(200).json(sportsData);
  }

  // ====================================================================
  // CASE 2: Combined Request (No query params)
  // Fetch from all 3 APIs, format into unified structure
  // ====================================================================
  const [data1, data2, data3] = await Promise.all([
    fetchApiData(API_URLS[1]),
    fetchApiData(API_URLS[2]),
    fetchApiData(API_URLS[3])
  ]);

  const combinedResponse = [];

  // 1. Process API 1 (Format to Category: SPORTS1)
  data1.forEach(item => {
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

  // 2. Process API 2 (Format to Category: SPORTS2)
  data2.forEach(item => {
    if (isSports(item)) {
      let keyId = "";
      let key = "";
      
      // Extract keyId and key from the "clearkey" object
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

  // 3. Process API 3 (Format to Category: SPORTS3)
  data3.forEach(item => {
    if (isSports(item)) {
      combinedResponse.push({
        name: item.name || "",
        id: String(item.id || ""),
        category: "SPORTS3",
        // API 3 uses "mpd" instead of "mpd_url", this logic ensures we catch whichever is available
        url: item.mpd || item.mpd_url || item.url || "", 
        keyId: item.keyId || "",
        key: item.key || "",
        logo: item.logo || ""
      });
    }
  });

  // Return the unified data
  return res.status(200).json(combinedResponse);
}
