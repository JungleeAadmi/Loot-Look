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
// Serve screenshots statically
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));

// Initialize System
initDB();
startCronJobs();

// --- AUTH ROUTES ---
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// --- APP ROUTES ---

// 1. Add New Bookmark (Protected)
app.post('/api/bookmarks', authenticateToken, async (req, res) => {
    const { url } = req.body;
    const userId = req.user.id; 
    
    try {
        const screenshotDir = path.join(__dirname, '../public/screenshots');
        const data = await scrapeBookmark(url, screenshotDir);

        const result = await pool.query(`
            INSERT INTO bookmarks (user_id, url, title, image_url, is_tracked, current_price, currency)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [userId, url, data.title, data.imagePath, data.isTracked, data.price, data.currency]);

        if (data.isTracked) {
            await pool.query(`INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)`, 
            [result.rows[0].id, data.price]);
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add bookmark' });
    }
});

// 2. Get All Bookmarks
app.get('/api/bookmarks', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch bookmarks' });
    }
});

// 3. Force Check
app.post('/api/bookmarks/:id/check', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const bm = await pool.query('SELECT * FROM bookmarks WHERE id = $1 AND user_id = $2', [id, userId]);
        if (bm.rows.length === 0) return res.status(404).send('Not found or unauthorized');

        const screenshotDir = path.join(__dirname, '../public/screenshots');
        const data = await scrapeBookmark(bm.rows[0].url, screenshotDir);

        if (data.price) {
            await pool.query('UPDATE bookmarks SET current_price = $1, last_checked = NOW() WHERE id = $2', 
                [data.price, id]);
            await pool.query('INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)', 
                [id, data.price]);
        }

        res.json({ message: 'Updated', price: data.price });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// 4. Delete Bookmark (NEW)
app.delete('/api/bookmarks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const result = await pool.query('DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found or unauthorized' });
        
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// --- SERVE FRONTEND ---
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 LootLook Server running on port ${PORT}`);
});