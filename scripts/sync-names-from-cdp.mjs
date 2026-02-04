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
    console.log('\n🚀 Mass Syncing Base Names from CDP Indexer...\n');

    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const jwtToken = await generateCDPJWT(env.CDP_API_KEY_ID, env.CDP_API_SECRET);

    // Query for last 90 days of registrations
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    const sql = `
        SELECT 
            parameters['owner'] as address,
            parameters['name'] as name,
            block_timestamp as updated_at
        FROM base.events
        WHERE event_name = 'NameRegistered'
        AND block_timestamp > '${ninetyDaysAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 20000
    `;

    console.log('Step 1: Fetching recent NameRegistered events from CDP...');
    const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ sql })
    });

    if (!res.ok) {
        console.error('❌ CDP Error:', res.status, await res.text());
        return;
    }

    const { result } = await res.json();
    const rows = result || [];
    console.log(`   ✅ Found ${rows.length} name registrations.\n`);

    if (rows.length === 0) return;

    // Deduplicate: keep most recent name per address
    const seen = new Map();
    rows.forEach(r => {
        const addr = (r.address || '').toLowerCase();
        if (!addr || !r.name) return;
        if (!seen.has(addr)) {
            seen.set(addr, {
                address: addr,
                base_name: `${r.name}.base.eth`,
                updated_at: r.updated_at
            });
        }
    });

    const identities = Array.from(seen.values());

    console.log(`Step 2: Upserting ${identities.length} unique identities to DB...`);

    // Chunk upsert
    const CHUNK_SIZE = 500;
    for (let i = 0; i < identities.length; i += CHUNK_SIZE) {
        const chunk = identities.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('identities').upsert(chunk, { onConflict: 'address' });
        if (error) console.error(`   ❌ DB Error in chunk ${i}:`, error.message);
        else process.stdout.write('.');
    }

    console.log('\n\n✨ Done! Identities synced from CDP.');
}

main().catch(console.error);
