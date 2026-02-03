import { queryCDP } from "./cdp";
import { db } from "./db";
import { resolveNameIfMissing } from "./names";

export async function ingestNewBuys() {
    console.log('🔄 Starting data ingestion...');

    // 1. Get Cursor
    let cursor = await db.getCursor("last_ingest_time");

    // Default to 1 hour ago if no cursor (First Run)
    if (!cursor) {
        cursor = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
        console.log(`⚠️ No cursor found. Defaulting to: ${cursor}`);
    }

    console.log(`⏱️ Querying since: ${cursor}`);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').replace('Z', '');

    // 2. Query CDP (Incremental)
    const sql = `
        WITH content_coins AS (
            SELECT DISTINCT CAST(parameters['coin'] AS VARCHAR) AS token_address
            FROM base.events
            WHERE address = '0x77777777751622c0d3258f214f9df38e35bf45baf3'
            AND event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND block_timestamp > '${sevenDaysAgo}'
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
    `;

    try {
        const rows = await queryCDP(sql);
        console.log(`✅ Found ${rows.length} new buy events.`);

        if (rows.length === 0) {
            // Even if no rows, update cursor to now? No, stick to last found or keep old?
            // Better to set cursor to now() to avoid re-scanning the last empty window forever?
            // But if we miss data due to latency...
            // Let's stick to updating cursor only on rows for now to be safe.
            return;
        }

        // 3. Process Rows
        for (const row of rows) {
            await db.insertBuy({
                buyer: row.buyer,
                post_token: row.post_token,
                block_time: row.block_time,
                tx_hash: row.tx_hash
            });
            await resolveNameIfMissing(row.buyer);
        }

        // 4. Update Cursor
        const lastTime = rows[rows.length - 1].block_time;
        await db.setCursor("last_ingest_time", lastTime);
        console.log(`💾 Updated cursor to: ${lastTime}`);

    } catch (e) {
        console.error('❌ Ingestion Failed:', e);
        throw e;
    }
}
