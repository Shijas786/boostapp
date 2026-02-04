import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { SignJWT, importJWK } from 'jose';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

async function generateCDPJWT(apiKeyId, apiSecret) {
    try {
        const requestMethod = 'POST';
        const requestPath = '/platform/v2/data/query/run';

        // Parse the secret (88 chars base64 -> 64 bytes)
        const keyBuffer = Buffer.from(apiSecret, 'base64');

        if (keyBuffer.length !== 64) {
            console.error(`Warning: Key length is ${keyBuffer.length}, expected 64 for raw Ed25519.`);
        }

        const toBase64Url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        const d = toBase64Url(keyBuffer.subarray(0, 32));
        const x = toBase64Url(keyBuffer.subarray(32, 64));

        const jwk = {
            kty: 'OKP',
            crv: 'Ed25519',
            d: d,
            x: x,
            kid: apiKeyId
        };

        const privateKey = await importJWK(jwk, 'EdDSA');

        const uri = `${requestMethod} api.cdp.coinbase.com${requestPath}`;

        return await new SignJWT({
            iss: 'cdp',
            nbf: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 120,
            sub: apiKeyId,
            uris: [uri]
        })
            .setProtectedHeader({ alg: 'EdDSA', kid: apiKeyId, typ: 'JWT' })
            .sign(privateKey);

    } catch (e) {
        console.error('Error generating JWT:', e);
        throw e;
    }
}

async function main() {
    console.log('\n🚀 Fetching Creator Token Buys (Last 24 Hours)...\n');

    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const jwtToken = await generateCDPJWT(env.CDP_API_KEY_ID, env.CDP_API_SECRET);

    // Step 1: Query CDP - Last 24 Hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    // Using a more lenient "from address" check if 0x0...0 doesn't return results, but sticking to requested logic first.
    // If user says "creator token buyers", usually mints (from 0x0) are the main signal.
    const sql = `
        SELECT 
            to_address as buyer,
            token_address as post_token,
            block_timestamp,
            block_number,
            log_index
        FROM base.transfers
        WHERE from_address = '0x0000000000000000000000000000000000000000'
        AND block_timestamp > '${oneDayAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 5000
    `;

    console.log('Step 1: Querying CDP...');

    let buys = [];
    try {
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

        const json = await res.json();
        buys = json.result || json.data || [];
        console.log(`   ✅ Found ${buys.length} purchases in last 24h\n`);
    } catch (e) {
        console.error('❌ CDP Query Error:', e.message);
        return;
    }

    if (buys.length === 0) {
        console.log('No recent purchases found.');
        return;
    }

    // Step 2: Insert into DB
    console.log('Step 2: Saving to database...');
    const buyRecords = buys.map(buy => ({
        buyer: buy.buyer.toLowerCase(),
        post_token: buy.post_token.toLowerCase(),
        block_time: buy.block_timestamp,
        tx_hash: `synthetic_${buy.block_number}_${buy.log_index}`
    }));

    const CHUNK_SIZE = 500;
    for (let i = 0; i < buyRecords.length; i += CHUNK_SIZE) {
        const chunk = buyRecords.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
            .from('buys')
            .upsert(chunk, { onConflict: 'tx_hash,post_token,buyer' });

        if (error) console.error('   ❌ DB Error:', error.message);
    }
    console.log(`   ✅ Saved records\n`);

    // Step 3: Resolve Farcaster & Identities
    const uniqueBuyers = Array.from(new Set(buyRecords.map(b => b.buyer)));
    console.log(`Step 3: Resolving Farcaster for ${uniqueBuyers.length} buyers...\n`);

    let resolved = 0;
    for (const buyer of uniqueBuyers) {
        const { data: existing } = await supabase.from('identities').select('address').eq('address', buyer).single();
        if (existing) continue;

        const identity = {
            address: buyer,
            farcaster_username: null,
            farcaster_fid: null,
            avatar_url: null,
            updated_at: new Date().toISOString()
        };

        try {
            if (env.NEYNAR_API_KEY) {
                const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${buyer}`, {
                    headers: { 'x-api-key': env.NEYNAR_API_KEY }
                });
                if (res.ok) {
                    const data = await res.json();
                    const user = data[buyer]?.[0];
                    if (user) {
                        identity.farcaster_username = user.username;
                        identity.farcaster_fid = user.fid;
                        identity.avatar_url = user.pfp_url;
                    }
                }
            }
        } catch (e) { }

        await supabase.from('identities').upsert(identity);
        resolved++;
        if (resolved % 10 === 0) process.stdout.write('.');
        await new Promise(r => setTimeout(r, 50));
    }
    console.log(`\n   ✅ Resolved ${resolved} new Farcaster identities\n`);
}

main().catch(console.error);
