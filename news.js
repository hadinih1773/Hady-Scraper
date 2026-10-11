const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Indonesian News Aggregator
 * Scrapes multiple news sources simultaneously
 */

const SOURCES = {
    detik: {
        name: 'Detik.com',
        baseUrl: 'https://www.detik.com',
        searchUrl: 'https://www.detik.com/search/searchall?query=',
        selector: 'article, .list-content__item, .media__text',
        titleSel: 'h2, h3, .media__title, .title',
        linkSel: 'a',
        imgSel: 'img'
    },
    kompas: {
        name: 'Kompas.com',
        baseUrl: 'https://www.kompas.com',
        searchUrl: 'https://search.kompas.com/search/?q=',
        selector: '.article__list, .articleItem, article',
        titleSel: 'h3, .article__title, .title',
        linkSel: 'a',
        imgSel: 'img'
    },
    cnn: {
        name: 'CNN Indonesia',
        baseUrl: 'https://www.cnnindonesia.com',
        searchUrl: 'https://www.cnnindonesia.com/search/?query=',
        selector: 'article, .article-item, .content_list',
        titleSel: 'h2, h3, .title',
        linkSel: 'a',
        imgSel: 'img'
    },
    tempo: {
        name: 'Tempo.co',
        baseUrl: 'https://www.tempo.co',
        searchUrl: 'https://www.tempo.co/search?q=',
        selector: '.card-box, article, .list-item, .list__item',
        titleSel: 'h2, h3, .title, .card-box__title, a',
        linkSel: 'a',
        imgSel: 'img'
    }
};

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache'
};

async function fetchSource(sourceKey, query, maxResults = 10) {
    const source = SOURCES[sourceKey];
    if (!source) return { source: sourceKey, error: 'Unknown source', articles: [] };

    try {
        const searchUrl = source.searchUrl + encodeURIComponent(query);
        const response = await axios.get(searchUrl, {
            headers: DEFAULT_HEADERS,
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const articles = [];

        $(source.selector).each((i, el) => {
            if (articles.length >= maxResults) return false;

            const $el = $(el);
            let title = $el.find(source.titleSel).first().text().trim();
            let url = $el.find(source.linkSel).first().attr('href');
            let thumbnail = $el.find(source.imgSel).first().attr('src') || 
                           $el.find(source.imgSel).first().attr('data-src');

            if (!title || !url) return;

            // Clean up
            title = title.replace(/\s+/g, ' ').trim();
            if (title.length < 5) return;

            // Fix relative URLs
            if (url.startsWith('/')) {
                url = source.baseUrl + url;
            } else if (!url.startsWith('http')) {
                url = source.baseUrl + '/' + url;
            }

            // Filter out non-article links
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.includes('/tag/') || lowerUrl.includes('/author/') || 
                lowerUrl.includes('/category/') || lowerUrl.includes('javascript:')) {
                return;
            }

            if (thumbnail && thumbnail.startsWith('/')) {
                thumbnail = source.baseUrl + thumbnail;
            }

            articles.push({
                title: title.substring(0, 200),
                url,
                thumbnail: thumbnail || null,
                source: source.name
            });
        });

        // Remove duplicates
        const unique = articles.filter((item, index, self) => 
            index === self.findIndex(t => t.url === item.url)
        );

        return { source: sourceKey, sourceName: source.name, articles: unique };

    } catch (error) {
        return { source: sourceKey, error: error.message, articles: [] };
    }
}

async function searchNews(query, options = {}) {
    const { sources = Object.keys(SOURCES), maxPerSource = 5, maxTotal = 20 } = options;
    
    console.log(`[News] Searching "${query}" across ${sources.length} sources...`);
    
    const results = await Promise.all(
        sources.map(s => fetchSource(s, query, maxPerSource))
    );

    // Combine and sort by source priority
    const allArticles = results.flatMap(r => r.articles || []);
    
    // Remove duplicates across sources
    const unique = allArticles.filter((item, index, self) => 
        index === self.findIndex(t => t.url === item.url)
    ).slice(0, maxTotal);

    const summary = results.map(r => ({
        source: r.sourceName || r.source,
        count: r.articles?.length || 0,
        error: r.error || null
    }));

    return {
        status: true,
        query,
        total: unique.length,
        summary,
        articles: unique
    };
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const query = args.join(' ');
    
    if (!query) {
        console.log(JSON.stringify({
            status: false,
            message: 'Usage: node news.js <query> [--sources=detik,kompas,cnn,tempo] [--max=10]',
            example: 'node news.js "pemilu 2024" --sources=detik,kompas --max=5'
        }, null, 2));
        process.exit(1);
    }

    const sourceArg = args.find(a => a.startsWith('--sources='));
    const maxArg = args.find(a => a.startsWith('--max='));
    
    const sources = sourceArg ? sourceArg.split('=')[1].split(',') : Object.keys(SOURCES);
    const maxPerSource = maxArg ? parseInt(maxArg.split('=')[1]) : 5;

    searchNews(query, { sources, maxPerSource })
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error('Error:', err.message));
}

module.exports = { searchNews, SOURCES };