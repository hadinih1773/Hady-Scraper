const { generateIQC } = require('iqc-canvas');

/**
 * Generate Quote Image
 * @param {String} text
 * @param {String|null} time
 * @param {Object} options
 */
async function iqc(text, time = null, options = {}) {
    const {
        baterai = [true, '100'],
        operator = true,
        timebar = true,
        wifi = true
    } = options;

    const defaultTime = new Date()
        .toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
        .replace(':', '.');

    const result = await generateIQC(text, time || defaultTime, {
        baterai,
        operator,
        timebar,
        wifi
    });

    if (!result.success) {
        throw new Error(result.message || 'Failed generate IQC');
    }

    return {
        status: true,
        creator: 'Vinss',
        result: {
            image: result.image, // Buffer PNG
            mimeType: result.mimeType,
            timestamp: result.timestamp
        }
    };
}

module.exports = { iqc };

// Test
if (require.main === module) {
    (async () => {
        try {
            const res = await iqc("Test quote untuk IQC", null, {
                baterai: [true, '85'],
                operator: true,
                timebar: true,
                wifi: true
            });
            console.log("Success:", JSON.stringify({
                status: res.status,
                creator: res.creator,
                mimeType: res.result.mimeType,
                imageSize: res.result.image.length,
                timestamp: res.result.timestamp
            }, null, 2));
            
            // Save image to file for verification
            const fs = require('fs');
            fs.writeFileSync('test-iqc.png', res.result.image);
            console.log("\nImage saved to test-iqc.png");
        } catch (e) {
            console.error("Error:", e.message);
        }
    })();
}