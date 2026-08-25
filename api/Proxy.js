export const config = {
  runtime: 'edge', // Fast, standalone
};

export default async function handler(req) {
  try {
    const urlObj = new URL(req.url);
    
    // Get the raw query string (e.g., "?url=https://api.com/data?a=1&b=2")
    const searchString = urlObj.search; 

    // Check if it contains our required "?url=" parameter
    if (!searchString.startsWith('?url=')) {
      return new Response("Missing target URL. Usage: /api/proxy?url=https://example.com", { status: 400 });
    }

    // Extract the exact target URL by removing the "?url=" part (first 5 characters)
    // This perfectly preserves all other ?, &, and = symbols!
    let targetUrl = searchString.substring(5);

    // Clean up headers (prevent target server from rejecting request)
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('referer');

    // Fetch the real API
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'follow', 
    });

    // Force CORS allow so your frontend doesn't get blocked
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); 
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    // Return data
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
