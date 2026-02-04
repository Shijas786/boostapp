import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { SignJWT, importJWK } from 'jose';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

async function generateCDPJWT(apiKeyId, apiSecret) {
    const keyBuffer = Buffer.from(apiSecret, 'base64');
    const toBase64Url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const d = toBase64Url(keyBuffer.subarray(0, 32));
    const x = toBase64Url(keyBuffer.subarray(32, 64));
    const jwk = { kty: 'OKP', crv: 'Ed25519', d, x, kid: apiKeyId };
    const privateKey = await importJWK(jwk, 'EdDSA');
    const uri = `POST api.cdp.coinbase.com/platform/v2/data/query/run`;
    return await new SignJWT({
        iss: 'cdp',
        nbf: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 120,
        sub: apiKeyId,
        uris: [uri]
    }).setProtectedHeader({ alg: 'EdDSA', kid: apiKeyId, typ: 'JWT' }).sign(privateKey);
}

async function main() {
    console.log('\n🔍 Testing CDP for LATEST transfers...\n');

    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const jwtToken = await generateCDPJWT(env.CDP_API_KEY_ID, env.CDP_API_SECRET);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    const sql = `
        SELECT 
            block_timestamp,
            transaction_hash
        FROM base.events
        WHERE event_name = 'Transfer'
        AND block_timestamp > '${oneHourAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 5
    `;

    const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ sql })
    });

    const data = await res.json();
    if (!data.result) {
        console.log('Error/No Result:', JSON.stringify(data, null, 2));
    } else {
        console.log('Absolute Latest Base Transfers:', JSON.stringify(data.result, null, 2));
    }
}

main().catch(console.error);
