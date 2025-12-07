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
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- NOTIFICATION MIGRATION ---
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ntfy_url TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ntfy_topic TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN DEFAULT FALSE;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_on_sync_complete BOOLEAN DEFAULT FALSE;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_on_price_increase BOOLEAN DEFAULT FALSE;`);
        // ------------------------------

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

        await client.query(`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS site_name TEXT;`);
        await client.query(`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS previous_price NUMERIC(12, 2);`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                bookmark_id INTEGER REFERENCES bookmarks(id) ON DELETE CASCADE,
                price NUMERIC(12, 2) NOT NULL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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