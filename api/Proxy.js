export const config = {
  runtime: 'edge', // Use Edge runtime for better performance
};

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    
    // The target domain you want to proxy to
    const TARGET_BASE_URL = 'https://api.example.com';
    
    // Optional: Remove the `/api/proxy` part from the path if needed
    // Example: /api/proxy/users?id=1 -> /users?id=1
    const targetPath = url.pathname.replace(/^\/api\/proxy/, '');
    const targetUrl = `${TARGET_BASE_URL}${targetPath}${url.search}`;

    // Clean up headers (remove the host header so the target server doesn't reject it)
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('referer');

    // Forward the request to the target
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'manual', // Handle redirects manually to prevent unwanted loops
    });

    // Return the response back to the client
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
