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
        buyer TEXT,
        post_token TEXT,
        block_time TEXT,
        tx_hash TEXT,
        UNIQUE(tx_hash, post_token)
    );

    CREATE TABLE IF NOT EXISTS names (
        address TEXT PRIMARY KEY,
        name TEXT,
        source TEXT,
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
        } catch (e) {
            console.error('DB Insert Error:', e);
        }
    },

    // Names
    getName: async (address: string): Promise<{ name: string | null } | null> => {
        return sql.prepare('SELECT name FROM names WHERE address = ?').get(address) as { name: string | null } | null;
    },
    saveName: async (data: { address: string, name: string | null, source: string }) => {
        sql.prepare(`
            INSERT OR REPLACE INTO names (address, name, source, updated_at)
            VALUES (@address, @name, @source, CURRENT_TIMESTAMP)
        `).run(data);
    },

    // Leaderboard Query
    getLeaderboard: async (limit = 100, period: string = '7d') => {
        const msPerDay = 24 * 60 * 60 * 1000;
        let since = Date.now();

        if (period === '1d') since -= msPerDay;
        else if (period === '30d') since -= 30 * msPerDay;
        else since -= 7 * msPerDay; // Default 7d

        const sinceIso = new Date(since).toISOString();

        return sql.prepare(`
            SELECT 
                b.buyer as buyer_address,
                COUNT(DISTINCT b.post_token) as posts_bought,
                COUNT(*) as total_buy_events,
                MAX(b.block_time) as last_active,
                n.name as buyer_basename,
                n.name as buyer_avatar
            FROM buys b
            LEFT JOIN names n ON b.buyer = n.address
            WHERE b.block_time > ?
            GROUP BY b.buyer
            ORDER BY posts_bought DESC
            LIMIT ?
        `).all(sinceIso, limit);
    },

    // Profile Queries
    getAddressByName: async (name: string): Promise<string | null> => {
        const row = sql.prepare('SELECT address FROM names WHERE name = ? COLLATE NOCASE').get(name) as { address: string } | undefined;
        return row ? row.address : null;
    },

    getProfileStats: async (address: string) => {
        return sql.prepare(`
            SELECT 
                COUNT(*) as total_buys,
                COUNT(DISTINCT post_token) as unique_creators,
                MAX(block_time) as last_buy_time
            FROM buys 
            WHERE buyer = ?
        `).get(address);
    },

    getActivityFeed: async (address: string, limit = 20) => {
        return sql.prepare(`
            SELECT * FROM buys 
            WHERE buyer = ?
            ORDER BY block_time DESC
            LIMIT ?
        `).all(address, limit);
    }
};
