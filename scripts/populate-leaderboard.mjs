/**
 * Populate Leaderboard Script
 * Uses CDP API with Ed25519 JWT Authentication
 * Run: node scripts/populate-leaderboard.mjs
 */
import * as jose from 'jose';
import { webcrypto } from 'crypto';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Polyfill globalThis.crypto for jose
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

// Load environment variables
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const cdpApiKeyId = env.CDP_API_KEY_ID;
const cdpApiSecret = env.CDP_API_SECRET || env.CDP_API_KEY_SECRET;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Generate Ed25519 JWT for CDP API
 */
async function generateCDPJWT(requestMethod, requestPath) {
    const secretBytes = Buffer.from(cdpApiSecret, 'base64');
    const seed = secretBytes.slice(0, 32);

    const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([pkcs8Header, seed]);
    const pkcs8Pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8Der.toString('base64')}\n-----END PRIVATE KEY-----`;

    const privateKey = await jose.importPKCS8(pkcs8Pem, 'EdDSA');
    const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex');

    return await new jose.SignJWT({
        sub: cdpApiKeyId,
        iss: 'cdp',
        aud: ['cdp_service'],
        nbf: Math.floor(Date.now() / 1000),
        uris: [`${requestMethod} api.cdp.coinbase.com${requestPath}`]
    })
        .setProtectedHeader({ alg: 'EdDSA', kid: cdpApiKeyId, typ: 'JWT', nonce })
        .setIssuedAt()
        .setExpirationTime('2m')
        .sign(privateKey);
}

async function main() {
    if (!cdpApiKeyId || !cdpApiSecret) {
        console.error('❌ Missing CDP_API_KEY_ID or CDP_API_SECRET in .env.local');
        return;
    }

    console.log('\n🚀 Populating Leaderboard from Last 7 Days...\n');

    // Step 1: Query CDP for creator token purchases
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    const sql = `
        SELECT 
            to_address as buyer,
            token_address as post_token,
            block_timestamp,
            block_number,
            log_index
        FROM base.transfers
        WHERE from_address = '0x0000000000000000000000000000000000000000'
        AND block_timestamp > '${sevenDaysAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 5000
    `;

    console.log('Step 1: Querying CDP for creator token purchases...');

    const requestPath = '/platform/v2/data/query/run';
    let buys = [];

    try {
        const jwtToken = await generateCDPJWT('POST', requestPath);

        const res = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            body: JSON.stringify({ sql })
        });

        if (res.status === 429) {
            console.error('❌ Rate limited. Try again later.');
            return;
        }

        if (!res.ok) {
            console.error(`❌ CDP Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Response:', text.substring(0, 500));
            return;
        }

        const json = await res.json();
        buys = json.result || json.data || [];
        console.log(`   ✅ Found ${buys.length} creator token purchases\n`);
    } catch (e) {
        console.error('❌ CDP Request Error:', e.message);
        return;
    }

    if (buys.length === 0) {
        console.log('No purchases found in the last 7 days.');
        return;
    }

    // Step 2: Insert buys into database (batch insert)
    console.log('Step 2: Inserting purchases into database...');

    const buyRecords = buys.map(buy => ({
        buyer: buy.buyer.toLowerCase(),
        post_token: buy.post_token.toLowerCase(),
        block_time: buy.block_timestamp,
        tx_hash: `synthetic_${buy.block_number}_${buy.log_index}`
    }));

    const BATCH_SIZE = 500;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < buyRecords.length; i += BATCH_SIZE) {
        const batch = buyRecords.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('buys')
            .upsert(batch, { onConflict: 'tx_hash,post_token,buyer' });

        if (error) {
            console.error('   Batch error:', error.message);
            errors += batch.length;
        } else {
            inserted += batch.length;
        }
    }

    console.log(`   ✅ Processed ${inserted} purchases (${errors} errors)\n`);

    // Step 3: Resolve identities
    const uniqueBuyers = [...new Set(buys.map(b => b.buyer.toLowerCase()))];
    console.log(`Step 3: Resolving identities for ${uniqueBuyers.length} unique addresses...\n`);

    let resolved = 0;
    let cached = 0;

    for (const buyer of uniqueBuyers) {
        const { data: existing } = await supabase
            .from('identities')
            .select('*')
            .eq('address', buyer)
            .single();

        if (existing) {
            cached++;
            continue;
        }

        const identity = {
            address: buyer,
            base_name: null,
            ens: null,
            farcaster_username: null,
            farcaster_fid: null,
            avatar_url: null
        };

        // Try Neynar for Farcaster
        try {
            const neynarKey = env.NEYNAR_API_KEY;
            if (neynarKey) {
                const res = await fetch(
                    `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${buyer}`,
                    { headers: { 'x-api-key': neynarKey } }
                );
                if (res.ok) {
                    const data = await res.json();
                    const user = (data[buyer] || [])[0];
                    if (user) {
                        identity.farcaster_username = user.username;
                        identity.farcaster_fid = user.fid;
                        identity.avatar_url = user.pfp_url;
                    }
                }
            }
        } catch (e) { /* silent */ }

        await supabase.from('identities').upsert(identity);
        resolved++;

        if (resolved % 10 === 0) {
            console.log(`   Resolved ${resolved}/${uniqueBuyers.length - cached}...`);
        }

        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n   ✅ Resolved ${resolved} new identities, ${cached} cached\n`);

    // Step 4: Show leaderboard preview
    console.log('Step 4: Leaderboard Preview (Top 10):\n');

    const { data: leaders, error: leaderError } = await supabase
        .rpc('get_leaderboard', { period_days: 7, limit_count: 10 });

    if (leaderError) {
        console.error('Error:', leaderError);
    } else if (leaders) {
        console.log('Rank | Address      | Posts | Buys | Name\n' + '─'.repeat(60));
        leaders.forEach((l, i) => {
            const name = l.farcaster_username || l.base_name || 'anon';
            const addr = `${l.buyer_address.slice(0, 6)}...${l.buyer_address.slice(-4)}`;
            console.log(`${String(i + 1).padEnd(4)} | ${addr} | ${String(l.unique_posts).padEnd(5)} | ${String(l.total_buys).padEnd(4)} | ${name}`);
        });
    }

    console.log('\n✨ Done! Leaderboard populated.\n');
}

main().catch(console.error);
