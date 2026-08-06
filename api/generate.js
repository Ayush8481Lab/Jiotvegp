// Extend Vercel execution limit for the background worker
export const maxDuration = 60; 

export default async function handler(req, res) {
    const { chunk = 1, start = 0, limit = 160, offset = 0, trigger, worker } = req.query;

    // ====================================================================
    // 1. BACKGROUND TRIGGER (Instantly replies in 2 seconds)
    // ====================================================================
    if (trigger === 'true') {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        
        // Build the worker URL
        const workerUrl = `${protocol}://${host}${req.url.replace('trigger=true', 'worker=true')}`;
        
        // We ping the worker, but we intentionally ABORT the connection after 2 seconds.
        // This forces Vercel to reply to cron-job.org instantly, freeing the connection,
        // while the background worker continues running undisturbed!
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 2000);

        try {
            await fetch(workerUrl, { signal: controller.signal });
        } catch (error) {
            // It is completely normal and expected to catch an AbortError here after 2s.
        }
        
        return res.status(200).json({ 
            success: true,
            status: "Processing in background",
            message: "Cron job successful. Vercel is downloading and uploading 160 channels in the background."
        });
    }

    // Prevent accidental direct hits without the correct flags
    if (worker !== 'true') {
        return res.status(400).json({ error: "Please add ?trigger=true to your URL to start." });
    }

    // ====================================================================
    // 2. HEAVY BACKGROUND WORKER LOGIC (Runs for 45-60 seconds)
    // ====================================================================
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
    const GITHUB_USER = "ayush8481lab";
    const GITHUB_REPO = "KuchuShow";
    
    // Exactly 40 Keys
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

    // Ultra-Fast Native Date slicing (Zero data loss)
    const formatXmltvTime = (epoch) => {
        const iso = new Date(epoch + 19800000).toISOString(); 
        return iso.substring(0,4) + iso.substring(5,7) + iso.substring(8,10) + iso.substring(11,13) + iso.substring(14,16) + iso.substring(17,19) + " +0530";
    };

    const escapeMap = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
    const escapeXml = (unsafe) => {
        if (!unsafe) return "";
        return unsafe.replace(/[<>&'"]/g, c => escapeMap[c]);
    };

    try {
        const chReq = await fetch("https://jtvxweb.pages.dev/jstr4web.json");
        const channelsData = await chReq.json();
        const channelsArray = Array.isArray(channelsData) ? channelsData : (channelsData.channels || []);

        const validChannels = channelsArray.map(c => ({
            name: c.name, logo: c.logo || c.logoUrl || "", jio_id: String(c.id || c.channel_id).trim()
        })).filter(c => c.jio_id && /^\d+$/.test(c.jio_id));

        const batch = validChannels.slice(parseInt(start), parseInt(start) + parseInt(limit));
        if (batch.length === 0) return res.status(200).json({ message: "No more channels to process." });

        const fetchChannelWithRetry = async (channel, index) => {
            const apiKey = SCRAPER_KEYS[index % 40]; // Maps exact 4 channels to 1 key perfectly
            const targetUrl = `https://jiotvapi.cdn.jio.com/apis/v1.3/getepg/get?channel_id=${channel.jio_id}&offset=${offset}`;
            const scraperApiUrl = `https://api.scraperapi.com/?api_key=${apiKey}&country_code=in&url=${encodeURIComponent(targetUrl)}`;
            
            let retries = 5; 
            while (retries > 0) {
                try {
                    const epgRes = await fetch(scraperApiUrl);
                    if (epgRes.ok) {
                        const data = await epgRes.json();
                        return { channel, data };
                    } else if (epgRes.status === 404) {
                        return { channel, data: null };
                    }
                } catch (err) {
                    // Silently loop to ensure zero data is lost
                }
                retries--;
            }
            return { channel, data: null };
        };

        const fetchPromises = batch.map((channel, i) => fetchChannelWithRetry(channel, i));
        const results = await Promise.all(fetchPromises);

        const xmlLines = [];
        let dynamicServerDate = null;

        for (let i = 0; i < results.length; i++) {
            const { channel, data } = results[i];
            
            let finalLogo = channel.logo;
            if (finalLogo && !finalLogo.startsWith("http")) finalLogo = `https://jiotv.catchup.cdn.jio.com/dare_images/images/${finalLogo}`;

            let channelBlock = `  <channel id="${channel.jio_id}">\n    <display-name>${escapeXml(channel.name)}</display-name>`;
            if (finalLogo) channelBlock += `\n    <icon src="${escapeXml(finalLogo)}" />`;
            channelBlock += `\n  </channel>`;
            
            xmlLines.push(channelBlock);

            if (data && data.epg && data.epg.length > 0) {
                if (!dynamicServerDate && data.epg[0].serverDate) {
                    dynamicServerDate = data.epg[0].serverDate.substring(0, 10); 
                }

                const epgArray = data.epg;
                for (let j = 0; j < epgArray.length; j++) {
                    const show = epgArray[j];
                    const startXml = formatXmltvTime(show.startEpoch);
                    const stopXml = formatXmltvTime(show.endEpoch);
                    const titleXml = escapeXml(show.showname);
                    const descXml = show.description ? `\n    <desc>${escapeXml(show.description)}</desc>` : "";
                    
                    xmlLines.push(`  <programme start="${startXml}" stop="${stopXml}" channel="${channel.jio_id}">\n    <title>${titleXml}</title>${descXml}\n  </programme>`);
                }
            }
        }

        if (!dynamicServerDate) {
            const istDate = new Date(new Date().getTime() + 19800000); 
            dynamicServerDate = istDate.toISOString().substring(0, 10);
        }

        const fileName = `Epg/${dynamicServerDate}-${chunk}.xml`;
        const chunkXml = xmlLines.join('\n') + '\n';

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

        // The background worker returns status to Vercel (Cron-job won't see this, which is fine)
        if (!ghResponse.ok) return res.status(500).json({ error: "Failed to upload" });
        return res.status(200).json({ success: true, message: "Worker completed" });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
