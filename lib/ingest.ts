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

    // SANITIZE: Ensure format is YYYY-MM-DD HH:MM:SS
    // Remove T, Z, offset, and milliseconds (CDP compatibility)
    cursor = cursor.replace('T', ' ').replace('Z', '').split('+')[0].split('.')[0];

    console.log(`⏱️ Querying since: ${cursor}`);

    // CTE window: Look back 60 days (Performance optimization)
    // Scanning full history causes timeouts/partial results.
    const cteDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').replace('Z', '');

    // 2. Query CDP (Using base.events)
    // We use LOWER() for address matches
    const cdpSql = `
        WITH content_coins AS (
            SELECT DISTINCT CAST(parameters['coin'] AS VARCHAR) AS token_address
            FROM base.events
            WHERE event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND block_timestamp > '${cteDaysAgo}'
        ),
        recent_buys AS (
            SELECT 
                t.block_timestamp,
                t.transaction_hash as tx_hash,
                t.address as post_token,
                CAST(t.parameters['to'] AS VARCHAR) as buyer
            FROM base.events t
            JOIN content_coins cc ON LOWER(t.address) = LOWER(cc.token_address)
            WHERE t.event_name = 'Transfer'
            AND t.block_timestamp > CAST('${cursor}' AS TIMESTAMP)
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
    } catch (e: any) {
        console.error('CDP Error:', e); // Log error but don't crash entire ingest (Zora might work)
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

    // 3. Process & Save
    let insertedCount = 0;
    let maxTime = cursor; // Track max time for cursor update

    for (const row of allBuys) {
        const buyerAddr = row.buyer.toLowerCase();

        // Resolve Identity
        await resolveNameIfMissing(buyerAddr);

        // Save Buy
        await db.insertBuy({
            buyer: buyerAddr,
            post_token: row.post_token.toLowerCase(),
            block_time: row.block_timestamp || row.block_time, // Standardize
            tx_hash: row.tx_hash
        });

        // Update Max Time
        const rowTime = row.block_timestamp || row.block_time;
        if (rowTime > maxTime) {
            maxTime = rowTime;
        }
        insertedCount++;
    }

    // 4. Update Cursor
    if (insertedCount > 0) {
        await db.setCursor("last_ingest_time", maxTime);
        console.log(`✅ Ingested ${insertedCount} buys. New cursor: ${maxTime}`);
    }

    return { message: 'Ingestion complete', count: insertedCount };
}
