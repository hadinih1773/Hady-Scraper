/**
 * allinone-downloader.js
 * Unified downloader for YouTube, TikTok, and Spotify
 * Returns MP3 audio URL and metadata
 * 
 * Usage:
 *   const downloader = require('./allinone-downloader');
 *   const result = await downloader.download('https://youtu.be/...');
 *   // or
 *   const result = await downloader.download('https://tiktok.com/...');
 *   // or
 *   const result = await downloader.download('https://open.spotify.com/...');
 * 
 * Returns:
 *   {
 *     platform: 'YouTube' | 'TikTok' | 'Spotify',
 *     title: string,
 *     artist: string (Spotify only),
 *     channel: string (YouTube/TikTok),
 *     duration: string,
 *     views: string/number,
 *     thumbnail: string,
 *     audioUrl: string (direct MP3 download URL),
 *     raw: object (full platform-specific data)
 *   }
 */

const axios = require('axios');
const http = require('http');
const https = require('https');
const dns = require('dns');
const querystring = require('querystring');

dns.setServers(['8.8.8.8', '1.1.1.1']);

const axiosClient = axios.create({
    timeout: 0,
    httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: Infinity,
        maxFreeSockets: 256,
        scheduling: 'fifo',
        rejectUnauthorized: false
    }),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
});

function customLookup(hostname, opts, callback) {
    dns.resolve4(hostname, (err, addresses) => {
        if (err || !addresses || addresses.length === 0) {
            dns.lookup(hostname, opts, callback);
        } else {
            if (opts.all) {
                callback(null, addresses.map(ip => ({ address: ip, family: 4 })));
            } else {
                callback(null, addresses[0], 4);
            }
        }
    });
}

function makeRequest(urlStr, method, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            lookup: customLookup,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...headers
            }
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function extractVideoId(url) {
    if (url.length === 11 && /^[\w-]+$/.test(url)) return url;
    const match = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return match ? match[1] : null;
}

async function fetchYouTubeMetadata(videoId) {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    try {
        const res = await makeRequest(oembedUrl, 'GET');
        if (res.statusCode === 200) {
            const data = JSON.parse(res.body);
            return {
                title: data.title || '',
                thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            };
        }
    } catch (e) {}
    return { title: '', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
}

async function downloadYouTube(url) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("URL atau Video ID YouTube tidak valid.");

    const meta = await fetchYouTubeMetadata(videoId);
    
    const keyHeaders = {
        'Content-Type': 'application/json',
        'Origin': 'https://frame.y2meta-uk.com',
        'Referer': `https://frame.y2meta-uk.com/wwwindex.php?videoId=${videoId}`
    };
    
    const keyRes = await makeRequest(`https://cnv.cx/v2/sanity/key?id=${videoId}`, 'GET', keyHeaders);
    if (keyRes.statusCode !== 200) {
        throw new Error(`Sanity key API error status ${keyRes.statusCode}`);
    }

    const keyData = JSON.parse(keyRes.body);
    const sanityKey = keyData.key;
    if (!sanityKey) throw new Error('Session key tidak ditemukan.');

    const convertBody = querystring.stringify({
        link: 'https://youtu.be/' + videoId,
        format: 'mp3',
        audioBitrate: 320,
        videoQuality: 720,
        filenameStyle: 'pretty',
        vCodec: 'h264'
    });

    const convertHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'accept': '*/*',
        'key': sanityKey,
        'Content-Length': Buffer.byteLength(convertBody),
        'Origin': 'https://frame.y2meta-uk.com',
        'Referer': `https://frame.y2meta-uk.com/wwwindex.php?videoId=${videoId}`
    };

    const convertRes = await makeRequest('https://cnv.cx/v2/converter', 'POST', convertHeaders, convertBody);
    if (convertRes.statusCode !== 200) {
        throw new Error(`Converter API error status ${convertRes.statusCode}`);
    }

    const convertData = JSON.parse(convertRes.body);
    let downloadUrl = convertData && convertData.url ? convertData.url : 'https://conv.mp3youtube.cc/download/' + videoId;

    return { 
        platform: 'YouTube',
        title: meta.title || "Untitled Video", 
        thumbnail: meta.thumbnail, 
        audioUrl: downloadUrl,
        raw: { videoId }
    };
}

async function downloadTikTok(url) {
    const { data } = await axiosClient.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 60000 });
    if (!data || data.code !== 0 || !data.data) throw new Error("Gagal mengambil data dari TikWM.");
    const d = data.data;

    const audioUrl = d.music || (d.music_info ? d.music_info.play : null);
    if (!audioUrl) throw new Error("Tidak ditemukan audio/music untuk video ini.");

    return { 
        platform: 'TikTok',
        title: d.title || '-', 
        channel: d.author ? d.author.nickname : '-',
        duration: d.duration || '-',
        views: d.play_count !== undefined ? d.play_count : '-',
        likes: d.digg_count !== undefined ? d.digg_count : '-',
        thumbnail: d.cover || d.origin_cover || '-',
        audioUrl: audioUrl.startsWith('http') ? audioUrl : 'https://www.tikwm.com' + audioUrl,
        raw: d
    };
}

async function downloadSpotify(url) {
    const { data } = await axiosClient.get(`https://api.nexray.web.id/downloader/spotify?url=${encodeURIComponent(url)}`, { timeout: 60000 });
    if (!data.status || !data.result) throw new Error("Gagal mengambil data Spotify.");
    const d = data.result;

    if (!d.url) throw new Error("Tidak ditemukan audio untuk track Spotify ini.");

    return { 
        platform: 'Spotify',
        title: d.title, 
        artist: d.artist || '-',
        duration: '-',
        thumbnail: '-',
        audioUrl: d.url,
        raw: d
    };
}

async function download(url) {
    const isYt = /youtube\.com|youtu\.be/i.test(url);
    const isTt = /tiktok\.com|vt\.tiktok\.com/i.test(url);
    const isSp = /spotify\.com/i.test(url);

    if (isYt) return await downloadYouTube(url);
    if (isTt) return await downloadTikTok(url);
    if (isSp) return await downloadSpotify(url);
    
    throw new Error("URL tidak didukung. Gunakan YouTube, TikTok, atau Spotify.");
}

module.exports = { download, downloadYouTube, downloadTikTok, downloadSpotify };

/* ================= CLI TEST ================= */
if (require.main === module) {
    (async () => {
        const [url] = process.argv.slice(2);
        if (!url) {
            console.log('Usage: node allinone-downloader.js <url>');
            console.log('Supported: YouTube, TikTok, Spotify');
            process.exit(1);
        }
        try {
            console.log(`\n🔄 Downloading from: ${url}`);
            const result = await download(url);
            console.log('\n✅ Result:');
            console.log(JSON.stringify(result, null, 2));
        } catch (err) {
            console.error('\n❌ Error:', err.message);
            process.exit(1);
        }
    })();
}