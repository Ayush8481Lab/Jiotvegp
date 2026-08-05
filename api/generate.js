export default async function handler(req, res) {
    const { chunk = 1, start = 0, limit = 100 } = req.query;

    // --- CONFIGURATION ---
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Add this in Vercel Environment Variables
    const GITHUB_USER = "ayush8481lab";
    const GITHUB_REPO = "KuchuShow";
    
    // --- BRIGHT DATA WEB SCRAPER API ---
    const BRIGHT_DATA_API_KEY = "d9045ea8-8677-4bee-8aa0-1c9e255d64b7";
    const DATASET_ID = "gd_m6gjtfmeh43we6cqc";
    
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
        const istDateString = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });
        const todayDate = istDateString.split(',')[0].replace(/\//g, '-'); 
        const fileName = `Epg/${todayDate}-${chunk}.xml`;

        // 1. Fetch Channel List
        const chReq = await fetch("https://jtvxweb.pages.dev/jstr4web.json");
        const channelsData = await chReq.json();
        const channelsArray = Array.isArray(channelsData) ? channelsData : (channelsData.channels || []);

        const validChannels = channelsArray.map(c => ({
            name: c.name, logo: c.logo || c.logoUrl || "", jio_id: String(c.id || c.channel_id).trim()
        })).filter(c => c.jio_id && /^\d+$/.test(c.jio_id));

        const batch = validChannels.slice(parseInt(start), parseInt(start) + parseInt(limit));
        if (batch.length === 0) return res.status(200).json({ message: "No more channels to process." });

        // 2. PREPARE BULK URL ARRAY FOR BRIGHT DATA
        const inputPayload = batch.map(channel => ({
            url: `https://jiotvapi.cdn.jio.com/apis/v1.3/getepg/get?channel_id=${channel.jio_id}&offset=0`
        }));

        // 3. SEND SINGLE REQUEST TO BRIGHT DATA API
        const bdUrl = `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`;
        const bdRes = await fetch(bdUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${BRIGHT_DATA_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                input: inputPayload,
                limit_per_input: null
            })
        });

        if (!bdRes.ok) {
            const errText = await bdRes.text();
            throw new Error(`Bright Data API Error: ${bdRes.status} - ${errText}`);
        }

        // Get array of scraped JSON responses back
        const bdDataArray = await bdRes.json();
        const resultsArray = Array.isArray(bdDataArray) ? bdDataArray : [bdDataArray];

        let chunkXml = "";

        // 4. GENERATE XML EPG
        for (let i = 0; i < batch.length; i++) {
            const channel = batch[i];
            let finalLogo = channel.logo;
            if (finalLogo && !finalLogo.startsWith("http")) finalLogo = `https://jiotv.catchup.cdn.jio.com/dare_images/images/${finalLogo}`;

            chunkXml += `  <channel id="${channel.jio_id}">\n`;
            chunkXml += `    <display-name>${escapeXml(channel.name)}</display-name>\n`;
            if (finalLogo) chunkXml += `    <icon src="${escapeXml(finalLogo)}" />\n`;
            chunkXml += `  </channel>\n`;

            // Try matching the scraped result either by its array index or matching the URL
            let scrapedRecord = resultsArray[i]; 
            const targetUrlMatch = inputPayload[i].url;
            const matchedRecord = resultsArray.find(r => r.url === targetUrlMatch || (r.input && r.input.url === targetUrlMatch));
            if (matchedRecord) scrapedRecord = matchedRecord;

            // Depending on how your Bright Data Dataset template is set up, it might nest the JSON.
            // We search safely for the "epg" array property.
            let epgArray = null;
            if (scrapedRecord) {
                if (Array.isArray(scrapedRecord.epg)) epgArray = scrapedRecord.epg;
                else if (scrapedRecord.data && Array.isArray(scrapedRecord.data.epg)) epgArray = scrapedRecord.data.epg;
                else if (scrapedRecord.response && Array.isArray(scrapedRecord.response.epg)) epgArray = scrapedRecord.response.epg;
                else {
                    try {
                        const parsed = typeof scrapedRecord === 'string' ? JSON.parse(scrapedRecord) : null;
                        if (parsed && Array.isArray(parsed.epg)) epgArray = parsed.epg;
                    } catch(e) {}
                }
            }

            // Append programs to XML
            if (epgArray && Array.isArray(epgArray)) {
                epgArray.forEach(show => {
                    chunkXml += `  <programme start="${formatXmltvTime(show.startEpoch)}" stop="${formatXmltvTime(show.endEpoch)}" channel="${channel.jio_id}">\n`;
                    chunkXml += `    <title>${escapeXml(show.showname)}</title>\n`;
                    if (show.description) chunkXml += `    <desc>${escapeXml(show.description)}</desc>\n`;
                    chunkXml += `  </programme>\n`;
                });
            }
        }

        // 5. UPLOAD TO GITHUB 
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

        if (!ghResponse.ok) return res.status(500).json({ error: "Failed to upload to GitHub", details: await ghResponse.text() });

        return res.status(200).json({ 
            success: true, 
            message: `Chunk ${chunk} uploaded successfully via Scraper API.`,
            channels_processed: batch.length
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
