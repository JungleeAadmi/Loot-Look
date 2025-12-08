const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// OCR Price Extractor
async function extractPriceFromImage(imagePath) {
    console.log(`👁️ [OCR] Scanning image: ${imagePath}`);
    
    try {
        // Pass 1: Standard Auto Segmentation (--psm 3 is default)
        // Best for reading blocks of text
        let { stdout } = await execPromise(`tesseract "${imagePath}" stdout -l eng --psm 3`);
        let price = parseOCRText(stdout);
        
        if (price) return price;

        // Pass 2: Sparse Text (--psm 11)
        // Best for finding isolated numbers/prices floating in white space
        console.log(`   -> Pass 1 failed. Trying Sparse Mode...`);
        ({ stdout } = await execPromise(`tesseract "${imagePath}" stdout -l eng --psm 11`));
        price = parseOCRText(stdout);

        if (price) return price;

        console.log(`   -> OCR found no prices.`);
        return null;

    } catch (error) {
        console.error(`❌ [OCR Error] ${error.message}`);
        return null;
    }
}

function parseOCRText(text) {
    // 1. Look for currency symbols (including common OCR errors)
    // ₹ is often read as '?', 'z', 'f', 'E', or '7' depending on font
    const currencyRegex = /(?:₹|Rs\.?|INR|\$|€|£|¥|RP|RM|AED|\?|7|f)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi;
    let matches = [...text.matchAll(currencyRegex)];

    // 2. If no symbol-matches, look for "Money Formatted" numbers (e.g. 1,499)
    if (matches.length === 0) {
        // Must have at least one comma to be considered a price in this fallback mode
        // e.g. "1499" is skipped (could be a year), but "1,499" is kept
        const numberRegex = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/g;
        matches = [...text.matchAll(numberRegex)];
    }

    if (matches.length > 0) {
        // Extract numeric values
        const prices = matches.map(m => parseFloat(m[1].replace(/,/g, '')));
        
        // Smart Filtering
        const validPrices = prices.filter(p => {
            if (p < 10) return false;          // Ignore single digits (page numbers, qty)
            if (p > 5000000) return false;     // Ignore impossibly high numbers (phone numbers)
            if (p >= 2020 && p <= 2030) return false; // Ignore current years
            return true;
        });
        
        if (validPrices.length > 0) {
            // Heuristic: The *first* valid price found is usually the main product price
            // (Title -> Price -> Description)
            const detected = validPrices[0];
            console.log(`   -> OCR Detected Price: ${detected}`);
            return detected;
        }
    }
    return null;
}

module.exports = { extractPriceFromImage };