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

    // 2. Use the specific Native Jio IPv6 Address
    const jioIpv6 = '2401:4900:471e:a2a2:0:6:fdde:c801';

    try {
        const targetUrl = decodeURIComponent(url);

        // 3. Fetch with Mobile Network & IPv6 Spoofing
        const response = await fetch(targetUrl, {
            headers: {
                // Exact JioTV Mobile User-Agent
                'User-Agent': 'plaYtv/7.0.8 (Linux;Android 11) ExoPlayerLib/2.11.8',
                
                // Android Internal Package ID
                'x-requested-with': 'com.jio.jioplay.tv',
                
                // Jio specific API headers
                'os': 'android',
                'devicetype': 'phone',
                'appkey': 'JioTV',
                'channelid': '0',
                'crmac': '00:00:00:00:00:00',
                
                // Standard mobile accept headers
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                
                // IPv6 Spoofing (Tricks the CDN into seeing a native Jio 5G/4G IP)
                'X-Forwarded-For': jioIpv6,
                'X-Real-IP': jioIpv6,
                'Client-IP': jioIpv6,
                'True-Client-IP': jioIpv6
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                error: "Failed to fetch target URL. Jio WAF Blocked the request.", 
                statusText: response.statusText,
                statusCode: response.status,
                spoofedIpUsed: jioIpv6
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
