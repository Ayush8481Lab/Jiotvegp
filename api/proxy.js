export default async function handler(req, res) {
    // 1. Enable CORS so you can call this API from anywhere
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2. Extract the URL from the query string
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: "Missing 'url' query parameter." });
    }

    try {
        // Decode the URL in case it was encoded
        const targetUrl = decodeURIComponent(url);

        // 3. Fetch the target URL
        const response = await fetch(targetUrl, {
            headers: {
                // Mimic a real browser to prevent servers from blocking the proxy
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                error: `Failed to fetch target URL.`, 
                statusText: response.statusText 
            });
        }

        // 4. Extract text and force it into JSON format
        const textData = await response.text();

        try {
            // Try to parse it as JSON
            const jsonData = JSON.parse(textData);
            return res.status(200).json(jsonData);
        } catch (parseError) {
            // If the target returned raw text instead of JSON, wrap it in a JSON object so the response doesn't break
            return res.status(200).json({ 
                success: true, 
                data: textData 
            });
        }

    } catch (error) {
        // Handle server/network errors
        return res.status(500).json({ 
            error: "Internal Server Error", 
            details: error.message 
        });
    }
}
