const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Mobile User Agent (Pixel 7) - Gets better prices, fewer popups
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.193 Mobile Safari/537.36';

async function scrapeBookmark(url, screenshotDir) {
    console.log(`🔍 [Scraper] Starting: ${url}`);
    
    let browser = null;
    let data = {
        title: 'New Bookmark',
        price: null,
        currency: 'INR',
        imagePath: null,
        isTracked: false,
        site_name: 'Web'
    };

    try {
        // Safe hostname parsing
        try {
            data.site_name = new URL(url).hostname.replace('www.', '');
        } catch (e) { data.site_name = 'Web'; }

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // <--- CRITICAL FIX FOR LXC CRASHES
                '--disable-gpu'
            ]
        });

        const context = await browser.newContext({
            userAgent: MOBILE_UA,
            viewport: { width: 1080, height: 1920 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            locale: 'en-IN',
            timezoneId: 'Asia/Kolkata'
        });

        const page = await context.newPage();

        console.log(`   -> Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Anti-Popup Logic
        const safeClick = async (selector) => {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible({ timeout: 2000 })) {
                    console.log(`   -> Clicking popup: ${selector}`);
                    await el.click({ timeout: 1000 });
                    await page.waitForTimeout(500);
                }
            } catch (e) {}
        };

        await safeClick('button:has-text("Accept")');
        await safeClick('button:has-text("Allow")');
        await safeClick('button:has-text("Confirm")');
        await safeClick('[aria-label="Close"]');

        // Scroll & Screenshot
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(2000); 

        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        
        await page.screenshot({ path: filePath, quality: 60 });
        data.imagePath = `/screenshots/${fileName}`;
        console.log(`   -> Screenshot saved.`);

        // Extraction
        const content = await page.content();
        const $ = cheerio.load(content);
        
        data.title = $('meta[property="og:title"]').attr('content') || 
                     $('title').text().trim() || 
                     data.site_name;

        // Price Extraction (Layer 1: JSON-LD)
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const entities = Array.isArray(json) ? json : [json];
                const product = entities.find(e => e['@type'] === 'Product');
                if (product) {
                    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                    if (offer) {
                        data.price = parseFloat(offer.price);
                        if (offer.priceCurrency) data.currency = offer.priceCurrency;
                        console.log(`   -> Found JSON-LD Price: ${data.price}`);
                    }
                }
            } catch (e) {}
        });

        // Price Extraction (Layer 2: Selectors)
        if (!data.price) {
            const selectors = [
                '.a-price-whole',           // Amazon
                'div[class*="_30jeq3"]',    // Flipkart
                '.pdp-price',               // Myntra
                'h4:contains("₹")',         // Meesho
                '.price', '[class*="price"]' // Generic
            ];

            for (const sel of selectors) {
                const text = $(sel).first().text();
                const p = parsePrice(text);
                if (p) {
                    data.price = p;
                    console.log(`   -> Found Selector Price: ${p} (via ${sel})`);
                    break;
                }
            }
        }

        // Price Extraction (Layer 3: Meta)
        if (!data.price) {
            const metaPrice = $('meta[property="product:price:amount"]').attr('content');
            if (metaPrice) {
                data.price = parseFloat(metaPrice);
                console.log(`   -> Found Meta Price: ${data.price}`);
            }
        }

        if (data.price && !isNaN(data.price)) {
            data.isTracked = true;
        }

    } catch (error) {
        console.error(`❌ [Scraper Error] ${url}:`, error.message);
        // Return whatever data we gathered so far (e.g. at least the title/url)
        // This prevents the "Failed to add" error on frontend
    } finally {
        if (browser) await browser.close();
    }

    return data;
}

function parsePrice(text) {
    if (!text) return null;
    const clean = text.replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

module.exports = { scrapeBookmark };