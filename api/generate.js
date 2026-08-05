export default async function handler(req, res) {
    const { chunk = 1, start = 0, limit = 100 } = req.query;

    // --- CONFIGURATION ---
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Add this in Vercel Environment Variables
    const GITHUB_USER = "ayush8481lab";
    const GITHUB_REPO = "KuchuShow";
    
    if (!GITHUB_TOKEN) {
        return res.status(500).json({ error: "Missing GITHUB_TOKEN" });
    }

    // Helper functions
    const formatXmltvTime = (epoch) => {
        const d = new Date(epoch);
        const tzOffset = 5.5 * 60 * 60 * 1000; 
        const ist = new Date(d.getTime() + tzOffset);
        const yyyy = ist.getUTCFullYear();
        const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(ist.getUTCDate()).padStart(2, '0');
        const hh = String(ist.getUTCHours()).padStart(2, '0');
        const min = String(ist.getUTCMinutes()).padStart(2, '0');
        const ss = String(ist.getUTCSeconds()).padStart(2, '0');
        return `${yyyy}${mm}${dd}${hh}${min}${ss} +0530`;
    };

    const escapeXml = (unsafe) => {
        if (!unsafe) return "";
        return unsafe.toString().replace(/[<>&'"]/g, c => {
            switch (c) { case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;'; case '\'': return '&apos;'; case '"': return '&quot;'; }
        });
    };

    try {
        // 1. Get Current Date (DD-MM-YYYY)
        const istDateString = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });
        const todayDate = istDateString.split(',')[0].replace(/\//g, '-'); 
        const fileName = `Epg/${todayDate}-${chunk}.xml`;

        // 2. Fetch Channel List
        const chReq = await fetch("https://jtvxweb.pages.dev/jstr4web.json");
        const channelsData = await chReq.json();
        const channelsArray = Array.isArray(channelsData) ? channelsData : (channelsData.channels || []);

        const validChannels = channelsArray.map(c => ({
            name: c.name, logo: c.logo || c.logoUrl || "", jio_id: String(c.id || c.channel_id).trim()
        })).filter(c => c.jio_id && /^\d+$/.test(c.jio_id));

        // 3. Slice the batch based on API parameters (e.g., channels 0 to 100)
        const batch = validChannels.slice(parseInt(start), parseInt(start) + parseInt(limit));
        if (batch.length === 0) return res.status(200).json({ message: "No more channels to process." });

        let chunkXml = "";

        // 4. Fetch EPG for this batch concurrently
        const fetchPromises = batch.map(async (channel) => {
            let chXml = "";
            let finalLogo = channel.logo;
            if (finalLogo && !finalLogo.startsWith("http")) finalLogo = `https://jiotv.catchup.cdn.jio.com/dare_images/images/${finalLogo}`;

            chXml += `  <channel id="${channel.jio_id}">\n`;
            chXml += `    <display-name>${escapeXml(channel.name)}</display-name>\n`;
            if (finalLogo) chXml += `    <icon src="${escapeXml(finalLogo)}" />\n`;
            chXml += `  </channel>\n`;

            try {
                // Fetching ONLY Today (offset=0) to keep chunk size small and fast
                const targetUrl = `https://jiotvapi.cdn.jio.com/apis/v1.3/getepg/get?channel_id=${channel.jio_id}&offset=0`;
                const epgRes = await fetch(targetUrl);
                if (epgRes.ok) {
                    const data = await epgRes.json();
                    if (data.epg && Array.isArray(data.epg)) {
                        data.epg.forEach(show => {
                            chXml += `  <programme start="${formatXmltvTime(show.startEpoch)}" stop="${formatXmltvTime(show.endEpoch)}" channel="${channel.jio_id}">\n`;
                            chXml += `    <title>${escapeXml(show.showname)}</title>\n`;
                            if (show.description) chXml += `    <desc>${escapeXml(show.description)}</desc>\n`;
                            chXml += `  </programme>\n`;
                        });
                    }
                }
            } catch (err) {
                // Silently ignore failed channels
            }
            return chXml;
        });

        const completedChannels = await Promise.all(fetchPromises);
        chunkXml = completedChannels.join("");

        // 5. Upload to GitHub via REST API
        // Base64 encode the string for GitHub
        const contentEncoded = Buffer.from(chunkXml, 'utf-8').toString('base64');
        
        const githubApiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${fileName}`;
        
        const ghResponse = await fetch(githubApiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Content-Type": "application/json",
                "User-Agent": "Vercel-EPG-Generator"
            },
            body: JSON.stringify({
                message: `Auto-upload EPG Chunk ${chunk} for ${todayDate}`,
                content: contentEncoded
            })
        });

        if (!ghResponse.ok) {
            const errLog = await ghResponse.text();
            return res.status(500).json({ error: "Failed to upload to GitHub", details: errLog });
        }

        return res.status(200).json({ 
            success: true, 
            message: `Chunk ${chunk} uploaded to ${fileName} successfully.`,
            channels_processed: batch.length
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
