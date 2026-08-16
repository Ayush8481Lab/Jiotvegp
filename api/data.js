export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { api } = req.query;

  const API_URLS = {
    // 👇 PASTE YOUR GITHUB RAW LINK INSIDE THE QUOTES BELOW 👇
    1: 'https://raw.githubusercontent.com/Ayush8481Lab/Mm/refs/heads/main/Jiohot', 
    2: 'https://tiny-flower-1d4d.shoeb66445.workers.dev/',
    3: 'https://myjioapi.bmera5952.workers.dev/',
    4: 'https://sonujson-devloper.vercel.app/Data/sports.json'
  };

  // Headers for API 1, 2, and 3 (Using referer)
  const standardHeaders = {
    'Referer': 'https://premiumplugx.me',
    'Origin': 'https://premiumplugx.me',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  };

  // Headers for API 4 (No referer, standard request)
  const noRefererHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json'
  };

  // Helper function to safely fetch API data
  const fetchApiData = async (url, customHeaders) => {
    if (!url) return { raw: [] }; 
    
    try {
      const fetchUrl = url.includes('.json') ? `${url}?t=${Date.now()}` : url;
      const response = await fetch(fetchUrl, { headers: customHeaders, cache: 'no-store' });
      const text = await response.text();

      try {
        const data = JSON.parse(text);
        
        if (Array.isArray(data)) return { raw: data };
        
        if (data && typeof data === 'object') {
          if (Array.isArray(data.channels)) return { raw: data.channels };
          
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) return { raw: data[key] };
          }
        }
        return { raw: [] };
      } catch (err) {
        return { raw: [] };
      }
    } catch (error) {
      return { raw: [] };
    }
  };

  // Flexible check to strictly match "Sports" category for APIS 1, 2, and 3
  const isSports = (item) => {
    if (!item) return false;
    const group = String(item.group || item.Group || "").toLowerCase();
    const category = String(item.category || item.Category || "").toLowerCase();
    return group.includes('sport') || category.includes('sport');
  };

  // Helper function to smartly append the UNIQUE cookie to the streaming URL
  const generateStreamUrl = (base, cookie) => {
    if (!base) return "";
    if (!cookie) return base;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}${cookie.trim()}`;
  };

  // ---------------------------------------------------------
  // CACHE ENGINE FOR API 4
  // ---------------------------------------------------------
  const applyDynamicCaching = (api4DataArray) => {
    let cacheSeconds = 0;
    
    if (api4DataArray && api4DataArray.length > 0) {
      const channelWithExpiry = api4DataArray.find(item => item.cookie_expire);
      
      if (channelWithExpiry && channelWithExpiry.cookie_expire) {
        const currentEpochSeconds = Math.floor(Date.now() / 1000);
        const timeRemaining = channelWithExpiry.cookie_expire - currentEpochSeconds;
        
        // 3 Hours = 10800 Seconds
        if (timeRemaining > 10800) {
          cacheSeconds = timeRemaining - 10800;
        }
      }
    }

    if (cacheSeconds > 0) {
      res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60`);
    } else {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  };

  // ====================================================================
  // CASE 1: Individual Raw Request (e.g., ?api=1, ?api=4)
  // ====================================================================
  if (api && API_URLS[api]) {
    const isApi4 = api === '4';
    const fetchHeaders = isApi4 ? noRefererHeaders : standardHeaders;
    const { raw } = await fetchApiData(API_URLS[api], fetchHeaders);
    
    let responseData = raw;

    if (isApi4) {
      applyDynamicCaching(raw);
    } else {
      responseData = raw.filter(isSports);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }

    return res.status(200).json(responseData);
  }

  // ====================================================================
  // CASE 2: Combined Unified Request (No query params)
  // ====================================================================
  const [res1, res2, res3, res4] = await Promise.all([
    fetchApiData(API_URLS[1], standardHeaders),
    fetchApiData(API_URLS[2], standardHeaders),
    fetchApiData(API_URLS[3], standardHeaders),
    fetchApiData(API_URLS[4], noRefererHeaders)
  ]);

  const combinedResponse = [];

  // 1. Process API 1 (SPORTS1)
  if (res1 && res1.raw) {
    res1.raw.forEach(item => {
      if (isSports(item)) {
        let base = item.mpd_url || item.url || item.mpd || "";
        let cookie = item.cookie || (item.headers && item.headers.cookie) || "";

        combinedResponse.push({
          name: item.name || "",
          id: String(item.id || ""),
          category: "SPORTS1",
          url: generateStreamUrl(base, cookie),
          keyId: item.keyId ? String(item.keyId) : "null",
          key: item.key ? String(item.key) : "null",
          logo: item.logo || ""
        });
      }
    });
  }

  // 2. Process API 2 (SPORTS2)
  if (res2 && res2.raw) {
    res2.raw.forEach(item => {
      if (isSports(item)) {
        let keyId = "null";
        let key = "null";
        
        if (item.clearkey && typeof item.clearkey === 'object') {
          const keys = Object.keys(item.clearkey);
          if (keys.length > 0) {
            keyId = String(keys[0]);
            key = String(item.clearkey[keys[0]]);
          }
        }

        let base = item.mpd_url || item.url || item.mpd || "";
        let cookie = (item.headers && item.headers.cookie) || item.cookie || "";

        combinedResponse.push({
          name: item.name || "",
          id: String(item.id || ""),
          category: "SPORTS2",
          url: generateStreamUrl(base, cookie),
          keyId: keyId,
          key: key,
          logo: item.logo || ""
        });
      }
    });
  }

  // 3. Process API 3 (SPORTS3)
  if (res3 && res3.raw) {
    res3.raw.forEach(item => {
      if (isSports(item)) {
        let base = item.mpd || item.mpd_url || item.url || "";
        let cookie = item.cookie || (item.headers && item.headers.cookie) || "";

        combinedResponse.push({
          name: item.name || "",
          id: String(item.id || ""),
          category: "SPORTS3",
          url: generateStreamUrl(base, cookie),
          keyId: item.keyId ? String(item.keyId) : "null",
          key: item.key ? String(item.key) : "null",
          logo: item.logo || ""
        });
      }
    });
  }

  // 4. Process API 4 (SPORTS4)
  if (res4 && res4.raw) {
    applyDynamicCaching(res4.raw);

    res4.raw.forEach(item => {
      let base = item.stream_url || "";
      let cookie = item.cookie || "";

      combinedResponse.push({
        name: item.name || "",
        id: String(item.id || ""),
        category: "SPORTS4",
        url: generateStreamUrl(base, cookie),
        keyId: item.key_id ? String(item.key_id) : "null",
        key: item.key ? String(item.key) : "null",
        logo: item.logo || ""
      });
    });
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  return res.status(200).json(combinedResponse);
        }
