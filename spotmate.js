#!/usr/bin/env node

/**
 * SpotMate Scraper - Extracts metadata from Spotify URLs via spotmate.online
 * Usage: node spotmate.js <spotify_url>
 */

const { chromium } = require('playwright');

async function scrapeSpotmate(spotifyUrl) {
    let browser;
    let context;
    try {
        console.error('[INFO] Launching browser...');
        browser = await chromium.launch({
            headless: true,
            executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell',
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        console.error('[DEBUG] Browser launched successfully');

        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });

        const page = await context.newPage();
        console.error('[DEBUG] New page created');

        // Enable request/response logging for debugging
        page.on('request', request => {
            if (request.url().includes('getTrackData') || request.url().includes('convert') || request.url().includes('archive') || request.url().includes('tasks')) {
                console.error(`[DEBUG] Request: ${request.method()} ${request.url()}`);
                if (request.postData()) {
                    console.error(`[DEBUG] Post Data: ${request.postData()}`);
                }
            }
        });

        page.on('response', async response => {
            if (response.url().includes('getTrackData') || response.url().includes('convert') || response.url().includes('archive') || response.url().includes('tasks')) {
                console.error(`[DEBUG] Response: ${response.status()} ${response.url()}`);
                try {
                    const body = await response.json();
                    console.error(`[DEBUG] Response Body:`, JSON.stringify(body).substring(0, 500));
                } catch (e) {
                    const text = await response.text();
                    console.error(`[DEBUG] Response Text:`, text.substring(0, 500));
                }
            }
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('[CONSOLE ERROR]', msg.text());
            }
        });

        page.on('pageerror', err => {
            console.error('[PAGE ERROR]', err.message);
        });

        console.error('[INFO] Navigating to spotmate.online...');
        await page.goto('https://spotmate.online/en1', { 
            waitUntil: 'domcontentloaded',
            timeout: 90000 
        });
        console.error('[DEBUG] Navigation completed');

        // Wait for form to be ready
        console.error('[INFO] Waiting for form...');
        await page.waitForSelector('#trackUrl', { timeout: 30000 });
        await page.waitForSelector('#spotifyForm', { timeout: 30000 });

        // Wait for Turnstile to be ready
        console.error('[INFO] Waiting for Turnstile...');
        await page.waitForFunction(() => window.SpotmateTurnstile?.isEnabled?.() === true || window.SpotmateTurnstile?.isEnabled?.() === false, { timeout: 30000 });

        console.error('[INFO] Filling Spotify URL...');
        await page.fill('#trackUrl', spotifyUrl);

        console.error('[INFO] Submitting form...');
        await page.click('#btnSubmit');

        // Wait for either result or error
        console.error('[INFO] Waiting for result...');
        await page.waitForFunction(() => {
            const trackData = document.getElementById('trackData');
            const error = document.getElementById('error');
            return (trackData && trackData.style.display !== 'none') || 
                   (error && error.style.display !== 'none');
        }, { timeout: 180000 });

        // Check for error
        const errorVisible = await page.$eval('#error', el => el.style.display !== 'none').catch(() => false);
        if (errorVisible) {
            const errorText = await page.$eval('#error-text', el => el.innerText).catch(() => 'Unknown error');
            throw new Error(`SpotMate Error: ${errorText}`);
        }

        // Wait a bit more for data to fully load
        await page.waitForTimeout(2000);

        // Extract metadata from the page
        const metadata = await page.evaluate(() => {
            const trackDataEl = document.getElementById('trackData');
            if (!trackDataEl) return null;

            // Try to find track/album/playlist info
            const result = { type: 'unknown', data: {} };

            // Check for track info
            const trackNameEl = trackDataEl.querySelector('.text-new.mb-1.text-start');
            const artistEl = trackDataEl.querySelector('.p-0.ms-2.text-start');
            const coverImg = trackDataEl.querySelector('img.img-thumbnail');

            if (trackNameEl && artistEl) {
                result.type = 'track';
                result.data = {
                    name: trackNameEl.innerText.trim(),
                    artists: artistEl.innerText.trim(),
                    cover_url: coverImg ? coverImg.src : null,
                    spotify_url: trackDataEl.querySelector('input[type="hidden"]')?.value || null
                };
                return result;
            }

            // Check for playlist/album info
            const playlistNameEl = trackDataEl.querySelector('.text-center p.fs-6.fw-bold');
            const playlistOwnerEl = trackDataEl.querySelector('.text-center p.text-new.fs-6.fw-bold');
            const playlistCover = trackDataEl.querySelector('.text-center img.img-thumbnail');

            if (playlistNameEl && playlistOwnerEl) {
                // Determine if playlist or album by checking tracks
                const trackRows = trackDataEl.querySelectorAll('.track-row');
                if (trackRows.length > 0) {
                    const tracks = Array.from(trackRows).map(row => ({
                        position: row.querySelector('.col-1')?.innerText.trim(),
                        name: row.querySelector('.text-new.mb-1.text-start')?.innerText.trim(),
                        artists: row.querySelector('.p-0.ms-2.text-start')?.innerText.trim(),
                        spotify_url: row.querySelector('input[type="hidden"]')?.value
                    })).filter(t => t.name);

                    if (playlistNameEl.innerText.includes('by') || playlistOwnerEl.innerText.length > 0) {
                        result.type = 'playlist';
                    } else {
                        result.type = 'album';
                    }
                    
                    result.data = {
                        name: playlistNameEl.innerText.replace('by', '').trim(),
                        owner: playlistOwnerEl.innerText.trim(),
                        cover_url: playlistCover ? playlistCover.src : null,
                        tracks: tracks,
                        total_tracks: tracks.length
                    };
                    return result;
                }
            }

            // Check for artist page
            const artistTitleEl = trackDataEl.querySelector('.text-center p.fs-6.fw-bold.mt-1.mb-2');
            if (artistTitleEl && artistTitleEl.innerText.includes('Popular Tracks')) {
                const trackRows = trackDataEl.querySelectorAll('.track-row');
                const tracks = Array.from(trackRows).map(row => ({
                    position: row.querySelector('.col-1')?.innerText.trim(),
                    name: row.querySelector('.text-new.mb-1.text-start')?.innerText.trim(),
                    artists: row.querySelector('.text-muted.small.mb-0.text-start')?.innerText.trim(),
                    artwork: row.querySelector('img')?.src,
                    spotify_url: row.querySelector('input[type="hidden"]')?.value
                })).filter(t => t.name);

                result.type = 'artist';
                result.data = {
                    name: 'Unknown Artist',
                    tracks: tracks,
                    total_tracks: tracks.length
                };
                return result;
            }

            return result;
        });

        return metadata;

    } catch (error) {
        throw error;
    } finally {
        if (context) {
            try {
                await context.close();
            } catch (e) {
                console.error('[ERROR] Failed to close context:', e.message);
            }
        }
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('[ERROR] Failed to close browser:', e.message);
            }
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: node spotmate.js <spotify_url>');
        console.error('Example: node spotmate.js "https://open.spotify.com/track/..."');
        process.exit(1);
    }

    const spotifyUrl = args[0];

    // Validate Spotify URL
    if (!spotifyUrl.includes('spotify.com') && !spotifyUrl.includes('spotify:') && !spotifyUrl.match(/^[a-zA-Z0-9]+$/)) {
        console.error('Error: Invalid Spotify URL or ID');
        process.exit(1);
    }

    try {
        console.error(`[INFO] Scraping metadata for: ${spotifyUrl}`);
        const metadata = await scrapeSpotmate(spotifyUrl);
        
        // Output as JSON
        console.log(JSON.stringify(metadata, null, 2));
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        process.exit(1);
    }
}

main();