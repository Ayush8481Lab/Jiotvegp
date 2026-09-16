export const config = {
    // 1. We use the Edge network (Cloudflare) instead of standard Datacenters (AWS)
    runtime: 'edge',
    // 2. We force the Cloudflare node in Mumbai, India
    regions: ['bom1'], 
};

export default async function handler(req) {
    const urlStr = req.url;
    const urlParamString = 'url=';
    const urlIndex = urlStr.indexOf(urlParamString);

    if (urlIndex === -1) {
        return new Response(JSON.stringify({ error: 'Please provide a URL parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Decode the URL safely
    const rawTargetUrl = urlStr.substring(urlIndex + urlParamString.length);
    const targetUrl = decodeURIComponent(rawTargetUrl);

    try {
        // 3. Your idea: Use HEAD request to ignore the video body and get only headers
        const response = await fetch(targetUrl, {
            method: 'HEAD',
            headers: {
                // Disguise as a normal Windows Chrome browser
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Connection': 'keep-alive',
                
                // 4. IP SPOOFING: We inject headers telling Jio's CDN that the request 
                // is actually coming from a real Jio 4G Mobile IP in India.
                'X-Forwarded-For': '49.36.15.15', // Real Jio IP range
                'X-Real-IP': '49.36.15.15',
                'True-Client-IP': '49.36.15.15'
            }
        });

        // 5. Extract all headers
        const headers = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // 6. Send the captured headers back to your screen!
        return new Response(JSON.stringify({
            status: response.status,
            target_url: targetUrl,
            captured_headers: headers
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
