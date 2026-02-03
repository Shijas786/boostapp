import { queryCDP } from './cdp';
import { queryZoraSwaps } from './zora';
import { db } from './db';
import { resolveNameIfMissing } from './names';

export async function ingestNewBuys() {
    console.log('🔄 Starting data ingestion...');

    // 1. Get Cursor
    let cursor = await db.getCursor("last_ingest_time");

    // Default to 1 day ago if no cursor (First Run - Get Recent Data)
    if (!cursor) {
        cursor = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        console.log(`⚠️ No cursor found. Defaulting to: ${cursor}`);
    }

    // SANITIZE: Ensure format is YYYY-MM-DD HH:MM:SS.mmm
    // Remove T, Z, and any +00:00 offset
    cursor = cursor.replace('T', ' ').replace('Z', '').split('+')[0];

    console.log(`⏱️ Querying since: ${cursor}`);

    // CTE window for content coins
    const cteDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').replace('Z', '');

    // 2. Query CDP (Incremental)
    const cdpSql = `
        WITH content_coins AS (
            SELECT DISTINCT CAST(parameters['coin'] AS VARCHAR) AS token_address
            FROM base.events
            WHERE event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND block_timestamp > '${cteDaysAgo}'
        ),
        recent_buys AS (
            SELECT
                t.block_timestamp as block_time,
                t.transaction_hash as tx_hash,
                t.parameters['to'] as buyer,
                t.address as post_token
            FROM base.events t
            JOIN content_coins cc ON t.address = cc.token_address
            WHERE t.event_name = 'Transfer'
            AND t.parameters['from'] != '0x0000000000000000000000000000000000000000'
            AND t.block_timestamp > '${cursor}'
            ORDER BY t.block_timestamp ASC
        )
        SELECT * FROM recent_buys
        ORDER BY block_timestamp ASC
        LIMIT 1000
    `;
    console.log('[DEBUG] CDP SQL:', cdpSql);

    let allBuys: any[] = [];

    // Fetch from CDP
    try {
        const cdpRows = await queryCDP(cdpSql);
        console.log(`✅ CDP: Found ${cdpRows.length} buy events`);
        allBuys = [...cdpRows.map((r: any) => ({ ...r, source: 'cdp' }))];
    } catch (e) {
        console.error('❌ CDP query failed:', e);
    }

    // Fetch from Zora API
    try {
        const zoraRows = await queryZoraSwaps(500);
        console.log(`✅ Zora: Found ${zoraRows.length} buy events`);

        // Filter Zora results to match our cursor window
        const cursorTime = new Date(cursor).getTime();
        const filteredZora = zoraRows.filter((r: any) => {
            const rowTime = new Date(r.block_time).getTime();
            return rowTime > cursorTime;
        });

        allBuys = [...allBuys, ...filteredZora];
    } catch (e) {
        console.error('❌ Zora query failed:', e);
    }

    console.log(`📊 Total: ${allBuys.length} buy events from both sources`);

    if (allBuys.length === 0) {
        console.log('ℹ️ No new buys found.');
        return { message: 'No new data', count: 0 };
    }

    // 3. Insert into DB and Resolve Names
    let newCursor = cursor;
    let insertedCount = 0;

    for (const row of allBuys) {
        if (!row.buyer || !row.post_token) continue;

        const buyerAddr = row.buyer.toLowerCase();
        const blockTime = row.block_time;

        await db.insertBuy({
            buyer: buyerAddr,
            post_token: row.post_token.toLowerCase(),
            block_time: blockTime,
            tx_hash: row.tx_hash
        });
        insertedCount++;

        // Resolve name (with contract detection, Neynar, Zora profiles)
        await resolveNameIfMissing(buyerAddr);

        // If Zora gave us a name, save it directly
        if (row.buyer_name) {
            await db.saveName({
                address: buyerAddr,
                name: row.buyer_name,
                source: 'zora_api',
                is_contract: false
            });
        }

        // Track latest timestamp
        if (blockTime > newCursor) {
            newCursor = blockTime;
        }
    }

    // 4. Update Cursor
    await db.setCursor("last_ingest_time", newCursor);

    console.log(`✅ Ingested ${insertedCount} buys. New cursor: ${newCursor}`);
    return { message: 'Ingestion complete', count: insertedCount };
}
