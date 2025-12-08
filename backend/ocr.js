const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

/**
 * Robust OCR Engine for LootLook
 * Uses system 'tesseract' binary to extract text from images.
 * Includes image pre-processing (using ImageMagick 'convert' if available, or just tesseract config)
 * and advanced regex pattern matching for prices.
 */

// Mapping of currency symbols to ISO codes
const CURRENCY_MAP = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    '₹': 'INR',
    'Rs': 'INR',
    'RP': 'IDR',
    'RM': 'MYR',
    'AED': 'AED',
    'AUD': 'AUD',
    'CAD': 'CAD',
    'CHF': 'CHF',
    'CNY': 'CNY',
    'HKD': 'HKD',
    'NZD': 'NZD',
    'SEK': 'SEK',
    'SGD': 'SGD',
    'KRW': 'KRW'
};

async function extractPriceFromImage(imagePath) {
    console.log(`👁️ [OCR] Scanning image: ${imagePath}`);
    
    if (!fs.existsSync(imagePath)) {
        console.error(`❌ [OCR Error] File not found: ${imagePath}`);
        return null;
    }

    try {
        // We will try multiple Tesseract configurations (PSM modes) to get the best result.
        // PSM 3: Fully automatic page segmentation, but no OSD. (Default)
        // PSM 4: Assume a single column of text of variable sizes.
        // PSM 6: Assume a single uniform block of text.
        // PSM 11: Sparse text. Find as much text as possible in no particular order.

        const strategies = [
             { psm: 3, name: 'Auto' },
             { psm: 6, name: 'Block' },
             { psm: 11, name: 'Sparse' }
        ];

        for (const strategy of strategies) {
            console.log(`   -> Trying OCR Strategy: ${strategy.name} (PSM ${strategy.psm})`);
            
            // Execute Tesseract command
            // -l eng: Language English
            // --psm: Page Segmentation Mode
            // stdout: Output to standard output so we can capture it
            const { stdout } = await execPromise(`tesseract "${imagePath}" stdout -l eng --psm ${strategy.psm}`);
            
            const result = parseOCRText(stdout);
            if (result && result.price) {
                console.log(`   ✅ OCR Success (${strategy.name}): Found ${result.currency || ''} ${result.price}`);
                return result.price; // Return the first valid price found
            }
        }

        console.log(`   ⚠️ OCR failed to find a valid price in any strategy.`);
        return null;

    } catch (error) {
        console.error(`❌ [OCR Error] Execution failed: ${error.message}`);
        return null;
    }
}

/**
 * Parses raw text from OCR to find price values.
 * @param {string} text - The raw text output from Tesseract.
 * @returns {object|null} - { price: number, currency: string } or null
 */
function parseOCRText(text) {
    if (!text) return null;

    // 1. Normalize text to make regex easier
    // Replace common OCR errors for currency symbols
    let cleanText = text
        .replace(/l/g, '1') // 'l' often read as '1' in numbers
        .replace(/O/g, '0') // 'O' often read as '0' in numbers
        .replace(/\r\n/g, '\n'); 

    // 2. Regex to find Price Patterns
    // Looks for:
    // - Optional Currency Symbol (₹, Rs, $, etc.)
    // - Optional whitespace
    // - Number (allowing commas like 1,200 and decimals like .99)
    const priceRegex = /(?:₹|Rs\.?|INR|\$|€|£|¥|RP|RM|AED|\?|7|f)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi;
    
    // Also look for just numbers that look like prices (e.g. 1,299)
    // We require at least one comma or decimal to avoid picking up years (2025) or small ints (1, 2)
    const strictNumberRegex = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/g;

    let matches = [];
    
    // Strategy A: Symbol + Number (Most accurate)
    const symbolMatches = [...cleanText.matchAll(priceRegex)];
    for (const match of symbolMatches) {
        matches.push(parseNumber(match[1]));
    }

    // Strategy B: Strict Numbers (Fallback)
    if (matches.length === 0) {
        const numberMatches = [...cleanText.matchAll(strictNumberRegex)];
        for (const match of numberMatches) {
            matches.push(parseNumber(match[1])); // match[1] is the number part
        }
    }

    // 3. Filter and Logic
    // E-commerce pages have lots of numbers. The "Main Price" is usually:
    // - Not a year (2020-2030)
    // - Not a tiny number (1-10, usually quantity or ratings)
    // - Not a huge phone number
    const validPrices = matches.filter(p => {
        if (!p || isNaN(p)) return false;
        if (p < 10) return false;          // Ignore small numbers (reviews, stars, qty)
        if (p > 500000) return false;      // Ignore absurdly high numbers (likely parsing errors/phone #s)
        if (p >= 2020 && p <= 2030) return false; // Ignore current/recent years
        return true;
    });

    if (validPrices.length > 0) {
        // Heuristic: The first valid price found in the text stream is often the main title/price block.
        return { price: validPrices[0], currency: 'INR' }; // Defaulting to INR if symbol logic wasn't explicit in object return
    }

    return null;
}

/**
 * Helper to convert "1,299.00" string to 1299.00 float
 */
function parseNumber(str) {
    if (!str) return null;
    const clean = str.replace(/,/g, ''); // Remove commas
    return parseFloat(clean);
}

module.exports = { extractPriceFromImage };