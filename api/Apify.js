export const config = {
    runtime: 'edge',
    regions: ['bom1'], // Force Mumbai, India server
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

    const rawTargetUrl = urlStr.substring(urlIndex + urlParamString.length);
    const targetUrl = decodeURIComponent(rawTargetUrl);
    
    // ==========================================
    // PASTE ONLY YOUR APIFY API TOKEN BELOW
    // ==========================================
    const APIFY_TOKEN = "apify_api_3l37L64unZlCYdLTSSDDG52OalfaAu2ZUfnS";

    // We automatically use Cheerio Scraper, limit memory to 256MB to save free tier, 
    // and use the Sync endpoint to get the dataset data instantly.
    const APIFY_API_URL = `https://api.apify.com/v2/acts/apify~cheerio-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&memory=256`;

    try {
        const apifyInput = {
            startUrls: [{ url: targetUrl }],
            
            // Force Indian IPs via Apify
            proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyCountry: "IN" 
            },

            // Tell the scraper to accept the .mpd file (otherwise it ignores non-HTML files)
            additionalMimeTypes: ["*/*"],
            ignoreSslErrors: true,

            // This lightweight function grabs exactly what you want: The Headers
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

        // The data comes back as an array. We pull the first item (your headers).
        const resultData = Array.isArray(apifyData) && apifyData.length > 0 ? apifyData[0] : apifyData;

        return new Response(JSON.stringify({
            status: "success",
            target_url: targetUrl,
            apify_response: resultData // <--- Your headers will show up right here!
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
