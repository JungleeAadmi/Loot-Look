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
        try {
            data.site_name = new URL(url).hostname.replace('www.', '');
        } catch (e) { data.site_name = 'Web'; }

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled' // Hide bot status
            ]
        });

        const context = await browser.newContext({
            userAgent: MOBILE_UA,
            viewport: { width: 1080, height: 1920 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            locale: 'en-IN',
            timezoneId: 'Asia/Kolkata',
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Upgrade-Insecure-Requests': '1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });

        const page = await context.newPage();

        // 1. ROBUST NAVIGATION
        // We wrap this in a try-catch so if the page is slow (timeout), we DON'T crash.
        // We proceed to take a screenshot of whatever loaded.
        try {
            console.log(`   -> Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch (navError) {
            console.warn(`   ⚠️ Navigation timeout/partial load. Proceeding to scrape anyway.`);
        }
        
        // 2. Anti-Popup (Best Effort)
        const safeClick = async (selector) => {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible({ timeout: 1000 })) {
                    await el.click({ timeout: 500 });
                }
            } catch (e) {}
        };

        await safeClick('button:has-text("Accept")');
        await safeClick('button:has-text("Allow")');
        await safeClick('[aria-label="Close"]');

        // 3. Scroll Logic (Best Effort)
        try {
            await page.evaluate(async () => {
                window.scrollTo(0, document.body.scrollHeight / 3);
                await new Promise(r => setTimeout(r, 500));
                window.scrollTo(0, 0);
            });
            await page.waitForTimeout(1000); 
        } catch (e) {}

        // 4. SCREENSHOT (Guaranteed execution now)
        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        
        await page.screenshot({ path: filePath, quality: 60 });
        data.imagePath = `/screenshots/${fileName}`;
        console.log(`   -> Screenshot saved.`);

        // 5. Parse Data
        const content = await page.content();
        const $ = cheerio.load(content);
        
        // Improved Title Extraction
        data.title = $('h1').first().text().trim() || 
                     $('meta[property="og:title"]').attr('content') || 
                     $('title').text().trim() || 
                     data.site_name;

        // --- Price Layer 1: JSON-LD ---
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
                    }
                }
            } catch (e) {}
        });

        // --- Price Layer 2: Visual Selectors (Updated for Myntra) ---
        if (!data.price) {
            const selectors = [
                '.pdp-price strong',        // Myntra Specific
                '.pdp-price',               // Myntra Generic
                '.a-price-whole',           // Amazon
                'div[class*="_30jeq3"]',    // Flipkart
                'h4:contains("₹")',         // Meesho
                '.price', 
                '[class*="price"]',
                '[data-testid="price"]'
            ];

            for (const sel of selectors) {
                const text = $(sel).first().text();
                const p = parsePrice(text);
                if (p) { data.price = p; break; }
            }
        }

        // --- Price Layer 3: Meta Tags ---
        if (!data.price) {
            const metaPrice = $('meta[property="product:price:amount"]').attr('content') || 
                              $('meta[property="og:price:amount"]').attr('content');
            if (metaPrice) data.price = parseFloat(metaPrice);
        }

        if (data.price && !isNaN(data.price)) data.isTracked = true;

    } catch (error) {
        console.error(`❌ [Scraper Error] ${url}:`, error.message);
        // Even if everything crashes, we try to return whatever data we have
        // so the bookmark is at least saved with the URL.
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