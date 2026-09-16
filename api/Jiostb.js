// export const config = {
//     runtime: 'edge',
//     regions: ['bom1'], // Keep Vercel in India
// };

export default async function handler(req) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed. Please use POST.' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    let urls;
    try {
        const body = await req.json();
        urls = body.urls;
        if (!Array.isArray(urls) || urls.length === 0) {
            throw new Error('Request body must contain a non-empty "urls" array.');
        }
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body. Expected { "urls": ["..."] }.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // ==========================================
    // PASTE ONLY YOUR APIFY API TOKEN BELOW
    // ==========================================
    const APIFY_TOKEN = "apify_api_3l37L64unZlCYdLTSSDDG52OalfaAu2ZUfnS";

    // Using the run-sync endpoint to wait for the batch to complete.
    // Memory is set to 4096 MB (4 GB) to handle the high concurrency.
    const APIFY_API_URL = `https://api.apify.com/v2/acts/apify~cheerio-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&memory=4096`;

    try {
        // 2. Map the input URLs to the format Apify expects for a batch.
        // The "HEAD" method is used for lightweight requests.
        const startUrls = urls.map(url => ({
            url: url,
            method: "HEAD" 
        }));

        const apifyInput = {
            // Pass the entire batch of URLs to a single run.
            startUrls: startUrls,
            
            // Force Apify to use Indian RESIDENTIAL Proxies.
            proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyGroups: ["RESIDENTIAL"], 
                apifyProxyCountry: "IN"            
            },

            // *** PERFORMANCE TUNING ***
            maxConcurrency: 50,        // Process up to 50 URLs at the same time[reference:1].
            maxRequestsPerCrawl: 0,    // 0 means "no limit" on the total number of requests[reference:2].
            
            additionalMimeTypes: ["*/*"],
            ignoreSslErrors: true,
            
            // Capture the status code and headers from each request.
            pageFunction: `async function pageFunction(context) {
                return {
                    url: context.request.url,
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

        // 3. Return the array of results from the batch run.
        return new Response(JSON.stringify({
            status: "success",
            batch_size: urls.length,
            results: apifyData
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
