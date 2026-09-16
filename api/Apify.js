export const config = {
    runtime: 'edge',
    regions: ['bom1'], // Keep Vercel in India
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

    // Decode URL properly
    const rawTargetUrl = urlStr.substring(urlIndex + urlParamString.length);
    const targetUrl = decodeURIComponent(rawTargetUrl);
    
    // ==========================================
    // PASTE ONLY YOUR APIFY API TOKEN BELOW
    // ==========================================
    const APIFY_TOKEN = "apify_api_3l37L64unZlCYdLTSSDDG52OalfaAu2ZUfnS";

    const APIFY_API_URL = `https://api.apify.com/v2/acts/apify~cheerio-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&memory=256`;

    try {
        const apifyInput = {
            // Your brilliant suggestion: Use HEAD request
            startUrls: [{ 
                url: targetUrl,
                method: "HEAD" 
            }],
            
            // THE FIX: Force Apify to use Indian RESIDENTIAL Proxies. 
            // This bypasses the 407 Error and easily defeats Jio's block.
            proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyGroups: ["RESIDENTIAL"], // <--- This is the magic key
                apifyProxyCountry: "IN"            // <--- Country set back to India
            },

            additionalMimeTypes: ["*/*"],
            ignoreSslErrors: true,
            
            // Capture Headers 
            pageFunction: `async function pageFunction(context) {
                return {
                    status: context.response.statusCode,
                    headers: context.response.headers
                };
            }`
        };

        const apifyResponse = await fetch(APIFY_API_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apifyInput) 
        });

        const apifyData = await apifyResponse.json();

        // Extract the result
        const resultData = Array.isArray(apifyData) && apifyData.length > 0 ? apifyData[0] : apifyData;

        // Send back the captured headers
        return new Response(JSON.stringify({
            status: "success",
            target_url: targetUrl,
            apify_response: resultData
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
