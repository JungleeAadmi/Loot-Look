const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB, pool } = require('./db');
const { scrapeBookmark } = require('./scraper');
const { startCronJobs } = require('./cron');
const { authenticateToken, register, login } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));

// Initialize System
// We wrap this in an async function to catch errors
(async () => {
    try {
        await initDB();
        startCronJobs();
    } catch (err) {
        console.error("Critical Startup Error:", err);
    }
})();

// --- AUTH ROUTES ---
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// --- SEARCH USERS ---
app.get('/api/users/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    try {
        const result = await pool.query(
            'SELECT id, username FROM users WHERE username ILIKE $1 AND id != $2 LIMIT 5', 
            [`%${q}%`, req.user.id]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Search failed' }); }
});

// --- BOOKMARKS ---

// 1. Add Bookmark
app.post('/api/bookmarks', authenticateToken, async (req, res) => {
    const { url } = req.body;
    console.log(`📝 [API] Request to add: ${url}`);
    
    try {
        const screenshotDir = path.join(__dirname, '../public/screenshots');
        const data = await scrapeBookmark(url, screenshotDir);
        console.log(`   -> Scrape result: ${data.title}`);

        const result = await pool.query(`
            INSERT INTO bookmarks (user_id, url, title, image_url, site_name, is_tracked, current_price, currency)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [req.user.id, url, data.title, data.imagePath, data.site_name, data.isTracked, data.price, data.currency]);

        if (data.isTracked) {
            await pool.query(`INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)`, [result.rows[0].id, data.price]);
        }
        res.json(result.rows[0]);
    } catch (err) { 
        console.error("❌ [API Error] Add failed:", err);
        res.status(500).json({ error: 'Failed to add link.' }); 
    }
});

// 2. Get All Bookmarks
app.get('/api/bookmarks', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, 
                   u.username as owner_name,
                   CASE WHEN b.user_id = $1 THEN NULL ELSE u.username END as shared_by,
                   (SELECT u2.username FROM shared_bookmarks sb 
                    JOIN users u2 ON sb.receiver_id = u2.id 
                    WHERE sb.bookmark_id = b.id LIMIT 1) as shared_with
            FROM bookmarks b
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN shared_bookmarks sb ON b.id = sb.bookmark_id
            WHERE b.user_id = $1 OR sb.receiver_id = $1
            ORDER BY b.last_checked DESC
        `, [req.user.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// 3. Share Bookmark
app.post('/api/bookmarks/:id/share', authenticateToken, async (req, res) => {
    const { receiverId } = req.body;
    try {
        const check = await pool.query('SELECT * FROM bookmarks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (check.rows.length === 0) return res.status(403).json({ error: 'Unauthorized' });

        await pool.query(
            'INSERT INTO shared_bookmarks (bookmark_id, sender_id, receiver_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [req.params.id, req.user.id, receiverId]
        );
        res.json({ message: 'Shared successfully' });
    } catch (err) { res.status(500).json({ error: 'Share failed' }); }
});

// 4. Force Check (Refresh)
app.post('/api/bookmarks/:id/check', authenticateToken, async (req, res) => {
    try {
        const bm = await pool.query('SELECT * FROM bookmarks WHERE id = $1', [req.params.id]);
        if (bm.rows.length === 0) return res.status(404).send('Not found');

        const screenshotDir = path.join(__dirname, '../public/screenshots');
        const data = await scrapeBookmark(bm.rows[0].url, screenshotDir);

        if (data.price) {
            const oldPrice = parseFloat(bm.rows[0].current_price || 0);
            await pool.query(`
                UPDATE bookmarks 
                SET current_price = $1, previous_price = $2, 
                    title = $3, image_url = $4, last_checked = NOW() 
                WHERE id = $5
            `, [data.price, oldPrice, data.title, data.imagePath, req.params.id]);
            
            await pool.query('INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)', [req.params.id, data.price]);
        } else {
            await pool.query(`
                UPDATE bookmarks 
                SET title = $1, image_url = $2, last_checked = NOW() 
                WHERE id = $3
            `, [data.title, data.imagePath, req.params.id]);
        }

        res.json({ message: 'Updated', price: data.price });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// 5. Delete Bookmark
app.delete('/api/bookmarks/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// --- SERVE FRONTEND ---
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 LootLook running on ${PORT}`));