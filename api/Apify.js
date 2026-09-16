// 1. This tells Vercel to use the Edge network (maximum free requests)
// and forces the server region to Mumbai, India (bom1) automatically!
export const config = {
    runtime: 'edge',
    regions: ['bom1'],
};

export default async function handler(req) {
    // 2. Extract the URL safely so we don't lose the token/hmac parameters
    const urlStr = req.url;
    const urlParamString = 'url=';
    const urlIndex = urlStr.indexOf(urlParamString);

    if (urlIndex === -1) {
        return new Response(JSON.stringify({ error: 'Please provide a URL parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const targetUrl = urlStr.substring(urlIndex + urlParamString.length);
    
    // ==========================================
    // 3. PASTE YOUR APIFY API URL BELOW
    // ==========================================
    const APIFY_API_URL = "https://api.apify.com/v2/actors/apify~web-scraper/runs?token=apify_api_3l37L64unZlCYdLTSSDDG52OalfaAu2ZUfnS";

    try {
        // 4. Forward the request to your Apify API
        const apifyResponse = await fetch(APIFY_API_URL, {
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json'
            },
            // Passing the target URL to Apify
            body: JSON.stringify({ url: targetUrl }) 
        });

        // 5. Read Apify's response
        const apifyData = await apifyResponse.json();

        // 6. Send the data back to your screen
        return new Response(JSON.stringify({
            status: "success",
            target_url: targetUrl,
            apify_response: apifyData
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        // Handle errors gracefully
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
                                            }
