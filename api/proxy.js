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

        // 2. Fetch with Android App Spoofing
        const response = await fetch(targetUrl, {
            headers: {
                // Mimic the JioTV Android Application
                'User-Agent': 'JioTV/7.1.3 (Linux;Android 12) ExoPlayer/2.14.2',
                // Standard Android network client
                'X-Requested-With': 'com.jio.jioplay.tv',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'Keep-Alive',
                // Add device OS type for API validation
                'os': 'android'
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
            // Try to parse as JSON
            const jsonData = JSON.parse(textData);
            return res.status(200).json(jsonData);
        } catch (parseError) {
            // Fallback for raw text
            return res.status(200).json({ success: true, data: textData });
        }

    } catch (error) {
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}
