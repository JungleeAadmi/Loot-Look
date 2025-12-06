const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// OCR Price Extractor
// Uses Tesseract to read text from the screenshot and regex to find prices.
async function extractPriceFromImage(imagePath) {
    console.log(`👁️ [OCR] Scanning image: ${imagePath}`);
    
    try {
        // Run Tesseract CLI
        // -l eng: English language
        // --psm 6: Assume a single uniform block of text (good for structured pages)
        const { stdout } = await execPromise(`tesseract "${imagePath}" stdout -l eng --psm 6`);
        
        // Find price patterns
        // Matches: ₹ 1,200 | Rs. 500 | INR 1200 | 1,200.00
        const priceRegex = /(?:₹|Rs\.?|INR)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi;
        const matches = [...stdout.matchAll(priceRegex)];

        if (matches.length > 0) {
            // Found potential prices
            const prices = matches.map(m => parseFloat(m[1].replace(/,/g, '')));
            
            // Logic: Usually the "Main" price is prominent or listed first.
            // We filter out very small numbers (likely discounts or page numbers)
            const validPrices = prices.filter(p => p > 10);
            
            if (validPrices.length > 0) {
                // Return the first valid price found
                const detected = validPrices[0];
                console.log(`   -> OCR Detected Price: ${detected}`);
                return detected;
            }
        }
        
        console.log(`   -> OCR found no prices.`);
        return null;

    } catch (error) {
        console.error(`❌ [OCR Error] ${error.message}`);
        return null; // Fail safe
    }
}

module.exports = { extractPriceFromImage };