const puppeteer = require('puppeteer');

const BASE_URL = 'https://tw8rev.vercel.app';
const TEST_URL = 'https://sfl.gl/qocHPaZ';

async function bypassWithBrowser(targetUrl) {
    console.log('[INFO] Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--single-process',
            '--no-zygote'
        ]
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    
    try {
        console.log('[INFO] Navigating to tw8rev...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        
        console.log('[INFO] Waiting for page to load...');
        await page.waitForSelector('#u', { timeout: 10000 });
        
        console.log('[INFO] Entering URL...');
        await page.type('#u', targetUrl);
        
        console.log('[INFO] Clicking Bypass button...');
        await page.click('#bt');
        
        console.log('[INFO] Waiting for result (may need to solve hCaptcha)...');
        
        // Wait for either success or error
        await page.waitForFunction(() => {
            const resultBox = document.querySelector('#r');
            return resultBox && resultBox.classList.contains('show');
        }, { timeout: 120000 });
        
        // Check if hCaptcha appeared
        const hcaptchaVisible = await page.$eval('#hcr', el => 
            window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).opacity !== '0'
        ).catch(() => false);
        
        if (hcaptchaVisible) {
            console.log('[WARN] hCaptcha detected - waiting for manual solve or auto-solve...');
            // Wait longer for captcha to be solved
            await page.waitForFunction(() => {
                const resultBox = document.querySelector('#r');
                return resultBox && resultBox.classList.contains('show');
            }, { timeout: 180000 });
        }
        
        // Extract result
        const result = await page.evaluate(() => {
            const resultBox = document.querySelector('#r');
            if (!resultBox) return { error: 'No result box found' };
            
            const header = resultBox.querySelector('.rh');
            const isError = header && header.classList.contains('er');
            
            const originalUrlEl = resultBox.querySelector('.rvl');
            const resultUrlEl = resultBox.querySelector('.rvl.dst');
            
            return {
                success: !isError,
                error: isError ? resultBox.querySelector('.rvl')?.textContent?.trim() : null,
                originalUrl: originalUrlEl?.textContent?.trim(),
                directUrl: resultUrlEl?.textContent?.trim(),
                html: resultBox.innerHTML
            };
        });
        
        return result;
        
    } catch (error) {
        return { error: error.message };
    } finally {
        await browser.close();
    }
}

// Run
const targetUrl = process.argv[2] || TEST_URL;
console.log(`[INFO] Testing bypass for: ${targetUrl}`);

bypassWithBrowser(targetUrl)
    .then(result => {
        console.log('\n=== RESULT ===');
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });