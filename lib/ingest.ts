import { queryCDP } from './cdp';
import { db } from './db';

/**
 * MENTAL RESET: Clean Ingestion Logic
 * - Strictly CDP SQL -> Supabase buys table
 * - No name resolution here (handled in UI/Resolver API)
 * - Uses ClickHouse toString() syntax for CDP reliability
 */
export async function ingestNewBuys() {
    console.log('🔄 Starting minimal ingestion...');

    // 1. Get Cursor
    let cursor = await db.getCursor("last_ingest_time");

    // Default to 1 hour ago if no cursor to avoid massive scans
    if (!cursor) {
        cursor = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        console.log(`⚠️ No cursor found. Defaulting to: ${cursor}`);
    }

    // SANITIZE: Ensure format is YYYY-MM-DD HH:MM:SS (strictly for ClickHouse)
    cursor = cursor.replace('T', ' ').replace('Z', '').split('+')[0].split('.')[0];

    console.log(`⏱️ Querying since: ${cursor}`);

    // CDP SQL: Subquery pattern for robustness
    // Filtering by the Zora Factory address provided in Step 2
    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3'.toLowerCase();

    // Lookback 7 days for coin discovery (safe window)
    const cteDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').replace('Z', '');

    const cdpSql = `
        SELECT 
            block_timestamp,
            transaction_hash as tx_hash,
            address as post_token,
            toString(parameters['to']) as buyer
        FROM base.events
        WHERE event_name = 'Transfer'
        AND block_timestamp > '${cursor}'
        AND address IN (
            SELECT DISTINCT toString(parameters['coin'])
            FROM base.events
            WHERE event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND address = '${factoryAddress}'
            AND block_timestamp > '${cteDaysAgo}'
        )
        ORDER BY block_timestamp ASC
        LIMIT 1000
    `;

    try {
        const rows = await queryCDP(cdpSql);
        console.log(`✅ CDP: Found ${rows.length} buy events`);

        if (rows.length === 0) {
            return { message: 'No new data', count: 0 };
        }

        let insertedCount = 0;
        let maxTime = cursor;

        for (const row of rows) {
            // Minimal Insert (No name resolution!)
            try {
                await db.insertBuy({
                    buyer: row.buyer.toLowerCase(),
                    post_token: row.post_token.toLowerCase(),
                    block_time: row.block_timestamp,
                    tx_hash: row.tx_hash
                });
                insertedCount++;
            } catch (e) {
                // Ignore duplicates (PGRST116 / Unique violation)
            }

            if (row.block_timestamp > maxTime) {
                maxTime = row.block_timestamp;
            }
        }

        // Update Cursor
        if (insertedCount > 0 || rows.length > 0) {
            await db.setCursor("last_ingest_time", maxTime);
        }

        return { message: 'Infection complete', count: insertedCount, new_cursor: maxTime };

    } catch (e: any) {
        console.error('Ingest Error:', e.message);
        throw e;
    }
}
