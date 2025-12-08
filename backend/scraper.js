const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { extractPriceFromImage } = require('./ocr'); 

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

        browser = await chromium.launch({
            headless: false,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
                '--window-size=1080,1920', '--disable-blink-features=AutomationControlled'
            ]
        });

        const context = await browser.newContext({
            userAgent: DESKTOP_UA,
            viewport: { width: 1080, height: 1920 },
            deviceScaleFactor: 1,
            isMobile: false, 
            locale: 'en-IN', timezoneId: 'Asia/Kolkata',
            extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
        });

        await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

        const page = await context.newPage();

        try {
            console.log(`   -> Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (navError) { console.warn(`   ⚠️ Navigation timeout. Proceeding.`); }
        
        // Anti-Popup
        const safeClick = async (selector) => {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible({ timeout: 1000 })) await el.click({ timeout: 500 });
            } catch (e) {}
        };
        await safeClick('button:has-text("Accept")');
        await safeClick('[aria-label="Close"]');

        // --- SMART WAIT (The Fix) ---
        // Explicitly wait for price elements on known sites to ensure they render
        try {
            const waitSelectors = ['h1', 'img'];
            if (url.includes('myntra')) waitSelectors.push('.pdp-price', '.pdp-selling-price');
            if (url.includes('flipkart')) waitSelectors.push('div[class*="_30jeq3"]', 'div[class*="Nx9bqj"]');
            if (url.includes('amazon')) waitSelectors.push('.a-price-whole');

            await Promise.race([
                ...waitSelectors.map(s => page.waitForSelector(s, { timeout: 5000 }).catch(()=>{})),
                new Promise(r => setTimeout(r, 2000))
            ]);

            // Scroll to force lazy loads
            await page.evaluate(async () => {
                window.scrollTo(0, document.body.scrollHeight / 3);
                await new Promise(r => setTimeout(r, 1000));
                window.scrollTo(0, 0);
            });
            await page.waitForTimeout(1000); 
        } catch (e) {}

        // Screenshot
        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        
        await page.screenshot({ path: filePath, quality: 60 });
        data.imagePath = `/screenshots/${fileName}`;
        console.log(`   -> Screenshot saved.`);

        const content = await page.content();
        const $ = cheerio.load(content);
        
        data.title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text().trim() || data.site_name;

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

        // Layer 2: Selectors (Prioritized)
        if (!data.price) {
            const selectors = [
                '.pdp-selling-price',       // Myntra Main
                '.pdp-price strong',        // Myntra Backup
                '.a-price-whole',           // Amazon
                'div[class*="_30jeq3"]',    // Flipkart
                'div[class*="Nx9bqj"]',     // Flipkart New
                'h4:contains("₹")',         // Meesho
                '[data-testid="price"]',
                '.price', '[class*="price"]',
                // Generic catch-alls at the bottom
                'span:contains("₹")',
                'span:contains("Rs.")' 
            ];

            for (const sel of selectors) {
                // Get element
                const el = $(sel).first();
                const text = el.text();
                
                // --- CONTEXT CHECK (The Fix for "Orders above 300") ---
                // If the text or its parent contains invalid keywords, skip it.
                const context = (el.parent().text() + text).toLowerCase();
                if (context.includes('orders above') || 
                    context.includes('min purchase') || 
                    context.includes('save') ||
                    context.includes('off')) {
                    continue; // Skip this "price", it's an offer
                }

                const result = parsePriceAndCurrency(text);
                if (result.price) { 
                    data.price = result.price;
                    if (result.currency) data.currency = result.currency;
                    break; 
                }
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

async function scanImageForPrice(imageRelativePath, publicDir) {
    const fileName = path.basename(imageRelativePath);
    const absPath = path.join(publicDir, 'screenshots', fileName);
    if (!fs.existsSync(absPath)) return null;
    return await extractPriceFromImage(absPath);
}

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