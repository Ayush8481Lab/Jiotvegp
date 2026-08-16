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

  // Advanced Fetch Engine to bypass Cloudflare's "Just a moment..." challenge
  const fetchApiData = async (url) => {
    // We try multiple disguises (User-Agents) to trick Cloudflare
    const userAgentsToTry = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', // Bypass 1: Googlebot
      'ExoPlayer/2.18.1 (Linux; Android 11)', // Bypass 2: Media Player
      'Hotstar;in.startv.hotstar/12.4.5 (Android/11)' // Bypass 3: App UA
    ];

    let lastText = "";
    let lastError = "";

    // Strategy 1: Direct fetch with rotating identities
    for (const ua of userAgentsToTry) {
      try {
        const fetchUrl = url.includes('.json') ? `${url}?t=${Date.now()}` : url;
        const response = await fetch(fetchUrl, {
          headers: {
            'Referer': 'https://premiumplugx.me',
            'User-Agent': ua,
            'Accept': 'application/json, text/plain, */*'
          },
          cache: 'no-store'
        });
        
        lastText = await response.text();

        // If Cloudflare blocks us, skip to the next disguise
        if (lastText.includes('Just a moment...') || lastText.includes('__cf_chl_tk')) {
          lastError = "Cloudflare Blocked";
          continue; 
        }

        // Try to parse the clean JSON
        const data = JSON.parse(lastText);
        if (Array.isArray(data)) return { raw: data, text: lastText, error: null };
        
        // Handle if JSON is wrapped in an object
        if (data && typeof data === 'object') {
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) return { raw: data[key], text: lastText, error: null };
          }
        }
      } catch (err) {
        // Not valid JSON, continue loop
        continue;
      }
    }

    // Strategy 2: If Cloudflare completely blocks Vercel, route through a proxy
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, { cache: 'no-store' });
      lastText = await response.text();
      const data = JSON.parse(lastText);
      
      if (Array.isArray(data)) return { raw: data, text: lastText, error: null };
    } catch (err) {
      lastError = "Proxy fallback also failed.";
    }

    // If ALL methods fail (API is down or heavily protected), return empty gracefully
    return { raw: [], text: lastText, error: lastError };
  };

  // Flexible check to strictly match "Sports" category
  const isSports = (item) => {
    if (!item) return false;
    const group = String(item.group || item.Group || "").toLowerCase();
    const category = String(item.category || item.Category || "").toLowerCase();
    return group.includes('sport') || category.includes('sport');
  };

  // ====================================================================
  // CASE 1: Individual Raw Request (e.g., ?api=1, ?api=2)
  // No formatting, just filter by Sports category
  // ====================================================================
  if (api && API_URLS[api]) {
    const { raw, text, error } = await fetchApiData(API_URLS[api]);
    
    // Debug mode (keep this so you can check if proxy fails later)
    if (debug === 'true') {
      return res.status(200).json({ 
        fetchStatus: raw.length > 0 ? "Success" : "Failed", 
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
  // Even if API 1 fails, API 2 and 3 will seamlessly map their data
  // ====================================================================
  const [res1, res2, res3] = await Promise.all([
    fetchApiData(API_URLS[1]),
    fetchApiData(API_URLS[2]),
    fetchApiData(API_URLS[3])
  ]);

  const combinedResponse = [];

  // 1. Process API 1 (SPORTS1)
  if (res1 && res1.raw) {
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
  }

  // 2. Process API 2 (SPORTS2)
  if (res2 && res2.raw) {
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
  }

  // 3. Process API 3 (SPORTS3)
  if (res3 && res3.raw) {
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
  }

  return res.status(200).json(combinedResponse);
}
