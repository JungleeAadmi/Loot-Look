const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

/**
 * Robust OCR Engine for LootLook
 */

async function extractPriceFromImage(imagePath) {
    console.log(`👁️ [OCR] Scanning image: ${imagePath}`);
    
    if (!fs.existsSync(imagePath)) {
        console.error(`❌ [OCR Error] File not found: ${imagePath}`);
        return null;
    }

    try {
        const strategies = [
            { psm: 11, desc: 'Sparse Text' }, // Best for prices
            { psm: 6,  desc: 'Uniform Block' }, // Good for product cards
            { psm: 3,  desc: 'Auto Layout' }   // Fallback
        ];
        
        for (const strat of strategies) {
            const { stdout } = await execPromise(`tesseract "${imagePath}" stdout -l eng --psm ${strat.psm} -c preserve_interword_spaces=1`);
            
            const price = parseOCRText(stdout);
            if (price) {
                console.log(`   ✅ OCR Success (${strat.desc}): Found ${price}`);
                return price;
            }
        }

        console.log(`   ⚠️ OCR failed to find a valid price.`);
        return null;

    } catch (error) {
        console.error(`❌ [OCR Error] Execution failed: ${error.message}`);
        return null;
    }
}

/**
 * The Brain: Clean and Parse messy OCR text
 */
function parseOCRText(text) {
    if (!text) return null;

    // 1. PRE-CLEANING
    let cleanText = text
        .replace(/l/g, '1')    
        .replace(/I/g, '1')    
        .replace(/O/g, '0')    
        .replace(/S/g, '5')    
        .replace(/\r\n/g, '\n');

    // 2. REGEX PATTERNS
    
    // Pattern A: Currency Symbol + Number (Most Reliable)
    // Supports: "Rs. 1,240.00", "₹ 1 240", "1240"
    // [\d\s,.]* captures numbers, spaces, commas, dots
    const currencyRegex = /(?:₹|Rs\.?|INR|\$|€|£|¥|RP|RM|AED)\s*([\d\s,.]*)/gi;
    
    // Pattern B: Strict Money Format (Fallback)
    // Looks for 1,200 or 1.200 or 1200.00
    const numberRegex = /([\d]{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?)/g;

    let candidates = [];

    // --- Pass 1: Look for Currency Symbols ---
    const symbolMatches = [...cleanText.matchAll(currencyRegex)];
    for (const match of symbolMatches) {
        const rawNum = match[1];
        const val = cleanAndParseFloat(rawNum);
        if (isValidPrice(val)) candidates.push(val);
    }

    // --- Pass 2: Look for Money Formats (if Pass 1 failed) ---
    if (candidates.length === 0) {
        const numberMatches = [...cleanText.matchAll(numberRegex)];
        for (const match of numberMatches) {
            const val = cleanAndParseFloat(match[0]);
            if (isValidPrice(val)) candidates.push(val);
        }
    }

    // 3. SELECTION LOGIC
    if (candidates.length > 0) {
        return candidates[0];
    }

    return null;
}

/**
 * Converts "1,240.00" or "1 240" to 1240.00
 */
function cleanAndParseFloat(str) {
    if (!str) return NaN;
    // Remove spaces, commas, and other noise, keep digits and dot
    // If multiple dots exist (1.200.00), we assume the last one is the decimal
    let clean = str.replace(/[^\d.]/g, ''); 
    
    // Check for multiple dots
    const dots = clean.split('.').length - 1;
    if (dots > 1) {
         // Remove all dots except last one
         const parts = clean.split('.');
         const decimal = parts.pop();
         const integer = parts.join('');
         clean = `${integer}.${decimal}`;
    }

    return parseFloat(clean);
}

/**
 * Filters out noise (Years, Page Numbers, Phone Numbers)
 */
function isValidPrice(num) {
    if (isNaN(num)) return false;
    if (num < 10) return false;           // Ignore "1", "5", "4.5" (ratings/qty)
    if (num > 1000000) return false;      // Ignore phone numbers
    // Note: Removed Year check because 2025 IS a valid price for some items
    // Better to risk a year being a price than miss a 2025 rupee item
    return true;
}

module.exports = { extractPriceFromImage };