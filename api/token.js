import https from 'https';

// We remain in the Eastern realm to avoid the gaze of geo-blockers
export const config = {
  regions: ['bom1'],
};

export default async function handler(req, res) {
  // Opening the gates
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'This path is forbidden.' });
  }

  try {
    // We bind the fetching logic to a Promise, diving into raw streams
    const token = await new Promise((resolve, reject) => {
      
      // The Dark Alchemy: Forging the request options
      const options = {
        hostname: 'www.zee5.com',
        port: 443,
        path: '/live-tv/zee-news/0-9-zeenews',
        method: 'GET',
        
        // Here lies the magic. We mutate the Agent's ciphers to hide the Node.js TLS signature.
        agent: new https.Agent({
          ciphers: 'TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
          honorCipherOrder: true,
          minVersion: 'TLSv1.2'
        }),

        // We wear the skin of a Chrome browser flawlessly
        headers: {
          'Host': 'www.zee5.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity', // We demand uncompressed text to avoid zlib curses
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"'
        }
      };

      // Sending the disguised request into the abyss
      const request = https.request(options, (response) => {
        if (response.statusCode === 403) {
          reject(new Error(`The Wardens saw through our disguise. Status: 403`));
          return;
        }

        let data = '';
        
        // Gathering the fragments of the HTML parchment
        response.on('data', (chunk) => {
          data += chunk;
        });

        // When the transmission ceases, we search for the artifact
        response.on('end', () => {
          const tokenRegex = /"platformToken":"(eyJ[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+)"/;
          const match = data.match(tokenRegex);
          
          if (match && match[1]) {
            resolve(match[1]);
          } else {
            reject(new Error('The parchment was secured, but the token was stripped from its ink.'));
          }
        });
      });

      request.on('error', (err) => {
        reject(new Error(`The connection was severed: ${err.message}`));
      });

      // Seal the spell and execute
      request.end();
    });

    // If we survive, return the prize
    return res.status(200).json({ 
      success: true, 
      token: token 
    });

  } catch (error) {
    console.error('The abyss consumed the request:', error.message);
    return res.status(error.message.includes('403') ? 403 : 500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
