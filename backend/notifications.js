const axios = require('axios');

// Helper to clean strings for HTTP headers
// Headers cannot contain newlines or certain non-ASCII chars depending on the node version
function cleanHeader(str) {
    if (!str) return "";
    // Remove newlines and excess whitespace
    return str.replace(/[\r\n]+/g, " ").trim();
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
    // We encode the title in Base64 or use pure ASCII if we want to be super safe. 
    // Ntfy supports UTF-8 in headers usually, but Node's http client is strict.
    // The safest way is to put the title in the body or clean it thoroughly.
    // Here we clean it of control characters.
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
        // Log the actual response if available to debug server-side rejection
        if (error.response) {
            console.error(`   -> Server responded: ${error.response.status} ${JSON.stringify(error.response.data)}`);
        }
    }
}

module.exports = { sendNotification };