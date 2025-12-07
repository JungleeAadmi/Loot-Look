const axios = require('axios');

// Helper to clean strings for HTTP headers
// Headers cannot contain newlines or certain non-ASCII chars depending on the node version
function cleanHeader(str) {
    if (!str) return "";
    
    // 1. Remove newlines
    let clean = str.replace(/[\r\n]+/g, " ");
    
    // 2. Remove non-ASCII characters (Emojis, smart quotes, etc)
    // This regex keeps only standard printable ASCII characters (codes 32-126)
    clean = clean.replace(/[^\x20-\x7E]/g, "");

    return clean.trim();
}

// Send a push notification via Ntfy
async function sendNotification(userSettings, title, message, clickUrl) {
    // Safety check: ensure settings exist
    if (!userSettings || !userSettings.notify_enabled || !userSettings.ntfy_url || !userSettings.ntfy_topic) {
        return; 
    }

    // Clean URL (remove trailing slash if user added one)
    const baseUrl = userSettings.ntfy_url.replace(/\/$/, '');
    const targetUrl = `${baseUrl}/${userSettings.ntfy_topic}`;
    
    // Sanitize Inputs
    const safeTitle = cleanHeader(title);

    try {
        await axios.post(targetUrl, message, {
            headers: {
                'Title': safeTitle, 
                'Click': clickUrl,
                'Tags': 'moneybag,chart_with_downwards_trend',
                'Priority': 'default'
            }
        });
        console.log(`🔔 Notification sent to ${userSettings.ntfy_topic}`);
    } catch (error) {
        console.error(`❌ Failed to send notification: ${error.message}`);
        if (error.response) {
            console.error(`   -> Server responded: ${error.response.status} ${JSON.stringify(error.response.data)}`);
        }
    }
}

module.exports = { sendNotification };