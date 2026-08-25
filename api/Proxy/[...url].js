export const config = {
  runtime: 'edge', // Standalone, fast, no Node.js packages needed
};

export default async function handler(req) {
  try {
    // 1. Find exactly where "/api/proxy/" ends in the requested URL
    const proxyPrefix = '/api/proxy/';
    const prefixIndex = req.url.indexOf(proxyPrefix);
    
    if (prefixIndex === -1) {
      return new Response("Invalid proxy route", { status: 400 });
    }

    // 2. Extract the target URL, preserving all ?, &, and = symbols
    let targetUrl = req.url.substring(prefixIndex + proxyPrefix.length);

    if (!targetUrl) {
      return new Response("Missing target URL. Usage: /api/proxy/https://example.com", { status: 400 });
    }

    // 3. Fix Vercel's URL normalizer (it sometimes changes https:// to https:/)
    targetUrl = targetUrl.replace(/^(https?):\/+/, '$1://');
    
    // Default to https if no protocol is provided
    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl; 
    }

    // 4. Copy headers but remove host/referer to prevent blocking
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('referer');

    // 5. Fetch the target URL
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'follow', // Automatically follow redirects
    });

    // 6. Set CORS headers so your frontend can access the response
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); 
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    // 7. Return the data directly to the client
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
    
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
}
