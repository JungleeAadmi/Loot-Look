const cron = require('node-cron');
const { pool } = require('./db');
const { scrapeBookmark } = require('./scraper');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '../public/screenshots');

const startCronJobs = () => {
    console.log('⏰ Cron Jobs Scheduled');
    // Run at 00:00 and 12:00
    cron.schedule('0 0,12 * * *', async () => {
        console.log('🔄 Starting 12-Hour Price Check...');
        const client = await pool.connect();
        try {
            const res = await client.query('SELECT * FROM bookmarks WHERE is_tracked = TRUE');
            for (const bookmark of res.rows) {
                const newData = await scrapeBookmark(bookmark.url, SCREENSHOT_DIR);
                if (newData.price) {
                    await client.query(`UPDATE bookmarks SET current_price = $1, last_checked = NOW(), image_url = $2 WHERE id = $3`, 
                        [newData.price, newData.imagePath, bookmark.id]);
                    await client.query(`INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)`, 
                        [bookmark.id, newData.price]);
                }
            }
        } catch (err) {
            console.error('❌ Cron Job Failed:', err);
        } finally {
            client.release();
        }
    });
};

module.exports = { startCronJobs };