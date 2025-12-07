const axios = require('axios');

// Helper to clean strings for HTTP headers
function cleanHeader(str) {
    if (!str) return "";
    let clean = str.replace(/[\r\n]+/g, " ");
    clean = clean.replace(/[^\x20-\x7E]/g, "");
    return clean.trim();
}

async function sendNotification(userSettings, title, message, clickUrl) {
    if (!userSettings || !userSettings.notify_enabled || !userSettings.ntfy_url || !userSettings.ntfy_topic) {
        return; 
    }

    const baseUrl = userSettings.ntfy_url.replace(/\/$/, '');
    const targetUrl = `${baseUrl}/${userSettings.ntfy_topic}`;
    const safeTitle = cleanHeader(title);

    console.log(`🔔 [Ntfy Debug] POSTing to: ${targetUrl}`);

    try {
        // CHANGE: Send 'message' as the raw data body, not a JSON object
        await axios({
            method: 'post',
            url: targetUrl,
            data: message, // Raw string
            headers: {
                'Title': safeTitle, 
                'Click': clickUrl,
                'Tags': 'moneybag,chart_with_downwards_trend',
                'Priority': 'default',
                'Content-Type': 'text/plain' // Explicitly say it's text
            }
        });
        console.log(`✅ Notification sent to ${userSettings.ntfy_topic}`);
    } catch (error) {
        console.error(`❌ Failed to send notification to ${targetUrl}`);
        console.error(`   Error: ${error.message}`);
        if (error.response) {
            const bodyPreview = JSON.stringify(error.response.data).substring(0, 200);
            console.error(`   Server Response (${error.response.status}): ${bodyPreview}`);
        }
    }
}

module.exports = { sendNotification };