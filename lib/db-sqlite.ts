import Database from 'better-sqlite3';
import path from 'path';

// Initialize SQLite DB (Local Simulation)
const dbPath = process.env.VERCEL
    ? path.join('/tmp', 'dashboard.db')
    : path.join(process.cwd(), 'dashboard.db');
const sql = new Database(dbPath);

// Initialize Tables
sql.exec(`
    CREATE TABLE IF NOT EXISTS cursors (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS buys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buyer TEXT NOT NULL,
        post_token TEXT NOT NULL,
        block_time TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        UNIQUE(tx_hash, post_token)
    );

    CREATE TABLE IF NOT EXISTS identities (
        address TEXT PRIMARY KEY,
        base_name TEXT,
        ens TEXT,
        farcaster_username TEXT,
        farcaster_fid INTEGER,
        avatar_url TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

export const dbSqlite = {
    // Cursors
    getCursor: async (key: string): Promise<string | null> => {
        const row = sql.prepare('SELECT value FROM cursors WHERE key = ?').get(key) as { value: string } | undefined;
        return row ? row.value : null;
    },
    setCursor: async (key: string, value: string) => {
        sql.prepare('INSERT OR REPLACE INTO cursors (key, value) VALUES (?, ?)').run(key, value);
    },

    // Buys
    insertBuy: async (buy: { buyer: string, post_token: string, block_time: string, tx_hash: string }) => {
        try {
            sql.prepare(`
                INSERT OR IGNORE INTO buys (buyer, post_token, block_time, tx_hash)
                VALUES (@buyer, @post_token, @block_time, @tx_hash)
            `).run(buy);
        } catch (e) { }
    },

    // Identities (Step 1 Reset)
    getIdentity: async (address: string) => {
        return sql.prepare('SELECT * FROM identities WHERE address = ?').get(address.toLowerCase()) as any;
    },
    saveIdentity: async (identity: any) => {
        sql.prepare(`
            INSERT OR REPLACE INTO identities (address, base_name, ens, farcaster_username, farcaster_fid, avatar_url, updated_at)
            VALUES (@address, @base_name, @ens, @farcaster_username, @farcaster_fid, @avatar_url, CURRENT_TIMESTAMP)
        `).run({
            ...identity,
            address: identity.address.toLowerCase()
        });
    },

    // Leaderboard Query
    getLeaderboard: async (limit = 20, period: string = '7d') => {
        const msPerDay = 24 * 60 * 60 * 1000;
        let days = 7;
        if (period === '1d') days = 1;
        if (period === '30d') days = 30;

        const sinceIso = new Date(Date.now() - days * msPerDay).toISOString();

        return sql.prepare(`
            SELECT 
                b.buyer as buyer_address,
                COUNT(*) as buys_count,
                MAX(b.block_time) as last_active,
                i.base_name,
                i.farcaster_username,
                i.avatar_url,
                i.farcaster_fid
            FROM buys b
            LEFT JOIN identities i ON b.buyer = i.address
            WHERE b.block_time > ?
            GROUP BY b.buyer, i.base_name, i.farcaster_username, i.avatar_url, i.farcaster_fid
            ORDER BY buys_count DESC
            LIMIT ?
        `).all(sinceIso, limit);
    },

    // Mock/Compatibility for other methods if needed
    getActivityFeed: async (address: string, limit = 20) => {
        return sql.prepare(`
            SELECT * FROM buys 
            WHERE buyer = ?
            ORDER BY block_time DESC
            LIMIT ?
        `).all(address.toLowerCase(), limit);
    }
};
