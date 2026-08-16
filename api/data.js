export default async function handler(req, res) {
  // Set CORS headers just in case you call this from a frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { api } = req.query;

  // The Referer header required for all 3 APIs
  const headers = {
    'Referer': 'https://premiumplugx.me',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  };

  const API_URLS = {
    1: 'https://premiumplugx.me/hotstar/hotstar.json',
    2: 'https://tiny-flower-1d4d.shoeb66445.workers.dev/',
    3: 'https://myjioapi.bmera5952.workers.dev/'
  };

  // Helper function to safely fetch API data without crashing if one fails
  const fetchApiData = async (url) => {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
      return []; // Return empty array on failure so Promise.all won't break
    }
  };

  // ====================================================================
  // CASE 1: Individual API Request (e.g., ?api=1, ?api=2, ?api=3)
  // No formatting, just filter by Sports group/category.
  // ====================================================================
  if (api && API_URLS[api]) {
    const data = await fetchApiData(API_URLS[api]);
    
    // Filter only "Sports" group
    const sportsData = data.filter(item => 
      (item.group && item.group.toLowerCase() === 'sports') || 
      (item.category && item.category.toLowerCase() === 'sports')
    );
    
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
    if (item.group && item.group.toLowerCase() === 'sports') {
      combinedResponse.push({
        name: item.name,
        id: String(item.id),
        category: "SPORTS1",
        url: item.mpd_url,
        keyId: item.keyId || "",
        key: item.key || "",
        logo: item.logo || ""
      });
    }
  });

  // 2. Process API 2 (Format to Category: SPORTS2)
  data2.forEach(item => {
    if (item.group && item.group.toLowerCase() === 'sports') {
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
        name: item.name,
        id: String(item.id),
        category: "SPORTS2",
        url: item.mpd_url,
        keyId: keyId,
        key: key,
        logo: item.logo || ""
      });
    }
  });

  // 3. Process API 3 (Format to Category: SPORTS3)
  data3.forEach(item => {
    if (item.group && item.group.toLowerCase() === 'sports') {
      combinedResponse.push({
        name: item.name,
        id: String(item.id),
        category: "SPORTS3",
        url: item.mpd_url,
        keyId: item.keyId || "",
        key: item.key || "",
        logo: item.logo || ""
      });
    }
  });

  // Return the unified data
  return res.status(200).json(combinedResponse);
}
