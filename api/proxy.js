export default async function handler(req, res) {
    // 1. Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: "Missing 'url' query parameter." });
    }

    try {
        const targetUrl = decodeURIComponent(url);
        
        // Extract the base domain to use as fake Origin and Referer
        const urlObj = new URL(targetUrl);
        const baseOrigin = urlObj.origin;

        // 2. Fetch with Advanced Browser Spoofing
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
                'Referer': baseOrigin + '/',
                'Origin': baseOrigin,
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                error: "Failed to fetch target URL.", 
                statusText: response.statusText,
                statusCode: response.status
            });
        }

        const textData = await response.text();

        try {
            const jsonData = JSON.parse(textData);
            return res.status(200).json(jsonData);
        } catch (parseError) {
            return res.status(200).json({ success: true, data: textData });
        }

    } catch (error) {
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}
