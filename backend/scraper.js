const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { extractPriceFromImage } = require('./ocr'); 

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

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

        // HEADFUL MODE
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
            userAgent: DESKTOP_UA,
            viewport: { width: 1080, height: 1920 },
            deviceScaleFactor: 1,
            isMobile: false, 
            hasTouch: false,
            locale: 'en-IN', 
            timezoneId: 'Asia/Kolkata',
            extraHTTPHeaders: { 
                'Accept-Language': 'en-US,en;q=0.9',
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://www.google.com/' 
            }
        });

        // STEALTH
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        const page = await context.newPage();

        try {
            console.log(`   -> Navigating to ${url}...`);
            
            // OPTION 3: Wait for Network Idle (The Fix)
            // This waits until the network activity settles down, ensuring React/API calls are done.
            await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
            
        } catch (navError) { 
            console.warn(`   ⚠️ Navigation timeout. Proceeding anyway.`); 
        }
        
        // Anti-Popup
        const safeClick = async (selector) => {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible({ timeout: 1000 })) await el.click({ timeout: 500 });
            } catch (e) {}
        };
        await safeClick('button:has-text("Accept")');
        await safeClick('button:has-text("Close")');
        await safeClick('#sp-cc-accept'); 

        try {
            // Scroll Logic
            await page.evaluate(async () => {
                window.scrollTo(0, document.body.scrollHeight / 3);
                await new Promise(r => setTimeout(r, 1000));
                window.scrollTo(0, 0);
            });
            
            // Double check for network idle after scroll
            try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch(e) {}
            
            await page.waitForTimeout(1500); 
        } catch (e) {}

        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const filePath = path.join(screenshotDir, fileName);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        
        await page.screenshot({ path: filePath, quality: 60 });
        data.imagePath = `/screenshots/${fileName}`;
        console.log(`   -> Screenshot saved.`);

        const content = await page.content();
        const $ = cheerio.load(content);
        
        // Title Extraction
        const titleSelectors = ['#productTitle', 'h1.yhB1nd', '.pdp-title', 'h1.pdp-name', 'h1'];
        for (const sel of titleSelectors) {
            const t = $(sel).first().text().trim();
            if (t && t.length > 5) { data.title = t; break; }
        }
        if (!data.title || data.title === 'New Bookmark') {
            data.title = $('meta[property="og:title"]').attr('content') || data.site_name;
        }

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

        // Layer 2: Selectors
        if (!data.price) {
            const selectors = [
                '.a-price .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice', '.a-price-whole',
                '.pdp-selling-price', '.pdp-price strong',
                'div[class*="_30jeq3"]', 'div[class*="Nx9bqj"]',
                'h4', 
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
        if ((!data.price || data.price < 10) && data.imagePath) {
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

function parsePriceAndCurrency(text) {
    if (!text) return { price: null, currency: null };
    let currency = null;
    for (const [symbol, code] of Object.entries(CURRENCY_MAP)) {
        if (text.includes(symbol)) { currency = code; break; }
    }
    const clean = text.replace(/[^0-9.]/g, ''); 
    const num = parseFloat(clean);
    if (isNaN(num)) return { price: null, currency: null };
    return { price: num, currency: currency };
}

module.exports = { scrapeBookmark, scanImageForPrice };