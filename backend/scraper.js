const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

async function scrapeBookmark(url, screenshotDir) {
    console.log(`🔍 Scraping: ${url}`);
    
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        viewport: { width: 1366, height: 768 }
    });

    const page = await context.newPage();
    let data = { title: 'Unknown', price: null, currency: 'INR', imagePath: null, isTracked: false };

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Screenshot
        const fileName = `${Date.now()}_thumb.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({ path: filePath, quality: 50 });
        data.imagePath = `/screenshots/${fileName}`;

        // Content
        const content = await page.content();
        const $ = cheerio.load(content);
        data.title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'No Title';

        // Price Logic
        if (url.includes('amazon')) {
            const priceText = $('.a-price-whole').first().text();
            if (priceText) data.price = parsePrice(priceText);
        } else if (url.includes('flipkart')) {
            const priceText = $('div[class*="_30jeq3"]').first().text();
            if (priceText) data.price = parsePrice(priceText);
        }

        // Fallback: JSON-LD
        if (!data.price) {
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    if (json['@type'] === 'Product' && json.offers) {
                        const offer = Array.isArray(json.offers) ? json.offers[0] : json.offers;
                        data.price = parseFloat(offer.price);
                        if (offer.priceCurrency) data.currency = offer.priceCurrency;
                    }
                } catch (e) {}
            });
        }

        if (data.price && data.price > 0) data.isTracked = true;

    } catch (error) {
        console.error(`❌ Error scraping ${url}:`, error.message);
    } finally {
        await browser.close();
    }
    return data;
}

function parsePrice(text) {
    if (!text) return null;
    return parseFloat(text.replace(/[^0-9.]/g, ''));
}

module.exports = { scrapeBookmark };