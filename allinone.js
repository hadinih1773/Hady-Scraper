const https = require('https');
const http = require('http');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch HTML from URL with redirects
 */
function fetchHtml(url, options = {}) {
    const { maxRedirects = 10, timeout = 30000 } = options;
    
    return new Promise((resolve, reject) => {
        const doRequest = (currentUrl, redirectCount) => {
            if (redirectCount > maxRedirects) {
                reject(new Error('Too many redirects'));
                return;
            }
            
            const parsed = new URL(currentUrl);
            const client = parsed.protocol === 'https:' ? https : http;
            
            const req = client.get(currentUrl, {
                headers: { 
                    'User-Agent': USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout
            }, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location, currentUrl).href;
                    console.log(`[REDIRECT ${res.statusCode}] ${redirectUrl}`);
                    doRequest(redirectUrl, redirectCount + 1);
                    return;
                }
                
                // Handle gzip/deflate
                let stream = res;
                if (res.headers['content-encoding'] === 'gzip') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createGunzip());
                } else if (res.headers['content-encoding'] === 'deflate') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createInflate());
                } else if (res.headers['content-encoding'] === 'br') {
                    const zlib = require('zlib');
                    stream = res.pipe(zlib.createBrotliDecompress());
                }
                
                let data = '';
                stream.on('data', chunk => data += chunk);
                stream.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ url: currentUrl, html: data, statusCode: res.statusCode });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        };
        
        doRequest(url, 0);
    });
}

/**
 * Parse metadata from HTML
 */
function parseMetadata(html, sourceUrl) {
    const metadata = {
        title: '',
        description: '',
        thumbnail: '',
        duration: '',
        source: '',
        videoLinks: [],
        audioLinks: [],
        imageLinks: [],
        canonicalUrl: sourceUrl,
        siteName: '',
        author: '',
        publishedTime: '',
        tags: [],
        raw: {}
    };
    
    // Helper to extract meta content
    const getMeta = (html, name, property) => {
        // Try property first (og:), then name (twitter:, etc.)
        let regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
        let match = html.match(regex);
        if (match) return match[1];
        
        regex = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
        match = html.match(regex);
        if (match) return match[1];
        
        // Also try reversed order
        regex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
        match = html.match(regex);
        if (match) return match[1];
        
        regex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i');
        match = html.match(regex);
        if (match) return match[1];
        
        return null;
    };
    
    // Open Graph
    metadata.title = getMeta(html, '', 'og:title') || '';
    metadata.description = getMeta(html, '', 'og:description') || '';
    metadata.thumbnail = getMeta(html, '', 'og:image') || '';
    metadata.siteName = getMeta(html, '', 'og:site_name') || '';
    metadata.raw.ogType = getMeta(html, '', 'og:type') || '';
    metadata.raw.ogUrl = getMeta(html, '', 'og:url') || '';
    metadata.raw.ogVideo = getMeta(html, '', 'og:video') || '';
    metadata.raw.ogVideoWidth = getMeta(html, '', 'og:video:width') || '';
    metadata.raw.ogVideoHeight = getMeta(html, '', 'og:video:height') || '';
    metadata.raw.ogVideoType = getMeta(html, '', 'og:video:type') || '';
    metadata.raw.ogVideoSecureUrl = getMeta(html, '', 'og:video:secure_url') || '';
    metadata.raw.ogAudio = getMeta(html, '', 'og:audio') || '';
    metadata.raw.ogAudioSecureUrl = getMeta(html, '', 'og:audio:secure_url') || '';
    metadata.raw.ogAudioType = getMeta(html, '', 'og:audio:type') || '';
    
    // Twitter Card
    metadata.raw.twitterCard = getMeta(html, 'twitter:card', '') || '';
    metadata.raw.twitterTitle = getMeta(html, 'twitter:title', '') || '';
    metadata.raw.twitterDescription = getMeta(html, 'twitter:description', '') || '';
    metadata.raw.twitterImage = getMeta(html, 'twitter:image', '') || '';
    metadata.raw.twitterPlayer = getMeta(html, 'twitter:player', '') || '';
    metadata.raw.twitterPlayerWidth = getMeta(html, 'twitter:player:width', '') || '';
    metadata.raw.twitterPlayerHeight = getMeta(html, 'twitter:player:height', '') || '';
    metadata.raw.twitterSite = getMeta(html, 'twitter:site', '') || '';
    metadata.raw.twitterCreator = getMeta(html, 'twitter:creator', '') || '';
    
    // Fallback to title tag if no og:title
    if (!metadata.title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) metadata.title = titleMatch[1].trim();
    }
    
    // Fallback to meta description
    if (!metadata.description) {
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        if (descMatch) metadata.description = descMatch[1].trim();
    }
    
    // Schema.org JSON-LD
    const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
        metadata.raw.schemaOrg = [];
        for (const match of jsonLdMatches) {
            const content = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
            try {
                const parsed = JSON.parse(content);
                metadata.raw.schemaOrg.push(parsed);
                
                // Extract useful fields from schema.org
                if (parsed['@type'] === 'VideoObject' || (Array.isArray(parsed['@graph']) && parsed['@graph'].some(g => g['@type'] === 'VideoObject'))) {
                    const videoObj = parsed['@type'] === 'VideoObject' ? parsed : parsed['@graph'].find(g => g['@type'] === 'VideoObject');
                    if (videoObj) {
                        if (!metadata.title && videoObj.name) metadata.title = videoObj.name;
                        if (!metadata.description && videoObj.description) metadata.description = videoObj.description;
                        if (!metadata.thumbnail && videoObj.thumbnailUrl) metadata.thumbnail = Array.isArray(videoObj.thumbnailUrl) ? videoObj.thumbnailUrl[0] : videoObj.thumbnailUrl;
                        if (!metadata.duration && videoObj.duration) metadata.duration = videoObj.duration;
                        if (!metadata.raw.uploadDate && videoObj.uploadDate) metadata.raw.uploadDate = videoObj.uploadDate;
                        if (!metadata.raw.embedUrl && videoObj.embedUrl) metadata.raw.embedUrl = videoObj.embedUrl;
                        if (!metadata.raw.contentUrl && videoObj.contentUrl) metadata.raw.contentUrl = videoObj.contentUrl;
                    }
                }
            } catch (e) {}
        }
    }
    
    // Canonical URL
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
                           html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    if (canonicalMatch) metadata.canonicalUrl = canonicalMatch[1];
    
    // Favicon
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i);
    if (faviconMatch) metadata.raw.favicon = faviconMatch[1];
    
    // Detect source platform from URL or content
    const urlLower = sourceUrl.toLowerCase();
    const htmlLower = html.toLowerCase();
    
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be') || htmlLower.includes('youtube')) {
        metadata.source = 'youtube';
    } else if (urlLower.includes('instagram.com') || htmlLower.includes('instagram')) {
        metadata.source = 'instagram';
    } else if (urlLower.includes('twitter.com') || urlLower.includes('x.com') || htmlLower.includes('twitter')) {
        metadata.source = 'twitter';
    } else if (urlLower.includes('facebook.com') || urlLower.includes('fb.watch') || htmlLower.includes('facebook')) {
        metadata.source = 'facebook';
    } else if (urlLower.includes('tiktok.com') || htmlLower.includes('tiktok')) {
        metadata.source = 'tiktok';
    } else if (urlLower.includes('vimeo.com') || htmlLower.includes('vimeo')) {
        metadata.source = 'vimeo';
    } else if (urlLower.includes('dailymotion.com') || htmlLower.includes('dailymotion')) {
        metadata.source = 'dailymotion';
    } else if (urlLower.includes('ted.com') || htmlLower.includes('ted talk')) {
        metadata.source = 'ted';
    } else if (urlLower.includes('twitch.tv') || htmlLower.includes('twitch')) {
        metadata.source = 'twitch';
    } else if (urlLower.includes('bilibili.com') || htmlLower.includes('bilibili')) {
        metadata.source = 'bilibili';
    }
    
    // Try to extract video ID for common platforms
    if (metadata.source === 'youtube') {
        const ytIdMatch = sourceUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
        if (ytIdMatch) metadata.raw.videoId = ytIdMatch[1];
    }
    
    // Try to find direct video URLs in page (sometimes embedded)
    const videoUrlPatterns = [
        /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi,
        /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,
        /https?:\/\/[^"'\s]+\.webm[^"'\s]*/gi,
        /"contentUrl"\s*:\s*"([^"]+)"/gi,
        /"embedUrl"\s*:\s*"([^"]+)"/gi
    ];
    
    for (const pattern of videoUrlPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1] || match[0];
            if (url && !metadata.videoLinks.some(l => l.url === url)) {
                metadata.videoLinks.push({ quality: 'unknown', type: 'video', size: 'unknown', url });
            }
        }
    }
    
    // Clean up
    metadata.title = metadata.title.trim();
    metadata.description = metadata.description.trim();
    metadata.thumbnail = metadata.thumbnail.trim();
    
    return metadata;
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: node allinone.js <url>');
        console.error('Example: node allinone.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
        process.exit(1);
    }

    const url = args[0];
    console.log(`Fetching metadata for: ${url}\n`);

    try {
        const { html, url: finalUrl } = await fetchHtml(url);
        console.log(`Fetched ${html.length} bytes from ${finalUrl}\n`);
        
        const metadata = parseMetadata(html, finalUrl);
        
        console.log('=== METADATA ===');
        console.log(JSON.stringify(metadata, null, 2));
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();