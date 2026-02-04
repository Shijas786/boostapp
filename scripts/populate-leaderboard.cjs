const fs = require('fs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

/**
 * Generate CDP JWT for authentication
 * Per CDP docs: JWT is the only valid auth method
 */
function generateCDPJWT(apiKeyId, apiSecret) {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
        iss: apiKeyId,      // Issuer: your API key ID
        iat: now,           // Issued at: current timestamp
        exp: now + 60 * 5   // Expires in 5 minutes
    };

    return jwt.sign(payload, apiSecret, {
        algorithm: 'HS256'
    });
}

async function main() {
    // Load environment variables
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    // CDP Authentication (JWT-based)
    const cdpApiKeyId = env.CDP_API_KEY_ID;
    const cdpApiSecret = env.CDP_API_SECRET;

    if (!cdpApiKeyId || !cdpApiSecret) {
        console.error('❌ Missing CDP_API_KEY_ID or CDP_API_SECRET in .env.local');
        console.error('   You need to add these from your CDP Portal credentials.');
        return;
    }

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    console.log('\n🚀 Populating Leaderboard from Last 7 Days...\n');

    // Step 1: Get all buyers from CDP for the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3'.toLowerCase();

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

    const cdpUrl = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';

    let buys = [];
    try {
        // Generate fresh JWT for each request
        const jwtToken = generateCDPJWT(cdpApiKeyId, cdpApiSecret);

        const res = await fetch(cdpUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtToken}`
            },
            body: JSON.stringify({ sql })
        });

        // Handle rate limiting
        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After') || '60';
            console.error(`❌ Rate limited. Retry after ${retryAfter} seconds.`);
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

    // Step 2: Insert buys into database (batch insert for efficiency)
    console.log('Step 2: Inserting purchases into database...');

    const buyRecords = buys.map(buy => ({
        buyer: buy.buyer.toLowerCase(),
        post_token: buy.post_token.toLowerCase(),
        block_time: buy.block_timestamp,
        tx_hash: `synthetic_${buy.block_number}_${buy.log_index}`
    }));

    // Batch insert in chunks of 500
    const BATCH_SIZE = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < buyRecords.length; i += BATCH_SIZE) {
        const batch = buyRecords.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('buys')
            .upsert(batch, { onConflict: 'tx_hash,post_token,buyer' });

        if (error) {
            console.error('   Batch insert error:', error.message);
            skipped += batch.length;
        } else {
            inserted += batch.length;
        }
    }

    console.log(`   ✅ Processed ${inserted} purchases (${skipped} errors)\n`);

    // Step 3: Get unique buyers
    const uniqueBuyers = Array.from(new Set(buys.map(b => b.buyer.toLowerCase())));
    console.log(`Step 3: Resolving identities for ${uniqueBuyers.length} unique addresses...\n`);

    // Step 4: Resolve identities
    let resolved = 0;
    let cached = 0;

    for (const buyer of uniqueBuyers) {
        // Check if already in database
        const { data: existing } = await supabase
            .from('identities')
            .select('*')
            .eq('address', buyer)
            .single();

        if (existing) {
            cached++;
            continue;
        }

        // Resolve identity
        const identity = {
            address: buyer,
            base_name: null,
            ens: null,
            farcaster_username: null,
            farcaster_fid: null,
            avatar_url: null
        };

        // Try to resolve Farcaster via Neynar
        try {
            const neynarKey = env.NEYNAR_API_KEY;
            if (neynarKey) {
                const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${buyer}`;
                const res = await fetch(url, { headers: { 'x-api-key': neynarKey } });
                if (res.ok) {
                    const data = await res.json();
                    const users = data[buyer] || [];
                    const user = users[0];
                    if (user) {
                        identity.farcaster_username = user.username;
                        identity.farcaster_fid = user.fid;
                        identity.avatar_url = user.pfp_url;
                    }
                }
            }
        } catch (e) {
            // Silent fail
        }

        // Save to database
        await supabase
            .from('identities')
            .upsert(identity);

        resolved++;

        if (resolved % 10 === 0) {
            console.log(`   Resolved ${resolved}/${uniqueBuyers.length - cached}...`);
        }

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n   ✅ Resolved ${resolved} new identities, ${cached} were cached\n`);

    // Step 5: Show leaderboard preview
    console.log('Step 5: Leaderboard Preview (Top 10):\n');

    const { data: leaders, error: leaderError } = await supabase
        .rpc('get_leaderboard', { period_days: 7, limit_count: 10 });

    if (leaderError) {
        console.error('Error fetching leaderboard:', leaderError);
    } else if (leaders) {
        console.log('Rank | Address | Posts | Buys | Name\n' + '─'.repeat(70));
        leaders.forEach((leader, i) => {
            const name = leader.farcaster_username || leader.base_name || leader.ens || 'anon';
            const addr = `${leader.buyer_address.substring(0, 6)}...${leader.buyer_address.substring(38)}`;
            console.log(`${String(i + 1).padEnd(4)} | ${addr} | ${String(leader.unique_posts).padEnd(5)} | ${String(leader.total_buys).padEnd(4)} | ${name}`);
        });
    }

    console.log('\n✨ Done! Leaderboard populated.\n');
}

main().catch(console.error);
