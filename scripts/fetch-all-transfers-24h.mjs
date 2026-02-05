import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { SignJWT, importJWK } from 'jose';
import { webcrypto } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

import { getEnv } from '../lib/env-loader.mjs';

async function main() {
    console.log('\n🔄 Fetching ALL Transfers for Tracked Tokens (Last 24 Hours)...\n');

    const env = getEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const jwtToken = await generateCDPJWT(env.CDP_API_KEY_ID, env.CDP_API_SECRET);

    // Get Tracked Tokens
    const { data: tokens } = await supabase.from('tracked_tokens').select('address');
    if (!tokens || tokens.length === 0) {
        console.log('No tracked tokens found.');
        return;
    }
    const tokensList = tokens.map(t => `'${t.address.toLowerCase()}'`).join(',');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    const sql = `
        SELECT 
            transaction_hash as tx_hash,
            address as post_token,
            block_timestamp,
            toString(parameters['to']) as buyer
        FROM base.events
        WHERE event_name = 'Transfer'
        AND address IN (${tokensList})
        AND block_timestamp > '${oneDayAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 5000
    `;

    console.log('Step 1: Querying CDP for recent transfers...');
    const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ sql })
    });

    if (!res.ok) {
        console.error('CDP Error:', res.status, await res.text());
        return;
    }

    const { result } = await res.json();
    const rows = result || [];
    console.log(`   ✅ Found ${rows.length} transfers\n`);

    if (rows.length === 0) return;

    // Save to DB
    const seen = new Set();
    const buysToInsert = rows.map(r => ({
        buyer: (r.buyer || '').toLowerCase(),
        post_token: (r.post_token || '').toLowerCase(),
        block_time: r.block_timestamp,
        tx_hash: r.tx_hash
    })).filter(r => {
        if (!r.buyer || !r.post_token) return false;
        const key = `${r.tx_hash}_${r.post_token}_${r.buyer}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const { error } = await supabase.from('buys').upsert(buysToInsert, { onConflict: 'tx_hash,post_token,buyer' });
    if (error) {
        console.error('   ❌ DB Error:', error.message);
    } else {
        console.log(`   ✅ Saved ${buysToInsert.length} records\n`);
    }

    console.log('🏁 Sync complete!');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
