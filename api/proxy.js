// api/proxy.js
export const config = {
  runtime: 'edge', // This is crucial for streaming
};

export default async function handler(request) {
  // 1. Extract the target URL from the query string
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing "url" query parameter', { status: 400 });
  }

  // 2. Prepare to forward the request
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete('host'); // Avoid sending the original host header

  try {
    // 3. Fetch the target resource from the server
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: 'follow',
    });

    // 4. Create a new response with CORS headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*'); // Or your specific origin
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    // 5. Return the streamed response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
}
