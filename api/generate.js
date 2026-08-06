export default async function handler(req, res) {
    // Added offset parameter so you can control it from the API url (e.g. ?offset=1)
    const { chunk = 1, start = 0, limit = 160, offset = 0 } = req.query;

    // --- CONFIGURATION ---
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Vercel Environment Variables
    const GITHUB_USER = "ayush8481lab";
    const GITHUB_REPO = "KuchuShow";
    
    // 40 ScraperAPI Keys Provided
    const SCRAPER_KEYS = [
        "8349f5fdab8a553fb89a6653f1b56660", "2a44d87e2cf38e7a8bd06a8a3cdef8cb",
        "10f48295a1791a2239881caf36735c1c", "98d515b0c64b337a9669f47d5e47c3c9",
        "46259507fcbfa2ebaef781828daa2215", "1df83eada3a9bd0235a611e97ebafd61",
        "7c02d837f41c08899f78fa2fb28d45a3", "3165c8fb528085e8a5f338d95860c8c9",
        "525face38db5c7b977b1390ad8c461c3", "a88422bd9f17966c9c6a0f6f3f5a92a3",
        "ad942f0bbbfb4eea726f67fb63e26234", "1d769870af4a8a5085791f4cee9d2426",
        "cd0a4c97b738ef46ceac519fa22136dd", "2f384c76edb42acdded27d129e8d09d5",
        "fcca3f470620002614194b3e12acb385", "7817a900f43d685102a6b82fd406945c",
        "e964417bee5220f4163647d23d5bcd6e", "44e7e337ce8d5d571799f8ef8e8af65c",
        "7edb16618ffc73f976a407301a42d447", "2f8ac4b5040be4ce3ec6607f8b301ce0",
        "18f8df88e2f43405640c3d790424de65", "e9208533ec5cdc69fc577435d09591e7",
        "8d9c34d1d8fa1a747b10fd7fbb972fdb", "4057102224677ac7ce595897cb6344b0",
        "6412370a916316a7c26fc225fbfc0f1e", "8b0a0b26d0ddf7e1ae56f0d21764bab2",
        "314c277af2dc5768e8f0a1120d861fb4", "d75982bd04e32a1cce34950723dcf6bf",
        "5da98ea3c39a8a02825cdea80c136c9d", "ab9aae3c018c1a51b1c4ae30b3a71529",
        "c1148d79a5444d34f5fdba0ffecb6868", "f4aefc202d7eaf46881f6e9197df913a",
        "91abe2dbb5fd21cb3e2fdf54ee46a735", "9216ad1845c11442e59d4f185b1ae640",
        "bfb08ca10f4299b292d9944127b6cf3f", "29a1775866177f1a711a4ec42cc61aea",
        "5d1046737b9fc6ccc36c0d48a601b85d", "85f58709712a420f495dbab6f1693330",
        "dfece35805080536808468a784fcd631", "335259612b2f462a99b8666d4863e675"
    ];

    if (!GITHUB_TOKEN) return res.status(500).json({ error: "Missing GITHUB_TOKEN" });

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
        // 1. Fetch Channel List
        const chReq = await fetch("https://jtvxweb.pages.dev/jstr4web.json");
        const channelsData = await chReq.json();
        const channelsArray = Array.isArray(channelsData) ? channelsData : (channelsData.channels || []);

        const validChannels = channelsArray.map(c => ({
            name: c.name, logo: c.logo || c.logoUrl || "", jio_id: String(c.id || c.channel_id).trim()
        })).filter(c => c.jio_id && /^\d+$/.test(c.jio_id));

        const batch = validChannels.slice(parseInt(start), parseInt(start) + parseInt(limit));
        if (batch.length === 0) return res.status(200).json({ message: "No more channels to process." });

        // 2. Fetch EPG for this batch concurrently with Rotated ScraperAPI keys
        const fetchPromises = batch.map(async (channel, index) => {
            // Distribute load equally across all 40 keys (max 4 per key if limit=160)
            const apiKey = SCRAPER_KEYS[index % SCRAPER_KEYS.length];
            
            // Jio API Target with dynamic offset
            const targetUrl = `https://jiotvapi.cdn.jio.com/apis/v1.3/getepg/get?channel_id=${channel.jio_id}&offset=${offset}`;
            const scraperApiUrl = `https://api.scraperapi.com/?api_key=${apiKey}&country_code=in&url=${encodeURIComponent(targetUrl)}`;
            
            try {
                const epgRes = await fetch(scraperApiUrl, { timeout: 15000 }); // 15 sec timeout per request to prevent hanging
                if (epgRes.ok) {
                    const data = await epgRes.json();
                    return { channel, data };
                }
            } catch (err) {
                // Silently ignore failed connections, will skip this channel's EPG
            }
            return { channel, data: null };
        });

        // Await all 160 simultaneous requests
        const results = await Promise.all(fetchPromises);

        let chunkXml = "";
        let dynamicServerDate = null;

        // 3. Process Responses and generate XML
        results.forEach(({ channel, data }) => {
            let finalLogo = channel.logo;
            if (finalLogo && !finalLogo.startsWith("http")) finalLogo = `https://jiotv.catchup.cdn.jio.com/dare_images/images/${finalLogo}`;

            chunkXml += `  <channel id="${channel.jio_id}">\n`;
            chunkXml += `    <display-name>${escapeXml(channel.name)}</display-name>\n`;
            if (finalLogo) chunkXml += `    <icon src="${escapeXml(finalLogo)}" />\n`;
            chunkXml += `  </channel>\n`;

            if (data && data.epg && Array.isArray(data.epg)) {
                data.epg.forEach(show => {
                    // Extract Date from the first valid show response (e.g. "2026-08-06T00:00:00+05:30")
                    if (!dynamicServerDate && show.serverDate) {
                        dynamicServerDate = show.serverDate.substring(0, 10); // Takes only "YYYY-MM-DD"
                    }

                    chunkXml += `  <programme start="${formatXmltvTime(show.startEpoch)}" stop="${formatXmltvTime(show.endEpoch)}" channel="${channel.jio_id}">\n`;
                    chunkXml += `    <title>${escapeXml(show.showname)}</title>\n`;
                    if (show.description) chunkXml += `    <desc>${escapeXml(show.description)}</desc>\n`;
                    chunkXml += `  </programme>\n`;
                });
            }
        });

        // 4. Fallback date just in case ALL 160 requests failed (preventing a crash)
        if (!dynamicServerDate) {
            const istDate = new Date(new Date().getTime() + 5.5 * 3600000);
            dynamicServerDate = istDate.toISOString().substring(0, 10);
        }

        // Generate Filename dynamically based on Jio server response
        const fileName = `Epg/${dynamicServerDate}-${chunk}.xml`;

        // 5. Upload to GitHub
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
                message: `Auto-upload EPG Chunk ${chunk} for ${dynamicServerDate}`,
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
            channels_processed: batch.length,
            file_date: dynamicServerDate,
            offset_used: offset
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
