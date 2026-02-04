/**
 * CDP API Helper with Ed25519 JWT Authentication
 * Works with Node.js 18+ using native crypto module
 */
const crypto = require('crypto');
const fs = require('fs');

// Load environment variables
function loadEnv() {
    if (fs.existsSync('.env.local')) {
        const envFile = fs.readFileSync('.env.local', 'utf8');
        envFile.split('\n').forEach(line => {
            const [k, ...v] = line.split('=');
            if (k && v.length && !process.env[k.trim()]) {
                process.env[k.trim()] = v.join('=').trim();
            }
        });
    }
}

loadEnv();

/**
 * Generate Ed25519 JWT for CDP API
 * The CDP API uses ES256 (ECDSA) or EdDSA (Ed25519) for signing
 */
function generateCDPJWT(apiKeyId, apiKeySecret, requestMethod, requestPath) {
    const header = {
        alg: 'ES256',
        typ: 'JWT',
        kid: apiKeyId
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: 'cdp',
        sub: apiKeyId,
        aud: ['cdp_service'],
        iat: now,
        exp: now + 120,
        uris: [`${requestMethod} api.cdp.coinbase.com${requestPath}`]
    };

    // Base64url encode
    const b64url = (obj) => Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    const headerB64 = b64url(header);
    const payloadB64 = b64url(payload);
    const dataToSign = `${headerB64}.${payloadB64}`;

    // For EC keys, parse the PEM format
    // CDP secrets are typically in PEM format for Ed25519/EC keys
    let privateKey;

    try {
        // Try to create key object from secret (handles PEM format)
        if (apiKeySecret.includes('-----BEGIN')) {
            privateKey = crypto.createPrivateKey(apiKeySecret);
        } else {
            // If it's a raw base64 key, wrap it in PEM format
            // This is for Ed25519 keys
            const keyBuffer = Buffer.from(apiKeySecret, 'base64');

            // Check if it's meant to be used directly
            privateKey = crypto.createPrivateKey({
                key: keyBuffer,
                format: 'der',
                type: 'pkcs8'
            });
        }

        const signature = crypto.sign(null, Buffer.from(dataToSign), privateKey);
        const signatureB64 = signature.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        return `${dataToSign}.${signatureB64}`;
    } catch (e) {
        throw new Error(`Failed to sign JWT: ${e.message}. Make sure your CDP_API_SECRET is a valid Ed25519 private key.`);
    }
}

/**
 * Query CDP SQL API
 */
async function queryCDP(sql) {
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_SECRET || process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
        throw new Error('CDP_API_KEY_ID and CDP_API_SECRET are required');
    }

    const requestMethod = 'POST';
    const requestPath = '/platform/v2/data/query/run';

    try {
        const jwtToken = generateCDPJWT(apiKeyId, apiKeySecret, requestMethod, requestPath);

        const response = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
            method: requestMethod,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`,
            },
            body: JSON.stringify({ sql }),
        });

        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || '5';
            throw new Error(`CDP_RATE_LIMITED:${parseInt(retryAfter) * 1000}`);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`CDP API Error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.data || result.result || [];
    } catch (e) {
        throw e;
    }
}

module.exports = { generateCDPJWT, queryCDP, loadEnv };
