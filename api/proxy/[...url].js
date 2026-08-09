// api/proxy/[...url].js

// Increase Vercel timeout to 60 seconds (Hobby tier maximum) to allow Render to wake up
export const maxDuration = 60; 

export default async function handler(req, res) {
    // 1. Extract the target URL from the incoming request
    // req.url will look like: /api/proxy/https://renderproject...
    let targetUrl = req.url.replace(/^\/api\/proxy\//, '');

    // 2. Fix Vercel's automatic slash stripping 
    // Vercel sometimes changes "https://" to "https:/" in the URL path. This fixes it.
    if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
        targetUrl = targetUrl.replace('https:/', 'https://');
    } else if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
        targetUrl = targetUrl.replace('http:/', 'http://');
    }

    if (!targetUrl) {
        return res.status(400).json({ error: "No target URL provided in the path." });
    }

    try {
        // 3. Trigger the Render job
        const response = await fetch(targetUrl, {
            method: 'GET', // Or use req.method if you also use POST
        });

        // 4. Consume the massive response from Render, but DO NOT send it back
        await response.text(); 

        // 5. Send a tiny, clean JSON response back to cron-job.org
        return res.status(200).json({
            success: true,
            message: "Render job triggered and finished successfully.",
            renderStatusCode: response.status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Proxy encountered an error connecting to Render.",
            error: error.message
        });
    }
}
