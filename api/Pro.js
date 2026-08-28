// api/decrypt.js
import crypto from 'crypto';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, key, iv } = req.query;
  if (!data || !key || !iv) {
    return res.status(400).json({ error: 'Missing data, key, or iv query parameters' });
  }

  try {
    // 1. Convert inputs to Buffers
    const encryptedBuffer = Buffer.from(data, 'hex');
    const keyBuffer = Buffer.from(key, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');

    // 2. Determine AES algorithm based on key length
    let algorithm;
    if (keyBuffer.length === 16) algorithm = 'aes-128-cbc';
    else if (keyBuffer.length === 24) algorithm = 'aes-192-cbc';
    else if (keyBuffer.length === 32) algorithm = 'aes-256-cbc';
    else throw new Error(`Invalid key length: ${keyBuffer.length} bytes`);

    // 3. Decrypt
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, ivBuffer);
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);

    // 4. Parse JSON and return
    const jsonString = decrypted.toString('utf8');
    const jsonData = JSON.parse(jsonString);

    res.status(200).json(jsonData);
  } catch (error) {
    console.error('Decryption error:', error);
    res.status(500).json({ error: error.message });
  }
}
