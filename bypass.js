const https = require('https');
const { URL } = require('url');
const { JSDOM } = require('jsdom');

const BASE_URL = 'https://tw8rev.vercel.app';
const API_URL = 'https://tw8rev.my.id/api/bypass';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_REDIRECTS = 10;

function fetchHtml(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > MAX_REDIRECTS) {
            reject(new Error('Too many redirects'));
            return;
        }

        const req = https.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
            timeout: 30000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).href;
                console.log(`[REDIRECT ${res.statusCode}] ${redirectUrl}`);
                fetchHtml(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

function fetchJson(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json', ...headers },
            timeout: 30000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${json.error || res.statusMessage}`));
                    }
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

function parseMetadata(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const metadata = {
        title: null,
        description: null,
        keywords: null,
        author: null,
        ogTitle: null,
        ogDescription: null,
        ogUrl: null,
        ogImage: null,
        twitterCard: null,
        twitterTitle: null,
        twitterDescription: null,
        twitterImage: null,
        canonicalUrl: null,
        favicon: null,
        schemaOrg: null,
        badges: [],
        supportedDomains: 240,
        features: [],
        apiEndpoint: null,
        socialLinks: {}
    };

    // Basic meta tags
    const titleEl = doc.querySelector('title');
    if (titleEl) metadata.title = titleEl.textContent.trim();

    const metaTags = doc.querySelectorAll('meta');
    metaTags.forEach(meta => {
        const name = meta.getAttribute('name');
        const property = meta.getAttribute('property');
        const content = meta.getAttribute('content');

        if (name === 'description') metadata.description = content;
        else if (name === 'keywords') metadata.keywords = content;
        else if (name === 'author') metadata.author = content;
        else if (name === 'twitter:card') metadata.twitterCard = content;
        else if (name === 'twitter:title') metadata.twitterTitle = content;
        else if (name === 'twitter:description') metadata.twitterDescription = content;
        else if (name === 'twitter:image') metadata.twitterImage = content;
        else if (property === 'og:title') metadata.ogTitle = content;
        else if (property === 'og:description') metadata.ogDescription = content;
        else if (property === 'og:url') metadata.ogUrl = content;
        else if (property === 'og:image') metadata.ogImage = content;
        else if (property === 'og:site_name') metadata.siteName = content;
    });

    // Canonical URL
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical) metadata.canonicalUrl = canonical.getAttribute('href');

    // Favicon
    const favicon = doc.querySelector('link[rel="icon"]');
    if (favicon) metadata.favicon = favicon.getAttribute('href');

    // Schema.org JSON-LD
    const schemaScript = doc.querySelector('script[type="application/ld+json"]');
    if (schemaScript) {
        try {
            metadata.schemaOrg = JSON.parse(schemaScript.textContent);
        } catch (e) {}
    }

    // Badges from hero section
    const badges = doc.querySelectorAll('.badge');
    badges.forEach(badge => {
        const text = badge.textContent.trim();
        if (text) metadata.badges.push(text);
    });

    // Features from badges or description
    if (metadata.keywords) {
        metadata.features = metadata.keywords.split(',').map(k => k.trim()).filter(Boolean);
    }

    // API endpoint from JS
    const scripts = doc.querySelectorAll('script:not([src])');
    scripts.forEach(script => {
        const content = script.textContent;
        if (content.includes('/api/bypass')) {
            const match = content.match(/\/api\/bypass/);
            if (match) metadata.apiEndpoint = BASE_URL + match[0];
        }
    });

    // Social links
    const footerLinks = doc.querySelectorAll('.fbox a');
    footerLinks.forEach(link => {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();
        if (href && text) metadata.socialLinks[text] = href;
    });

    return metadata;
}

async function scrapeMetadata() {
    console.log(`[INFO] Fetching ${BASE_URL}...`);
    const html = await fetchHtml(BASE_URL);
    console.log(`[INFO] Received ${html.length} bytes, parsing metadata...`);
    return parseMetadata(html);
}

async function bypassUrl(targetUrl, apiKey = null, captchaToken = null) {
    if (!targetUrl) throw new Error('Target URL is required');

    const params = new URLSearchParams({ url: targetUrl });
    if (apiKey) params.set('apikey', apiKey);

    const headers = {};
    if (!apiKey && captchaToken) headers.Authorization = `Bearer ${captchaToken}`;

    const apiUrl = `${API_URL}?${params.toString()}`;
    console.log(`[INFO] Calling bypass API: ${apiUrl}`);
    return await fetchJson(apiUrl, headers);
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log('Usage:');
        console.log('  node bypass.js metadata          - Scrape metadata from tw8rev.vercel.app');
        console.log('  node bypass.js bypass <url>      - Attempt to bypass a URL (requires API key or captcha)');
        console.log('  node bypass.js bypass <url> --apikey <key>  - Bypass with API key');
        console.log('');
        console.log('Example:');
        console.log('  node bypass.js metadata');
        console.log('  node bypass.js bypass https://sfl.gl/qocHPaZ');
        console.log('  node bypass.js bypass https://sfl.gl/qocHPaZ --apikey YOUR_KEY');
        process.exit(1);
    }

    try {
        if (command === 'metadata') {
            const metadata = await scrapeMetadata();
            console.log(JSON.stringify(metadata, null, 2));
        } else if (command === 'bypass') {
            const url = args[1];
            const apiKeyIndex = args.indexOf('--apikey');
            const apiKey = apiKeyIndex !== -1 ? args[apiKeyIndex + 1] : null;

            if (!url) {
                console.error('Error: URL is required for bypass command');
                process.exit(1);
            }

            const result = await bypassUrl(url, apiKey);
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.error(`Unknown command: ${command}`);
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { scrapeMetadata, bypassUrl, parseMetadata, fetchHtml, fetchJson };