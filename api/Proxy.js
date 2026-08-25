export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    // 1. Get the raw, full incoming URL from the request
    // Example: "https://your-app.vercel.app/api/proxy/https://target.com/api?a=1&b=2"
    const incomingUrl = req.url; 

    // 2. Find exactly where "/api/proxy/" ends to extract the target URL
    const proxyPrefix = '/api/proxy/';
    const prefixIndex = incomingUrl.indexOf(proxyPrefix);
    
    if (prefixIndex === -1) {
      return new Response(JSON.stringify({ error: "Invalid proxy route" }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 3. Extract everything after "/api/proxy/". This perfectly preserves ?, &, =, etc.
    let targetUrl = incomingUrl.substring(prefixIndex + proxyPrefix.length);

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing target URL. Example: /api/proxy/https://example.com?a=1" }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 4. Fix Vercel normalization bugs
    // Sometimes Vercel's router turns "https://" into "https:/" when passed in a path. This fixes it.
    if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
      targetUrl = targetUrl.replace('http:/', 'http://');
    } else if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
      targetUrl = targetUrl.replace('https:/', 'https://');
    } else if (!targetUrl.startsWith('http')) {
      // If the user forgot http://, add https:// by default
      targetUrl = 'https://' + targetUrl; 
    }

    // 5. Clean up headers so the target server doesn't block the request
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('referer');

    // 6. Fetch the target URL (GET request)
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      redirect: 'follow', // Follow redirects automatically
    });

    // 7. Add CORS headers so your frontend can read the JSON or Text data
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); 
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // 8. Stream the JSON/Text response back directly to the client
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: "Proxy Failed", message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
