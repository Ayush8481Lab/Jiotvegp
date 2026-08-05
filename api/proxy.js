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

    // Generate a random Jio Residential IP (Range: 49.37.x.x) to trick the WAF
    const fakeJioIp = `49.37.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    try {
        const targetUrl = decodeURIComponent(url);

        // 2. Fetch with Mobile Network & App Spoofing
        const response = await fetch(targetUrl, {
            headers: {
                // 1. Exact JioTV Mobile User-Agent
                'User-Agent': 'plaYtv/7.0.8 (Linux;Android 11) ExoPlayerLib/2.11.8',
                
                // 2. Android Internal Package ID
                'x-requested-with': 'com.jio.jioplay.tv',
                
                // 3. Jio specific API headers
                'os': 'android',
                'devicetype': 'phone',
                'appkey': 'JioTV',
                'channelid': '0',
                'crmac': '00:00:00:00:00:00',
                
                // 4. Standard mobile accept headers
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                
                // 5. IP Spoofing (Tricks the CDN into seeing a residential Jio IP instead of Vercel's AWS IP)
                'X-Forwarded-For': fakeJioIp,
                'X-Real-IP': fakeJioIp,
                'Client-IP': fakeJioIp
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                error: "Failed to fetch target URL. Jio WAF Blocked the request.", 
                statusText: response.statusText,
                statusCode: response.status,
                spoofedIpUsed: fakeJioIp
            });
        }

        const textData = await response.text();

        try {
            // Parse as JSON
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
