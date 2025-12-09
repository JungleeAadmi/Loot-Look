const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { extractPriceFromImage } = require('./ocr'); 

// REVERTED TO MOBILE UA (Matches 1080x1920 viewport to prevent white screen)
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36';

const CURRENCY_MAP = {
    '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', 'Rs': 'INR', 'RP': 'IDR', 'RM': 'MYR', 'AED': 'AED'
};

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
        try { data.site_name = new URL(url).hostname.replace('www.', ''); } 
        catch (e) { data.site_name = 'Web'; }

        // HEADFUL MODE (Required for Meesho to render)
        browser = await chromium.launch({
            headless: false, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--window-size=1080,1920', 
                '--disable-blink-features=AutomationControlled',
                '--start-maximized'
            ]
        });

        const context = await browser.newContext({
            userAgent: MOBILE_UA, // Matches viewport size
            viewport: { width: 1080, height: 1920 },
            deviceScaleFactor: 2.625, // Pixel 7 density
            isMobile: true, // Native mobile emulation
            hasTouch: true,
            locale: 'en-IN', 
            timezoneId: 'Asia/Kolkata',
            extraHTTPHeaders: { 
                'Accept-Language': 'en-US,en;q=0.9',
                'Upgrade-Insecure-Requests': '1',
                // Google Referer helps bypass "direct traffic" blocks
                'Referer': 'https://www.google.com/' 
            }
        });

        // STEALTH: Hide automation indicators
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        const page = await context.newPage();

        try {
            console.log(`   -> Navigating to ${url}...`);
            // Wait for network idle to ensure React apps finish rendering
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // Give it a moment to paint pixels (Critical for white screen fix)
            await page.waitForTimeout(3000);
        } catch (navError) { 
            console.warn(`   ⚠️ Navigation timeout. Proceeding.`); 
        }
        
        // --- DOM CLEANER (Remove Overlays) ---
        try {
            await page.evaluate(() => {
                const selectors = [
                    '[class*="modal"]', '[class*="popup"]', '[class*="overlay"]',
                    '.age-gate', '.cookie-banner', '#install-app-banner'
                ];
                selectors.forEach(s => {
                    document.querySelectorAll(s).forEach(el => el.remove());
                });
            });
        } catch(e) {}

        // Anti-Popup Clicker
        const safeClick = async (selector) => {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible({ timeout: 1000 })) await el.click({ timeout: 500 });
            } catch (e) {}
        };
        await safeClick('button:has-text("Accept")');
        await safeClick('button:has-text("Close")');
        await safeClick('[aria-label="Close"]');

        try {
            // Scroll Logic
            await page.evaluate(async () => {
                window.scrollTo(0, document.body.scrollHeight / 3);
                await new Promise(r => setTimeout(r, 1000));
                window.scrollTo(0, 0);
            });
            await page.waitForTimeout(2000); 
        } catch (e) {}

        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        
        await page.screenshot({ path: filePath, quality: 60 });
        data.imagePath = `/screenshots/${fileName}`;
        console.log(`   -> Screenshot saved.`);

        const content = await page.content();
        const $ = cheerio.load(content);
        
        // Mobile-Friendly Title Extraction
        data.title = $('h1').first().text().trim() || 
                     $('meta[property="og:title"]').attr('content') || 
                     $('title').text().trim() || 
                     data.site_name;

        // Layer 1: JSON-LD
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

        // Layer 2: Selectors (Updated for Mobile Layouts)
        if (!data.price) {
            const selectors = [
                '.pdp-selling-price', '.pdp-price strong', // Myntra
                '.a-price .a-offscreen', '.a-price-whole', // Amazon
                'div[class*="_30jeq3"]', 'div[class*="Nx9bqj"]', // Flipkart
                'h4', // Meesho Mobile often uses H4
                '[data-testid="price"]',
                '.price', '[class*="price"]',
                'span:contains("₹")', 'span:contains("Rs.")' 
            ];

            for (const sel of selectors) {
                const elements = $(sel);
                for (let i = 0; i < elements.length; i++) {
                    const el = elements.eq(i);
                    const text = el.text();
                    
                    const context = (el.parent().text() + el.parent().parent().text()).toLowerCase();
                    if (context.includes('orders above') || 
                        context.includes('min purchase') || 
                        context.includes('save') || 
                        context.includes('off') || 
                        context.includes('coupon') ||
                        el.parents('.coupons, .offers').length > 0) {
                        continue; 
                    }

                    const result = parsePriceAndCurrency(text);
                    if (result.price) { 
                        data.price = result.price;
                        if (result.currency) data.currency = result.currency;
                        break; 
                    }
                }
                if (data.price) break; 
            }
        }

        // Layer 3: Meta
        if (!data.price) {
            const metaPrice = $('meta[property="product:price:amount"]').attr('content') || $('meta[property="og:price:amount"]').attr('content');
            if (metaPrice) data.price = parseFloat(metaPrice);
            const metaCurr = $('meta[property="product:price:currency"]').attr('content');
            if (metaCurr) data.currency = metaCurr;
        }

        // Layer 4: OCR Backup
        if (!data.price && data.imagePath) {
            console.log("   ⚠️ Standard scraping failed. Attempting OCR backup...");
            const absPath = path.resolve(screenshotDir, fileName);
            const ocrPrice = await extractPriceFromImage(absPath);
            if (ocrPrice) data.price = ocrPrice;
        }

        if (data.price && !isNaN(data.price)) data.isTracked = true;

    } catch (error) {
        console.error(`❌ [Scraper Error] ${url}:`, error.message);
    } finally {
        if (browser) await browser.close();
    }

    return data;
}

// Exported for On-Demand OCR
async function scanImageForPrice(imageRelativePath, publicDir) {
    const fileName = path.basename(imageRelativePath);
    const absPath = path.join(publicDir, 'screenshots', fileName);
    if (!fs.existsSync(absPath)) return null;
    return await extractPriceFromImage(absPath);
}

// Helper Function
function parsePriceAndCurrency(text) {
    if (!text) return { price: null, currency: null };
    let currency = null;
    for (const [symbol, code] of Object.entries(CURRENCY_MAP)) {
        if (text.includes(symbol)) { currency = code; break; }
    }
    const clean = text.replace(/[^0-9.]/g, ''); 
    const num = parseFloat(clean);
    if (isNaN(num) || num < 1) return { price: null, currency: null };
    return { price: num, currency: currency };
}

module.exports = { scrapeBookmark, scanImageForPrice };