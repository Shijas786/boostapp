/**
 * Script to collect and save top post buyers data
 * Run with: node scripts/collect-buyers.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use local API endpoint (must have dev server running on localhost:3000)
const LOCAL_API_URL = 'http://localhost:3000/api/query';

async function runQuery(sql) {
    const res = await fetch(LOCAL_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql })
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Query API Error: ${error}`);
    }

    return res.json();
}

const MANUAL_OVERRIDES = {
    '0x0eee4c7dbe630dbdf475a57f0625bf648b58a068': {
        name: 'cryptowolf07.farcaster.eth',
        avatar: null
    }
};

async function resolveBasename(address) {
    if (MANUAL_OVERRIDES[address.toLowerCase()]) {
        console.log(`✨ Applying manual override for ${address}`);
        return MANUAL_OVERRIDES[address.toLowerCase()];
    }

    try {
        const res = await fetch(`http://localhost:3000/api/resolve-name?address=${address}`);
        const data = await res.json();
        return { name: data.name, avatar: data.avatar };
    } catch (e) {
        return { name: null, avatar: null };
    }
}

async function main() {
    console.log('🚀 Starting data collection...');

    // NOTE: Requires dev server running at localhost:3000
    console.log('⚠️  Make sure npm run dev is running on localhost:3000');

    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').replace('Z', '');

    console.log(`📅 Fetching data since: ${oneHourAgo}`);

    // Step 1: Get buyers who bought 2+ different posts (last 1 hour)
    const sql = `
        WITH content_coins AS (
            SELECT DISTINCT CAST(parameters['coin'] AS VARCHAR) AS token_address
            FROM base.events
            WHERE address = '0x777777751622c0d3258f214f9df38e35bf45baf3'
            AND event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND block_timestamp > '${oneHourAgo}'
        ),
        content_coin_buys AS (
            SELECT
                t.block_timestamp,
                t.transaction_hash,
                t.parameters['to'] as buyer,
                t.address as post_token,
                t.parameters['value'] as token_amount
            FROM base.events t
            JOIN content_coins cc ON t.address = cc.token_address
            WHERE t.event_name = 'Transfer'
            AND t.parameters['from'] != '0x0000000000000000000000000000000000000000'
            AND t.block_timestamp > '${oneHourAgo}'
        ),
        top_buyers AS (
            SELECT
                buyer as buyer_address,
                COUNT(DISTINCT post_token) as posts_bought,
                COUNT(*) as total_buy_events,
                SUM(CAST(token_amount AS DOUBLE)) as total_tokens_acquired
            FROM content_coin_buys
            GROUP BY buyer
            HAVING COUNT(DISTINCT post_token) >= 2
            ORDER BY posts_bought DESC
            LIMIT 500
        )
        SELECT * FROM top_buyers
    `;

    console.log('📡 Querying CDP for top buyers...');
    const result = await runQuery(sql);
    const buyers = result.data || result.result || [];

    console.log(`✅ Found ${buyers.length} buyers who bought 2+ posts`);

    // Step 2: Resolve basenames for each buyer
    console.log('🔍 Resolving basenames (this may take a while)...');

    const resolvedBuyers = [];
    let resolved = 0;
    let withBasename = 0;

    for (const buyer of buyers) {
        const identity = await resolveBasename(buyer.buyer_address);

        if (identity.name) {
            resolvedBuyers.push({
                ...buyer,
                buyer_basename: identity.name,
                buyer_avatar: identity.avatar
            });
            withBasename++;
        }

        resolved++;
        if (resolved % 10 === 0) {
            console.log(`   ${resolved}/${buyers.length} resolved, ${withBasename} with basename`);
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`✅ Resolution complete: ${withBasename} users with basenames`);

    // Step 3: Save to file
    const outputPath = path.join(__dirname, '..', 'data', 'top-buyers.json');
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const output = {
        generatedAt: new Date().toISOString(),
        period: '1 hour',
        minPosts: 2,
        totalBuyers: buyers.length,
        buyersWithBasename: resolvedBuyers.length,
        data: resolvedBuyers
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`💾 Saved to: ${outputPath}`);
    console.log('🎉 Done!');
}

main().catch(console.error);
