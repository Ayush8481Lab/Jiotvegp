export const config = {
    runtime: 'edge',
    regions: ['bom1'],
};

export default async function handler(req) {
    let urls = [];

    // Handle GET: single URL via ?url=...
    if (req.method === 'GET') {
        const { searchParams } = new URL(req.url);
        const singleUrl = searchParams.get('url');
        if (!singleUrl) {
            return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        urls = [singleUrl];
    }
    // Handle POST: array of URLs in JSON body
    else if (req.method === 'POST') {
        try {
            const body = await req.json();
            if (!Array.isArray(body.urls) || body.urls.length === 0) {
                throw new Error('Body must contain a non-empty "urls" array.');
            }
            urls = body.urls;
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    // Reject everything else
    else {
        return new Response(JSON.stringify({ error: 'Method not allowed. Use GET or POST.' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    if (!APIFY_TOKEN) {
        return new Response(JSON.stringify({ error: 'APIFY_TOKEN not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const APIFY_API_URL = `https://api.apify.com/v2/acts/apify~cheerio-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&memory=4096`;

    try {
        const startUrls = urls.map(url => ({ url, method: "HEAD" }));

        const apifyInput = {
            startUrls,
            proxyConfiguration: {
                useApifyProxy: true,
                apifyProxyGroups: ["RESIDENTIAL"],
                apifyProxyCountry: "IN"
            },
            maxConcurrency: 50,
            maxRequestsPerCrawl: 0,
            additionalMimeTypes: ["*/*"],
            ignoreSslErrors: true,
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
