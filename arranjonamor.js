const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://arranjonamor.org';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache'
};

async function request(url) {
    const response = await axios.get(url, {
        headers: DEFAULT_HEADERS,
        timeout: 15000
    });
    return cheerio.load(response.data);
}

/**
 * Extract movie cards from listing page
 */
function parseMovieCards($) {
    const movies = [];
    
    // Multiple selector strategies for different layouts
    const selectors = [
        '.movies-list .movie-item',
        '.film-list .film-item', 
        '.movie-grid .movie-item',
        '.post-item',
        'article.post',
        '.ml-item',
        '.item',
        '.movie-box',
        '.film-box'
    ];

    for (const selector of selectors) {
        const items = $(selector);
        if (items.length > 0) {
            items.each((i, el) => {
                const $el = $(el);
                
                // Title and URL
                let title = '';
                let url = '';
                
                const linkEl = $el.find('a[href*="/"]').first();
                if (linkEl.length) {
                    url = linkEl.attr('href');
                    title = linkEl.find('img').attr('alt') || 
                            linkEl.attr('title') || 
                            linkEl.text().trim();
                }
                
                if (!title) {
                    title = $el.find('h2, h3, .title, .movie-title, .film-title, h4').first().text().trim();
                }
                
                if (!url) {
                    url = $el.find('a').first().attr('href');
                }
                
                // Thumbnail
                let thumbnail = '';
                const imgEl = $el.find('img').first();
                if (imgEl.length) {
                    thumbnail = imgEl.attr('src') || 
                               imgEl.attr('data-src') || 
                               imgEl.attr('data-lazy-src') ||
                               imgEl.attr('data-original');
                }
                
                // Rating/Score
                let rating = '';
                const ratingEl = $el.find('.rating, .score, .imdb, .rating-score, .ml-rating');
                if (ratingEl.length) {
                    rating = ratingEl.text().trim();
                }
                
                // Year
                let year = '';
                const yearEl = $el.find('.year, .date, .release-year, .ml-year');
                if (yearEl.length) {
                    year = yearEl.text().trim();
                }
                
                // Quality/Type
                let quality = '';
                const qualityEl = $el.find('.quality, .type, .hd, .ml-type');
                if (qualityEl.length) {
                    quality = qualityEl.text().trim();
                }

                // Clean up
                if (title && title.length > 2) {
                    title = title.replace(/\s+/g, ' ').trim();
                    // Remove "Permalink ke: " prefix
                    title = title.replace(/^Permalink ke:\s*/i, '');
                    
                    if (url && !url.startsWith('http')) {
                        url = BASE_URL + (url.startsWith('/') ? '' : '/') + url;
                    }
                    
                    if (thumbnail && thumbnail.startsWith('/')) {
                        thumbnail = BASE_URL + thumbnail;
                    }

                    movies.push({
                        title: title.substring(0, 150),
                        url: url || null,
                        thumbnail: thumbnail || null,
                        rating: rating || null,
                        year: year || null,
                        quality: quality || null
                    });
                }
            });
            
            if (movies.length > 0) break;
        }
    }
    
    return movies;
}

/**
 * Search movies
 */
async function searchMovies(query) {
    const searchUrl = `${BASE_URL}/search/${encodeURIComponent(query)}/`;
    const $ = await request(searchUrl);
    const movies = parseMovieCards($);
    return movies.slice(0, 20);
}

/**
 * Get movies by genre
 */
async function getMoviesByGenre(genreSlug) {
    const url = `${BASE_URL}/${genreSlug}/`;
    const $ = await request(url);
    const movies = parseMovieCards($);
    return movies.slice(0, 30);
}

/**
 * Get movies by year
 */
async function getMoviesByYear(year) {
    const url = `${BASE_URL}/year/${year}/`;
    const $ = await request(url);
    const movies = parseMovieCards($);
    return movies.slice(0, 30);
}

/**
 * Get movies by country
 */
async function getMoviesByCountry(countrySlug) {
    const url = `${BASE_URL}/country/${countrySlug}/`;
    const $ = await request(url);
    const movies = parseMovieCards($);
    return movies.slice(0, 30);
}

/**
 * Get latest movies from homepage
 */
async function getLatestMovies() {
    const $ = await request(BASE_URL);
    const movies = parseMovieCards($);
    return movies.slice(0, 30);
}

/**
 * Get movie details from single post page
 */
async function getMovieDetails(movieUrl) {
    const $ = await request(movieUrl);
    
    // Extract details from single movie page
    const details = {
        title: '',
        url: movieUrl,
        thumbnail: '',
        description: '',
        rating: '',
        year: '',
        genre: [],
        country: [],
        director: '',
        cast: [],
        duration: '',
        quality: '',
        downloadLinks: [],
        streamingLinks: [],
        trailerUrl: ''
    };
    
    // Title
    details.title = $('h1.post-title, h1.entry-title, h1.movie-title, .movie-title h1, .single-title').first().text().trim() ||
                    $('title').text().replace(/\s*\|.*$/, '').trim();
    // Remove "Permalink ke: " prefix
    details.title = details.title.replace(/^Permalink ke:\s*/i, '');
    
    // Thumbnail/Poster
    details.thumbnail = $('.poster img, .movie-poster img, .single-poster img, .movie-image img, .featured-image img').first().attr('src') ||
                        $('.poster img, .movie-poster img, .single-poster img, .movie-image img, .featured-image img').first().attr('data-src') ||
                        $('meta[property="og:image"]').attr('content');
    
    // Description/Sinopsis
    details.description = $('.sinopsis, .synopsis, .description, .movie-desc, .entry-content .sinopsis, .single-content .sinopsis, .post-content .sinopsis').first().text().trim() ||
                          $('.entry-content, .post-content, .single-content').first().find('p').first().text().trim();
    
    // Rating
    details.rating = $('.rating-score, .imdb-rating, .rating .score, .movie-rating, .imdb').first().text().trim();
    
    // Extract meta info from info boxes
    $('.movie-info, .film-info, .info-box, .meta-info, .single-info, .post-meta').each((i, el) => {
        const $el = $(el);
        const text = $el.text().toLowerCase();
        
        if (text.includes('tahun') || text.includes('year') || text.includes('release')) {
            details.year = $el.text().replace(/[^0-9]/g, '').trim();
        }
        if (text.includes('genre') || text.includes('kategori')) {
            const genres = $el.find('a').map((i, a) => $(a).text().trim()).get();
            if (genres.length) details.genre = genres;
        }
        if (text.includes('negara') || text.includes('country')) {
            const countries = $el.find('a').map((i, a) => $(a).text().trim()).get();
            if (countries.length) details.country = countries;
        }
        if (text.includes('sutradara') || text.includes('director')) {
            details.director = $el.text().replace(/sutradara|director/gi, '').trim();
        }
        if (text.includes('pemain') || text.includes('cast') || text.includes('aktor')) {
            const cast = $el.find('a').map((i, a) => $(a).text().trim()).get();
            if (cast.length) details.cast = cast;
        }
        if (text.includes('durasi') || text.includes('duration') || text.includes('runtime')) {
            details.duration = $el.text().replace(/durasi|duration|runtime/gi, '').trim();
        }
        if (text.includes('kualitas') || text.includes('quality') || text.includes('hd')) {
            details.quality = $el.text().replace(/kualitas|quality/gi, '').trim();
        }
    });
    
    // Download links
    $('a[href*="download"], a[href*="dl="], a[href*="dl."], .download-link, .btn-download').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const text = $el.text().trim();
        if (href && href.startsWith('http')) {
            details.downloadLinks.push({
                label: text || `Download ${i + 1}`,
                url: href
            });
        }
    });
    
    // Streaming/Watch links
    $('a[href*="watch"], a[href*="stream"], a[href*="nonton"], a[href*="player"], .watch-link, .btn-watch, .play-btn').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const text = $el.text().trim();
        if (href && href.startsWith('http')) {
            details.streamingLinks.push({
                label: text || `Watch ${i + 1}`,
                url: href
            });
        }
    });
    
    // Trailer
    details.trailerUrl = $('a[href*="youtube.com"], a[href*="youtu.be"], .trailer a, .trailer-link').first().attr('href') || '';
    
    // Clean up
    Object.keys(details).forEach(key => {
        if (typeof details[key] === 'string') {
            details[key] = details[key].replace(/\s+/g, ' ').trim();
        }
        if (Array.isArray(details[key])) {
            details[key] = details[key].filter((v, i, a) => a.indexOf(v) === i);
        }
    });
    
    return details;
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const param = args.slice(1).join(' ');

    if (!command) {
        console.log(JSON.stringify({
            creator: "Hady",
            usage: 'node arranjonamor.js <command> [params]',
            commands: {
                search: 'node arranjonamor.js search "query"',
                latest: 'node arranjonamor.js latest',
                genre: 'node arranjonamor.js genre action',
                year: 'node arranjonamor.js year 2025',
                country: 'node arranjonamor.js country korea',
                detail: 'node arranjonamor.js detail "https://arranjonamor.org/movie-slug/"'
            },
            examples: [
                'node arranjonamor.js search "ne zha 2"',
                'node arranjonamor.js latest',
                'node arranjonamor.js genre action',
                'node arranjonamor.js year 2025',
                'node arranjonamor.js country korea',
                'node arranjonamor.js detail "https://arranjonamor.org/ne-zha-2-2/"'
            ]
        }, null, 2));
        process.exit(1);
    }

    try {
        let result;
        switch (command) {
            case 'search':
                if (!param) throw new Error('Query required');
                result = await searchMovies(param);
                break;
            case 'latest':
                result = await getLatestMovies();
                break;
            case 'genre':
                if (!param) throw new Error('Genre required');
                result = await getMoviesByGenre(param);
                break;
            case 'year':
                if (!param) throw new Error('Year required');
                result = await getMoviesByYear(param);
                break;
            case 'country':
                if (!param) throw new Error('Country required');
                result = await getMoviesByCountry(param);
                break;
            case 'detail':
                if (!param) throw new Error('Movie URL required');
                result = await getMovieDetails(param);
                break;
            default:
                throw new Error(`Unknown command: ${command}`);
        }
        
        console.log(JSON.stringify({
            status: true,
            creator: "Hady",
            total: Array.isArray(result) ? result.length : 1,
            data: result
        }, null, 2));
        
    } catch (error) {
        console.log(JSON.stringify({
            status: false,
            creator: "Hady",
            error: error.message
        }, null, 2));
        process.exit(1);
    }
}

main();

module.exports = {
    searchMovies,
    getLatestMovies,
    getMoviesByGenre,
    getMoviesByYear,
    getMoviesByCountry,
    getMovieDetails
};