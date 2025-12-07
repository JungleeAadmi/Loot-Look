const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB, pool } = require('./db');
const { scrapeBookmark, scanImageForPrice } = require('./scraper');
const { startCronJobs } = require('./cron');
const { sendNotification } = require('./notifications'); 
const { authenticateToken, register, login } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));

(async () => {
    try { await initDB(); startCronJobs(); } 
    catch (err) { console.error("Critical Startup Error:", err); }
})();

// --- AUTH ---
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// --- SETTINGS ---
app.get('/api/user/settings', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ntfy_url, ntfy_topic, notify_enabled, 
                   notify_on_sync_complete, notify_on_price_increase,
                   notify_on_price_drop, notify_on_share
            FROM users WHERE id = $1
        `, [req.user.id]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Failed to load settings' }); }
});

app.put('/api/user/settings', authenticateToken, async (req, res) => {
    const { 
        ntfyUrl, ntfyTopic, notifyEnabled, 
        notifySync, notifyIncrease, notifyDrop, notifyShare 
    } = req.body;
    
    try {
        await pool.query(`
            UPDATE users SET 
                ntfy_url = $1, 
                ntfy_topic = $2, 
                notify_enabled = $3,
                notify_on_sync_complete = $4,
                notify_on_price_increase = $5,
                notify_on_price_drop = $6,
                notify_on_share = $7
            WHERE id = $8
        `, [ntfyUrl, ntfyTopic, notifyEnabled, notifySync, notifyIncrease, notifyDrop, notifyShare, req.user.id]);
        res.json({ message: 'Settings saved' });
    } catch (err) { res.status(500).json({ error: 'Failed to save' }); }
});

app.post('/api/user/test-notify', authenticateToken, async (req, res) => {
    const { ntfyUrl, ntfyTopic } = req.body;
    try {
        const fakeSettings = { ntfy_url: ntfyUrl, ntfy_topic: ntfyTopic, notify_enabled: true };
        await sendNotification(fakeSettings, 'LootLook Test', 'This is a test alert from your LootLook server! 🚀', 'https://google.com');
        res.json({ message: 'Sent' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// --- USERS & BOOKMARKS ---
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

// ADD BOOKMARK (Updated with Notification)
app.post('/api/bookmarks', authenticateToken, async (req, res) => {
    const { url } = req.body;
    try {
        const screenshotDir = path.join(__dirname, '../public/screenshots');
        const data = await scrapeBookmark(url, screenshotDir);
        
        const result = await pool.query(`
            INSERT INTO bookmarks (user_id, url, title, image_url, site_name, is_tracked, current_price, currency, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING *
        `, [req.user.id, url, data.title, data.imagePath, data.site_name, data.isTracked, data.price, data.currency]);

        if (data.isTracked) {
            await pool.query(`INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)`, [result.rows[0].id, data.price]);
        }

        // --- NOTIFY USER OF SUCCESS ---
        // Fetch user settings to check if they want alerts
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const userSettings = userRes.rows[0];
        
        // We use 'notify_enabled' as a general gate for this "Add" confirmation
        if (userSettings && userSettings.notify_enabled) {
            await sendNotification(
                userSettings,
                `Link Added 🔖`,
                `Successfully added: ${data.title.substring(0, 40)}...`,
                ''
            );
        }
        // ------------------------------

        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Failed to add link' }); }
});

app.get('/api/bookmarks', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, 
                   u.username as owner_name,
                   CASE WHEN b.user_id = $1 THEN NULL ELSE u.username END as shared_by,
                   CASE WHEN b.user_id = $1 THEN 
                       (SELECT u2.username FROM shared_bookmarks sb 
                        JOIN users u2 ON sb.receiver_id = u2.id 
                        WHERE sb.bookmark_id = b.id LIMIT 1)
                   ELSE NULL END as shared_with
            FROM bookmarks b
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN shared_bookmarks sb ON b.id = sb.bookmark_id
            WHERE b.user_id = $1 OR sb.receiver_id = $1
            ORDER BY b.created_at DESC
        `, [req.user.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/bookmarks/:id/shares', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username 
            FROM shared_bookmarks sb
            JOIN users u ON sb.receiver_id = u.id
            WHERE sb.bookmark_id = $1 AND sb.sender_id = $2
        `, [req.params.id, req.user.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch shares' }); }
});

app.get('/api/bookmarks/:id/history', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT price, recorded_at 
            FROM price_history 
            WHERE bookmark_id = $1 
            ORDER BY recorded_at ASC
        `, [req.params.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'History failed' }); }
});

// SHARE + NOTIFICATION (Debugged)
app.post('/api/bookmarks/:id/share', authenticateToken, async (req, res) => {
    const { receiverId } = req.body;
    try {
        const check = await pool.query('SELECT * FROM bookmarks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (check.rows.length === 0) return res.status(403).json({ error: 'Unauthorized' });
        const bookmark = check.rows[0];

        await pool.query(
            'INSERT INTO shared_bookmarks (bookmark_id, sender_id, receiver_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [req.params.id, req.user.id, receiverId]
        );

        // Fetch Receiver Settings
        const receiverRes = await pool.query('SELECT ntfy_url, ntfy_topic, notify_enabled, notify_on_share FROM users WHERE id = $1', [receiverId]);
        
        if (receiverRes.rows.length > 0) {
            const receiver = receiverRes.rows[0];
            console.log(`[Share Notify] Checking for user ${receiverId}... Enabled: ${receiver.notify_enabled}, OnShare: ${receiver.notify_on_share}`);
            
            if (receiver.notify_enabled && receiver.notify_on_share) {
                await sendNotification(
                    receiver,
                    `New Shared Item 🎁`,
                    `@${req.user.username} shared "${bookmark.title}" with you!`,
                    ''
                );
            }
        } else {
            console.log(`[Share Notify] Receiver ${receiverId} not found or no settings.`);
        }

        res.json({ message: 'Shared' });
    } catch (err) { 
        console.error("Share Error:", err);
        res.status(500).json({ error: 'Share failed' }); 
    }
});

app.post('/api/bookmarks/:id/unshare', authenticateToken, async (req, res) => {
    const { receiverId } = req.body;
    try {
        await pool.query('DELETE FROM shared_bookmarks WHERE bookmark_id = $1 AND sender_id = $2 AND receiver_id = $3', [req.params.id, req.user.id, receiverId]);
        res.json({ message: 'Unshared' });
    } catch (err) { res.status(500).json({ error: 'Unshare failed' }); }
});

app.post('/api/bookmarks/:id/check', authenticateToken, async (req, res) => {
    try {
        const bm = await pool.query('SELECT * FROM bookmarks WHERE id = $1', [req.params.id]);
        if (bm.rows.length === 0) return res.status(404).send('Not found');
        const screenshotDir = path.join(__dirname, '../public/screenshots');
        const data = await scrapeBookmark(bm.rows[0].url, screenshotDir);
        if (data.price) {
            const oldPrice = parseFloat(bm.rows[0].current_price || 0);
            await pool.query(`UPDATE bookmarks SET current_price = $1, previous_price = $2, title = $3, image_url = $4, last_checked = NOW() WHERE id = $5`, [data.price, oldPrice, data.title, data.imagePath, req.params.id]);
            await pool.query('INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)', [req.params.id, data.price]);
        } else {
            await pool.query(`UPDATE bookmarks SET title = $1, image_url = $2, last_checked = NOW() WHERE id = $3`, [data.title, data.imagePath, req.params.id]);
        }
        res.json({ message: 'Updated', price: data.price });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/bookmarks/:id/ocr', authenticateToken, async (req, res) => {
    try {
        const bm = await pool.query('SELECT * FROM bookmarks WHERE id = $1', [req.params.id]);
        if (bm.rows.length === 0) return res.status(404).send('Not found');
        const bookmark = bm.rows[0];
        if (!bookmark.image_url) return res.status(400).json({ error: 'No image' });
        const { scanImageForPrice } = require('./scraper');
        const price = await scanImageForPrice(bookmark.image_url, path.join(__dirname, '../public'));
        if (price) {
            await pool.query(`UPDATE bookmarks SET current_price = $1, is_tracked = TRUE WHERE id = $2`, [price, req.params.id]);
            await pool.query('INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)', [req.params.id, price]);
            res.json({ message: 'Price found', price });
        } else { res.json({ message: 'No price found', price: null }); }
    } catch (err) { res.status(500).json({ error: 'OCR Failed' }); }
});

app.delete('/api/bookmarks/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user.id]);
        if (result.rows.length === 0) {
            const sharedResult = await pool.query('DELETE FROM shared_bookmarks WHERE bookmark_id = $1 AND receiver_id = $2 RETURNING *', [req.params.id, req.user.id]);
            if (sharedResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        }
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 LootLook running on ${PORT}`));