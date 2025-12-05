const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDB = async () => {
    const client = await pool.connect();
    try {
        console.log('📦 Initializing Database...');
        
        // 1. Users Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Bookmarks Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bookmarks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                url TEXT NOT NULL,
                title TEXT,
                image_url TEXT,
                site_name TEXT,
                is_tracked BOOLEAN DEFAULT FALSE,
                currency VARCHAR(10) DEFAULT 'INR',
                current_price NUMERIC(12, 2),
                previous_price NUMERIC(12, 2),
                last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- AUTO-MIGRATION (Fixes "Column does not exist" error) ---
        // This ensures old databases get the new columns without needing a reinstall
        await client.query(`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS site_name TEXT;`);
        await client.query(`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS previous_price NUMERIC(12, 2);`);
        // ------------------------------------------------------------

        // 3. Price History
        await client.query(`
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                bookmark_id INTEGER REFERENCES bookmarks(id) ON DELETE CASCADE,
                price NUMERIC(12, 2) NOT NULL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Shared Bookmarks (New feature)
        await client.query(`
            CREATE TABLE IF NOT EXISTS shared_bookmarks (
                id SERIAL PRIMARY KEY,
                bookmark_id INTEGER REFERENCES bookmarks(id) ON DELETE CASCADE,
                sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bookmark_id, receiver_id)
            );
        `);

        console.log('✅ Database Tables Ready');
    } catch (err) {
        console.error('❌ Database Initialization Failed:', err);
    } finally {
        client.release();
    }
};

module.exports = { pool, initDB };