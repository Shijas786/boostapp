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

    CREATE TABLE IF NOT EXISTS holdings (
        wallet TEXT,
        post_token TEXT,
        balance NUMERIC DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (wallet, post_token)
    );
    CREATE INDEX IF NOT EXISTS idx_holdings_wallet ON holdings(wallet);

    CREATE TABLE IF NOT EXISTS tracked_tokens (
        address TEXT PRIMARY KEY,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
                VALUES (@buyer, @post_token, @buyer, @block_time, @tx_hash)
            `).run(buy);
        } catch (e) { }
    },
    insertBuys: async (buys: { buyer: string, post_token: string, block_time: string, tx_hash: string }[]) => {
        try {
            const insert = sql.prepare(`
                INSERT OR IGNORE INTO buys (buyer, post_token, block_time, tx_hash)
                VALUES (@buyer, @post_token, @block_time, @tx_hash)
            `);
            const insertMany = sql.transaction((items) => {
                for (const item of items) insert.run(item);
            });
            insertMany(buys);
            return { error: null };
        } catch (e: any) {
            return { error: e };
        }
    },

    // Identities (Step 1 Reset)
    getIdentity: async (address: string) => {
        return sql.prepare('SELECT * FROM identities WHERE address = ?').get(address.toLowerCase()) as any;
    },
    getIdentities: async (addresses: string[]) => {
        if (addresses.length === 0) return [];
        const placeholders = addresses.map(() => '?').join(',');
        return sql.prepare(`SELECT * FROM identities WHERE address IN (${placeholders})`).all(addresses.map(a => a.toLowerCase())) as any[];
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
    getActivityFeed: async (address: string = '', limit = 50) => {
        const addressLower = address.toLowerCase();
        let query = 'SELECT * FROM buys ORDER BY block_time DESC LIMIT ?';
        let params: any[] = [limit];

        if (address) {
            query = 'SELECT * FROM buys WHERE buyer = ? ORDER BY block_time DESC LIMIT ?';
            params = [addressLower, limit];
        }

        return sql.prepare(query).all(...params) as any[];
    },

    getAddressByName: async (name: string): Promise<string | null> => {
        const nameLower = name.toLowerCase();
        const row = sql.prepare('SELECT address FROM identities WHERE LOWER(base_name) = ? OR LOWER(farcaster_username) = ?').get(nameLower, nameLower) as { address: string } | undefined;
        return row ? row.address : null;
    },

    getProfileStats: async (address: string) => {
        const addressLower = address.toLowerCase();
        const rows = sql.prepare('SELECT block_time, post_token FROM buys WHERE buyer = ?').all(addressLower) as { block_time: string, post_token: string }[];

        if (rows.length === 0) return null;

        const uniquePosts = new Set(rows.map(b => b.post_token));
        const times = rows.map(b => new Date(b.block_time).getTime());

        return {
            total_buys: rows.length,
            unique_posts: uniquePosts.size,
            first_buy: new Date(Math.min(...times)).toISOString(),
            last_buy: new Date(Math.max(...times)).toISOString()
        };
    },

    getProfileHoldings: async (address: string) => {
        return sql.prepare('SELECT * FROM holdings WHERE wallet = ?').all(address.toLowerCase()) as any[];
    },

    getTrackedTokens: async () => {
        const rows = sql.prepare('SELECT address FROM tracked_tokens').all() as { address: string }[];
        return rows.map(r => r.address.toLowerCase());
    }
};
