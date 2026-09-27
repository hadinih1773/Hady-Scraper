const https = require('https');
const { URL: URLParser } = require('url');
const { JSDOM } = require('jsdom');

const BASE_URL = 'https://www-y2mate.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_REDIRECTS = 10;

function fetchHtml(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > MAX_REDIRECTS) {
            reject(new Error('Too many redirects'));
            return;
        }

        const req = https.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 30000
        }, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URLParser(res.headers.location, url).href;
                console.log(`Redirect (${res.statusCode}) to: ${redirectUrl}`);
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
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

function parseHtml(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const data = {
        title: null,
        metaDescription: null,
        features: [],
        faqs: [],
        languages: [],
        downloadForm: {}
    };

    // Title
    const titleEl = document.querySelector('title');
    if (titleEl) data.title = titleEl.textContent.trim();

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) data.metaDescription = metaDesc.getAttribute('content');

    // Features - look for common feature card patterns
    const featureSelectors = [
        '[class*="feature"]',
        '[class*="advantage"]',
        '[class*="benefit"]',
        '.card',
        '[class*="service"]'
    ];

    const seenTitles = new Set();
    for (const selector of featureSelectors) {
        const cards = document.querySelectorAll(selector);
        cards.forEach(card => {
            const titleEl = card.querySelector('h3, h4, h5, [class*="title"], strong');
            const descEl = card.querySelector('p, [class*="desc"], [class*="text"]');
            const title = titleEl?.textContent?.trim();
            const desc = descEl?.textContent?.trim();
            if (title && title.length > 3 && !seenTitles.has(title)) {
                seenTitles.add(title);
                data.features.push({ title, description: desc || '' });
            }
        });
        if (data.features.length > 0) break;
    }

    // FAQs
    const faqSelectors = [
        'details',
        '[class*="faq"] > *',
        '[class*="accordion"] > *',
        '.faq-item',
        '[itemprop="mainEntity"]'
    ];

    for (const selector of faqSelectors) {
        const items = document.querySelectorAll(selector);
        items.forEach(item => {
            const questionEl = item.querySelector('summary, h3, h4, h5, strong, [class*="question"], [itemprop="name"]');
            const answerEl = item.querySelector('p, [class*="answer"], [class*="content"], [itemprop="text"]');
            const question = questionEl?.textContent?.trim();
            const answer = answerEl?.textContent?.trim();
            if (question && question.length > 5 && !data.faqs.some(f => f.question === question)) {
                data.faqs.push({ question, answer: answer || '' });
            }
        });
        if (data.faqs.length > 0) break;
    }

    // Languages - look for select dropdown or language links
    const langElements = document.querySelectorAll('select[name*="lang"], select[id*="lang"], [class*="language"] select, [class*="lang"] a, [class*="lang"] button');
    langElements.forEach(el => {
        if (el.tagName === 'SELECT') {
            Array.from(el.options).forEach(opt => {
                const text = opt.textContent.trim();
                if (text && !data.languages.includes(text)) data.languages.push(text);
            });
        } else {
            const text = el.textContent.trim();
            if (text && !data.languages.includes(text)) data.languages.push(text);
        }
    });

    // Download form
    const form = document.querySelector('form');
    if (form) {
        const inputs = form.querySelectorAll('input[name], select[name], textarea[name], button[name]');
        data.downloadForm = {
            action: form.getAttribute('action') || '',
            method: (form.getAttribute('method') || 'GET').toUpperCase(),
            fields: Array.from(inputs).map(inp => ({
                name: inp.getAttribute('name'),
                type: inp.tagName.toLowerCase() === 'select' ? 'select' : inp.getAttribute('type') || 'text',
                placeholder: inp.getAttribute('placeholder') || ''
            }))
        };
    }

    return data;
}

async function scrapeY2mate() {
    try {
        console.log(`Fetching ${BASE_URL}...`);
        const html = await fetchHtml(BASE_URL);
        console.log(`Received ${html.length} bytes, parsing...`);
        const data = parseHtml(html);
        return data;
    } catch (error) {
        console.error('Scrape failed:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    const customUrl = process.argv[2];
    const targetUrl = customUrl || BASE_URL;
    
    if (customUrl) {
        console.log(`Using custom URL: ${customUrl}`);
    }
    
    (async () => {
        try {
            console.log(`Fetching ${targetUrl}...`);
            const html = await fetchHtml(targetUrl);
            console.log(`Received ${html.length} bytes, parsing...`);
            const data = parseHtml(html);
            console.log(JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Scrape failed:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = { scrapeY2mate, parseHtml, fetchHtml };