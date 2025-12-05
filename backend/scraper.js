const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Mobile User Agent (Pixel 7) - Gets better prices, fewer popups
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.193 Mobile Safari/537.36';

async function scrapeBookmark(url, screenshotDir) {
    console.log(`🔍 Scraping: ${url}`);
    
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
        // Try to parse hostname for site_name safely
        try {
            data.site_name = new URL(url).hostname.replace('www.', '');
        } catch (e) { data.site_name = 'Web'; }

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({
            userAgent: MOBILE_UA,
            viewport: { width: 1080, height: 1920 }, // 1080x1920 Portrait
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            locale: 'en-IN',
            timezoneId: 'Asia/Kolkata'
        });

        const page = await context.newPage();

        // 1. Navigate with generous timeout
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // 2. Anti-Popup: Generic clicker for "Allow", "Accept", "Close"
        // We use a safe wrapper so this never crashes the script
        const safeClick = async (selector) => {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible({ timeout: 2000 })) {
                    await el.click({ timeout: 1000 });
                    await page.waitForTimeout(500);
                }
            } catch (e) {}
        };

        // Try common popup buttons
        await safeClick('button:has-text("Accept")');
        await safeClick('button:has-text("Allow")');
        await safeClick('button:has-text("Confirm")');
        await safeClick('[aria-label="Close"]');

        // 3. Scroll to load lazy images
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(2000); 

        // 4. Screenshot
        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        
        await page.screenshot({ path: filePath, quality: 60 });
        data.imagePath = `/screenshots/${fileName}`;

        // 5. Parse Data
        const content = await page.content();
        const $ = cheerio.load(content);
        
        // Title Fallback
        data.title = $('meta[property="og:title"]').attr('content') || 
                     $('title').text().trim() || 
                     data.site_name;

        // --- Price Extraction Strategy ---
        
        // Strategy A: JSON-LD (Best for E-commerce)
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const entities = Array.isArray(json) ? json : [json];
                const product = entities.find(e => e['@type'] === 'Product');
                
                if (product) {
                    let offer = null;
                    if (Array.isArray(product.offers)) {
                        offer = product.offers[0]; // Take first offer
                    } else if (product.offers) {
                        offer = product.offers;
                    }
                    
                    if (offer) {
                        data.price = parseFloat(offer.price);
                        if (offer.priceCurrency) data.currency = offer.priceCurrency;
                    }
                }
            } catch (e) {}
        });

        // Strategy B: CSS Selectors (Indian Sites)
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
                    break;
                }
            }
        }

        // Strategy C: Meta Tags
        if (!data.price) {
            const metaPrice = $('meta[property="product:price:amount"]').attr('content');
            if (metaPrice) data.price = parseFloat(metaPrice);
        }

        // Final check
        if (data.price && !isNaN(data.price)) {
            data.isTracked = true;
        }

    } catch (error) {
        console.error(`⚠️ Scrape warning for ${url}:`, error.message);
        // We do NOT throw error here. We return partial data so the user at least gets a bookmark.
        // This solves "Failed to add link".
    } finally {
        if (browser) await browser.close();
    }

    return data;
}

function parsePrice(text) {
    if (!text) return null;
    // Remove everything except digits and dots
    const clean = text.replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

module.exports = { scrapeBookmark };