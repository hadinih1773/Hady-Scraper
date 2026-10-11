const axios = require('axios');
const cheerio = require('cheerio');

const args = process.argv.slice(2);
const query = args.join(' ');

if (!query) {
    console.log(JSON.stringify({
        status: false,
        creator: "Hady",
        message: "Silakan masukkan nama film yang ingin dicari. Contoh: node lk21.js iron man"
    }, null, 2));
    process.exit(1);
}

async function searchMovie() {
    try {
        // Use DuckDuckGo HTML scrape for movie search (no API key needed, no Cloudflare)
        const searchQuery = encodeURIComponent(query + ' film movie imdb');
        const searchUrl = `https://html.duckduckgo.com/html/?q=${searchQuery}`;
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const results = [];

        // Parse DuckDuckGo results
        $('.result').each((i, el) => {
            const $el = $(el);
            
            // Get title and URL
            const titleEl = $el.find('.result__title, .result__snippet a, h2 a, .result__snippet').first();
            const urlEl = $el.find('a.result__url, a.result__snippet, .result__title a').first();
            
            let title = titleEl.text().trim();
            let url = urlEl.attr('href');
            
            if (!title) {
                title = $el.find('.result__snippet').text().trim();
            }
            if (!url) {
                url = $el.find('a').first().attr('href');
            }
            
            // Clean up
            if (title && title.length > 3 && url) {
                // Clean title
                title = title.replace(/\s+/g, ' ').trim();
                
                // Fix DuckDuckGo redirect URLs - extract actual URL from uddg parameter
                if (url.includes('duckduckgo.com/l/?uddg=')) {
                    const match = url.match(/uddg=([^&]+)/);
                    if (match) {
                        url = decodeURIComponent(match[1]);
                    }
                }
                
                // Fix relative URLs
                if (url.startsWith('/')) {
                    url = 'https://duckduckgo.com' + url;
                }
                
                // Filter out non-movie results
                const lowerTitle = title.toLowerCase();
                if (!lowerTitle.includes('duckduckgo') && 
                    !lowerTitle.includes('privacy') &&
                    !lowerTitle.includes('settings') &&
                    title.length > 5) {
                    
                    results.push({
                        title: title.substring(0, 100),
                        url: url,
                        thumbnail: null
                    });
                }
            }
        });

        // Remove duplicates
        const uniqueResults = results.filter((item, index, self) => 
            index === self.findIndex(t => t.url === item.url)
        ).slice(0, 10);

        if (uniqueResults.length > 0) {
            console.log(JSON.stringify({
                status: true,
                creator: "Hady",
                source: "DuckDuckGo",
                query: query,
                total: uniqueResults.length,
                data: uniqueResults
            }, null, 2));
        } else {
            console.log(JSON.stringify({
                status: false,
                creator: "Hady",
                message: "Tidak ada hasil ditemukan. Coba kata kunci lain."
            }, null, 2));
        }

    } catch (error) {
        console.log(JSON.stringify({
            status: false,
            creator: "Hady",
            error: error.message,
            code: error.code
        }, null, 2));
    }
}

searchMovie();