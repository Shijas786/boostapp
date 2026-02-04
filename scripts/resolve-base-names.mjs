/**
 * Resolve Base Names for Top Buyers
 * Uses OnchainKit for Base Name resolution with rate limiting
 * Run: node scripts/resolve-base-names.mjs
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { getName, getAvatar } from '@coinbase/onchainkit/identity';
import { base, mainnet } from 'viem/chains';
import { createPublicClient, http } from 'viem';

// Load environment variables
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Viem client for ENS fallback
const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http(),
});

// Rate limiting config
const DELAY_BETWEEN_REQUESTS = 50;
const BATCH_SIZE = 500;

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Resolve Base Name with retry
 */
async function resolveBaseName(address, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const name = await getName({
                address: address,
                chain: base,
            });

            if (name) {
                // Try to get avatar
                let avatar = null;
                try {
                    avatar = await getAvatar({
                        ensName: name,
                        chain: base,
                    });
                } catch {
                    // Avatar failed, continue without
                }
                return { name, avatar, source: 'basename' };
            }

            return null;
        } catch (error) {
            if (attempt < retries - 1) {
                const delay = Math.pow(2, attempt) * 500;
                await sleep(delay);
            }
        }
    }
    return null;
}

/**
 * Resolve ENS Name with retry
 */
async function resolveENS(address, retries = 2) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const name = await mainnetClient.getEnsName({ address });
            if (name) {
                return { name, avatar: null, source: 'ens' };
            }
            return null;
        } catch {
            if (attempt < retries - 1) {
                await sleep(300);
            }
        }
    }
    return null;
}

async function main() {
    console.log('\n🔍 Resolving Base Names for Top Buyers...\n');
    console.log('─'.repeat(60));

    // Get top buyers without names from last 7 days
    const { data: topBuyers } = await supabase
        .from('buys')
        .select('buyer')
        .gte('block_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (!topBuyers || topBuyers.length === 0) {
        console.log('No buyers found in the last 7 days.');
        return;
    }

    // Count by buyer and get top addresses
    const buyerCounts = {};
    topBuyers.forEach(b => {
        buyerCounts[b.buyer] = (buyerCounts[b.buyer] || 0) + 1;
    });

    const topAddresses = Object.entries(buyerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, BATCH_SIZE)
        .map(([addr]) => addr);

    console.log(`Found ${topAddresses.length} top buyers to resolve.\n`);

    // Get existing identities to skip already resolved
    const { data: existingIdentities } = await supabase
        .from('identities')
        .select('address, base_name, ens')
        .in('address', topAddresses);

    const existingMap = new Map(
        (existingIdentities || []).map(i => [i.address, i])
    );

    let resolved = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < topAddresses.length; i++) {
        const address = topAddresses[i].toLowerCase();

        // Check if already has a name
        const existing = existingMap.get(address);
        if (existing?.base_name || existing?.ens) {
            skipped++;
            continue;
        }

        try {
            // Try Base Name first
            let result = await resolveBaseName(address);

            // Fallback to ENS
            if (!result) {
                result = await resolveENS(address);
            }

            if (result) {
                // Update the identity in database
                await supabase
                    .from('identities')
                    .upsert({
                        address,
                        base_name: result.source === 'basename' ? result.name : null,
                        ens: result.source === 'ens' ? result.name : null,
                        avatar_url: result.avatar || null,
                        updated_at: new Date().toISOString(),
                    });

                console.log(`✅ ${address.slice(0, 10)}... → ${result.name} (${result.source})`);
                resolved++;
            } else {
                // Mark as checked (null name) to avoid re-checking
                await supabase
                    .from('identities')
                    .upsert({
                        address,
                        updated_at: new Date().toISOString(),
                    });
                failed++;
            }
        } catch (error) {
            console.error(`❌ Error resolving ${address.slice(0, 10)}...: ${error.message}`);
            failed++;
        }

        // Progress indicator
        if ((i + 1) % 10 === 0) {
            console.log(`\n   Progress: ${i + 1}/${topAddresses.length} (${resolved} resolved, ${skipped} skipped, ${failed} failed)\n`);
        }

        // Rate limit
        await sleep(DELAY_BETWEEN_REQUESTS);
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`\n✨ Done!`);
    console.log(`   Resolved: ${resolved}`);
    console.log(`   Skipped (already had name): ${skipped}`);
    console.log(`   No name found: ${failed}\n`);

    // Show updated leaderboard
    console.log('Updated Leaderboard (Top 20):\n');
    console.log('─'.repeat(80));

    const { data: leaders } = await supabase
        .rpc('get_leaderboard', { period_days: 7, limit_count: 20 });

    if (leaders) {
        leaders.forEach((l, i) => {
            const name = l.farcaster_username || l.base_name || l.ens || 'anon';
            const addr = `${l.buyer_address.slice(0, 10)}...`;
            console.log(
                `${String(i + 1).padStart(2)}. ${addr} | Posts: ${String(l.unique_posts).padStart(5)} | Buys: ${String(l.total_buys).padStart(5)} | ${name}`
            );
        });
    }

    console.log('\n');
}

main().catch(console.error);
