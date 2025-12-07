const axios = require('axios');

// Send a push notification via Ntfy
async function sendNotification(userSettings, title, message, clickUrl) {
    if (!userSettings.notify_enabled || !userSettings.ntfy_url || !userSettings.ntfy_topic) {
        return; 
    }

    // Ensure no double slashes if user puts / at end of URL
    const baseUrl = userSettings.ntfy_url.replace(/\/$/, '');
    const targetUrl = `${baseUrl}/${userSettings.ntfy_topic}`;
    
    try {
        await axios.post(targetUrl, message, {
            headers: {
                'Title': title,
                'Click': clickUrl,
                'Tags': 'moneybag,chart_with_downwards_trend',
                'Priority': 'default'
            }
        });
        console.log(`🔔 Notification sent to ${userSettings.ntfy_topic}`);
    } catch (error) {
        console.error(`❌ Failed to send notification: ${error.message}`);
    }
}

module.exports = { sendNotification };