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
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const jwtToken = await generateCDPJWT(env.CDP_API_KEY_ID, env.CDP_API_SECRET);

    console.log('Testing for Zora Factory events...');
    const sql = "SELECT event_name, parameters FROM base.events WHERE address = '0x777777751622c0d3258f214f9df38e35bf45baf3' LIMIT 5";
    const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ sql })
    });

    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', JSON.stringify(data).slice(0, 500));
}

main().catch(console.error);
