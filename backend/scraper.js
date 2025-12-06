const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { extractPriceFromImage } = require('./ocr'); 

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 1. Main Scraper Function
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
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1080,1920', // Matched to viewport
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const context = await browser.newContext({
            userAgent: DESKTOP_UA,
            viewport: { width: 1080, height: 1920 }, // 1080p Portrait Mode
            deviceScaleFactor: 1,
            isMobile: false,
            hasTouch: false,
            locale: 'en-IN',
            timezoneId: 'Asia/Kolkata',
            extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const page = await context.newPage();

        try {
            console.log(`   -> Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (navError) {
            console.warn(`   ⚠️ Navigation timeout. Proceeding anyway.`);
        }
        
        const safeClick = async (selector) => {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible({ timeout: 1000 })) {
                    await el.click({ timeout: 500 });
                }
            } catch (e) {}
        };
        await safeClick('button:has-text("Accept")');
        await safeClick('[aria-label="Close"]');

        try {
            await page.evaluate(async () => {
                window.scrollTo(0, document.body.scrollHeight / 2);
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

        // Layer 2: Selectors
        if (!data.price) {
            const selectors = ['.pdp-price strong', '.pdp-price', '.a-price-whole', 'div[class*="_30jeq3"]', 'h4:contains("₹")', '.price', '[class*="price"]'];
            for (const sel of selectors) {
                const text = $(sel).first().text();
                const p = parsePrice(text);
                if (p) { data.price = p; break; }
            }
        }

        // Layer 3: Meta
        if (!data.price) {
            const metaPrice = $('meta[property="product:price:amount"]').attr('content') || 
                              $('meta[property="og:price:amount"]').attr('content');
            if (metaPrice) data.price = parseFloat(metaPrice);
        }

        if (data.price && !isNaN(data.price)) data.isTracked = true;

    } catch (error) {
        console.error(`❌ [Scraper Error] ${url}:`, error.message);
    } finally {
        if (browser) await browser.close();
    }

    return data;
}

// 2. On-Demand OCR Function (New Export)
async function scanImageForPrice(imageRelativePath, publicDir) {
    // imageRelativePath is like "/screenshots/123.jpg"
    // publicDir is the absolute path to "backend/public"
    const fileName = path.basename(imageRelativePath);
    const absPath = path.join(publicDir, 'screenshots', fileName);
    
    if (!fs.existsSync(absPath)) return null;

    console.log(`👁️ [OCR Demand] Scanning: ${absPath}`);
    return await extractPriceFromImage(absPath);
}

function parsePrice(text) {
    if (!text) return null;
    const clean = text.replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

module.exports = { scrapeBookmark, scanImageForPrice };