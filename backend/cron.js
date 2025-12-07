const cron = require('node-cron');
const { pool } = require('./db');
const { scrapeBookmark } = require('./scraper');
const { sendNotification } = require('./notifications');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '../public/screenshots');

const startCronJobs = () => {
    console.log('⏰ Cron Jobs Scheduled (Every 12 Hours)');

    // Run at 00:00 and 12:00
    cron.schedule('0 0,12 * * *', async () => {
        console.log('🔄 Starting 12-Hour Price Check...');
        
        const client = await pool.connect();
        let updatedCount = 0;
        let usersToNotifyComplete = new Set(); 

        try {
            // Get bookmarks + owner preferences
            const res = await client.query(`
                SELECT b.*, 
                       u.ntfy_url, u.ntfy_topic, u.notify_enabled,
                       u.notify_on_sync_complete, u.notify_on_price_increase,
                       u.id as user_id
                FROM bookmarks b
                JOIN users u ON b.user_id = u.id
                WHERE b.is_tracked = TRUE
            `);
            const bookmarks = res.rows;

            console.log(`Found ${bookmarks.length} items to check.`);

            for (const bookmark of bookmarks) {
                if (bookmark.notify_on_sync_complete && bookmark.notify_enabled) {
                    usersToNotifyComplete.add(bookmark.user_id);
                }

                const newData = await scrapeBookmark(bookmark.url, SCREENSHOT_DIR);

                if (newData.price) {
                    const currentPrice = parseFloat(newData.price);
                    const oldPrice = parseFloat(bookmark.current_price || 0);

                    await client.query(`
                        UPDATE bookmarks 
                        SET current_price = $1, previous_price = $2, last_checked = NOW(), 
                            title = $3, image_url = $4
                        WHERE id = $5
                    `, [currentPrice, oldPrice, newData.title, newData.imagePath, bookmark.id]);

                    await client.query(`INSERT INTO price_history (bookmark_id, price) VALUES ($1, $2)`, [bookmark.id, currentPrice]);
                    
                    updatedCount++;

                    // --- PRICE ALERTS ---
                    if (oldPrice > 0) {
                        // DROP
                        if (currentPrice < oldPrice) {
                            const drop = oldPrice - currentPrice;
                            await sendNotification(
                                bookmark, 
                                `Price Drop Alert! 📉`,
                                `${bookmark.title.substring(0, 40)}... dropped by ${bookmark.currency} ${drop}. Now: ${currentPrice}`,
                                bookmark.url
                            );
                        }
                        // INCREASE (Optional)
                        else if (currentPrice > oldPrice && bookmark.notify_on_price_increase) {
                            const hike = currentPrice - oldPrice;
                            await sendNotification(
                                bookmark,
                                `Price Increase 📈`,
                                `${bookmark.title.substring(0, 40)}... increased by ${bookmark.currency} ${hike}. Now: ${currentPrice}`,
                                bookmark.url
                            );
                        }
                    }
                }
            }

            // --- SYNC COMPLETE ---
            for (const userId of usersToNotifyComplete) {
                const userRes = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
                const user = userRes.rows[0];
                
                await sendNotification(
                    user,
                    `Sync Complete ✅`,
                    `Checked ${updatedCount} items at ${new Date().toLocaleTimeString()}.`,
                    '' 
                );
            }

        } catch (err) {
            console.error('❌ Cron Job Failed:', err);
        } finally {
            client.release();
        }
    });
};

module.exports = { startCronJobs };