const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Mobile User Agents often get better pricing pages/less blocking
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.193 Mobile Safari/537.36';

async function scrapeBookmark(url, screenshotDir) {
    console.log(`🔍 Scraping: ${url}`);
    
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: MOBILE_UA,
        viewport: { width: 1080, height: 1920 }, // Mobile Portrait for long screenshots
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
    });

    const page = await context.newPage();
    let data = {
        title: 'Unknown',
        price: null,
        currency: 'INR',
        imagePath: null,
        isTracked: false,
        site_name: new URL(url).hostname.replace('www.', '')
    };

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        
        // Anti-popup logic (Click "Confirm Age" or "Accept Cookies" if visible)
        try {
            const popupText = "confirm|accept|enter|yes|agree|continue";
            const btn = await page.getByRole('button', { name: new RegExp(popupText, 'i') }).first();
            if (await btn.isVisible()) {
                await btn.click({ timeout: 2000 }).catch(() => {});
                await page.waitForTimeout(1000);
            }
        } catch (e) {}

        // Scroll to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(3000); 

        // Screenshot
        const fileName = `${Date.now()}_thumb.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        
        await page.screenshot({ path: filePath, quality: 60 });
        data.imagePath = `/screenshots/${fileName}`;

        // Parse Content
        const content = await page.content();
        const $ = cheerio.load(content);
        
        data.title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || 'No Title';

        // --- Price Heuristics ---
        
        // 1. JSON-LD (Most reliable for Myntra/Flipkart/Amazon)
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const entities = Array.isArray(json) ? json : [json];
                const product = entities.find(e => e['@type'] === 'Product');
                if (product && product.offers) {
                    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                    data.price = parseFloat(offer.price);
                    if (offer.priceCurrency) data.currency = offer.priceCurrency;
                }
            } catch (e) {}
        });

        // 2. Specific Selectors (Fallback)
        if (!data.price) {
            if (url.includes('amazon')) {
                const p = $('.a-price-whole').first().text();
                if (p) data.price = parsePrice(p);
            } else if (url.includes('flipkart')) {
                const p = $('div[class*="_30jeq3"]').first().text();
                if (p) data.price = parsePrice(p);
            } else if (url.includes('myntra')) {
                // Myntra uses scripts heavily
                const script = $('script:contains("pdpData")').html();
                if (script) {
                    const match = script.match(/"price":(\d+)/);
                    if (match) data.price = parseInt(match[1]);
                }
            } else if (url.includes('meesho')) {
                const p = $('h4').filter((i, el) => $(el).text().includes('₹')).first().text();
                if(p) data.price = parsePrice(p);
            }
        }

        // 3. Meta Tags (Fallback)
        if (!data.price) {
            const metaPrice = $('meta[property="product:price:amount"]').attr('content') || 
                              $('meta[name="twitter:data1"]').attr('content');
            if (metaPrice) data.price = parseFloat(metaPrice);
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