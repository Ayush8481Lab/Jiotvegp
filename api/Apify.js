export const config = {
    runtime: 'edge',
    regions: ['bom1'], // Vercel stays in Mumbai, India
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

    // 1. Extract AND Decode the URL (fixes the %3A%2F%2F issue)
    const rawTargetUrl = urlStr.substring(urlIndex + urlParamString.length);
    const targetUrl = decodeURIComponent(rawTargetUrl);
    
    // ==========================================
    // PASTE YOUR APIFY API URL BELOW
    // ==========================================
    const APIFY_API_URL = "https://api.apify.com/v2/actors/apify~web-scraper/runs?token=apify_api_3l37L64unZlCYdLTSSDDG52OalfaAu2ZUfnS&memory=256";

    try {
        // 2. Format the input EXACTLY how Apify wants it, with Indian region!
        const apifyInput = {
            // Fixes the Apify "startUrls is required" error
            startUrls: [{ url: targetUrl }], 
            
            // Forces Apify to use Indian IPs to bypass geo-blocks
            proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyCountry: "IN" 
            }
        };

        const apifyResponse = await fetch(APIFY_API_URL, {
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(apifyInput) 
        });

        const apifyData = await apifyResponse.json();

        return new Response(JSON.stringify({
            status: "success",
            target_url: targetUrl, // This will now show the clean link
            apify_response: apifyData
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
