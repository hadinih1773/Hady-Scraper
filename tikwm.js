/**
 * tikwm.js  @~T Scraper TikTok via tikwm.com
 *
 * Pemakaian sebagai module (untuk bot):
 *   const tikwm = require('./tikwm');
 *
 *   // Semua info
 *   const info = await tikwm('https://www.tiktok.com/@user/video/123');
 *   info.music   -> URL audio/mp3
 *   info.video   -> URL video tanpa watermark
 *   info.videoHD -> URL video HD tanpa watermark
 *
 *   // Shortcut
 *   await tikwm.music('https://www.tiktok.com/@user/video/123');  // { url, title, cover, author }
 *   await tikwm.video('https://www.tiktok.com/@user/video/123');  // { url, hd, wm, title, cover }
 *
 * Pemakaian CLI:
 *   node tikwm.js <url>            -> semua info (JSON)
 *   node tikwm.js <url> music      -> audio saja
 *   node tikwm.js <url> video      -> video saja
 *
 * Butuh: axios (sudah ada di bot), Node.js 14+
 */
const axios = require('axios');

const API = 'https://tikwm.com/api/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// tikwm kadang balikin path relatif (mis. "/video/tos/...")
const abs = (u) => (u ? (u.startsWith('http') ? u : 'https://www.tikwm.com' + u) : null);

async function request(url, { hd = true, timeout = 60000 } = {}) {
    const { data } = await axios.get(API, {
        params: { url, hd: hd ? 1 : 0 },
        timeout,
        headers: { 'User-Agent': UA }
    });
    if (data.code !== 0 || !data.data) {
        throw new Error(data.msg || 'Gagal mengambil data TikTok');
    }
    return data.data;
}

function normalize(d) {
    return {
        id: d.id,
        title: d.title || '-',
        duration: d.duration,
        taken_at: d.taken_at,
        video: abs(d.play),        // tanpa watermark
        videoHD: abs(d.hdplay),    // HD tanpa watermark
        videoWM: abs(d.wmplay),    // dengan watermark
        music: abs(d.music),       // audio mp3
        cover: abs(d.cover),
        originCover: abs(d.origin_cover),
        musicCover: abs(d.music_cover),
        author: {
            username: d.author?.unique_id || '-',
            nickname: d.author?.nickname || '-',
            avatar: abs(d.author?.avatar)
        },
        stats: {
            views: d.play_count || 0,
            likes: d.digg_count || 0,
            comments: d.comment_count || 0,
            shares: d.share_count || 0
        }
    };
}

/**
 * Ambil semua info dari satu video TikTok.
 * @param {string} url  Link TikTok (www.tiktok.com/.../video/... atau vt.tiktok.com/...)
 * @param {object} opts { hd: boolean, timeout: number }
 */
async function tikwm(url, opts) {
    if (!url || !/tiktok\.com/i.test(url)) {
        throw new Error('URL TikTok tidak valid');
    }
    return normalize(await request(url, opts));
}

/** Audio/mp3 saja  @~T praktis buat fitur play/lagu di bot */
tikwm.music = async function (url, opts) {
    const info = await tikwm(url, opts);
    return {
        title: info.title,
        url: info.music,
        cover: info.musicCover || info.cover,
        duration: info.duration,
        author: info.author.nickname,
        views: info.stats.views
    };
};

/** Video saja  @~T url = tanpa watermark, hd = versi HD, wm = dengan watermark */
tikwm.video = async function (url, opts) {
    const info = await tikwm(url, opts);
    return {
        title: info.title,
        url: info.video,
        hd: info.videoHD,
        wm: info.videoWM,
        cover: info.cover,
        duration: info.duration,
        author: info.author.nickname,
        stats: info.stats
    };
};

module.exports = tikwm;

/* ================= CLI ================= */
if (require.main === module) {
    (async () => {
        const [url, mode] = process.argv.slice(2);
        if (!url) {
            console.log('Pemakaian: node tikwm.js <url> [music|video]');
            process.exit(1);
        }
        try {
            if (mode === 'music') {
                console.log(JSON.stringify(await tikwm.music(url), null, 2));
            } else if (mode === 'video') {
                console.log(JSON.stringify(await tikwm.video(url), null, 2));
            } else {
                console.log(JSON.stringify(await tikwm(url), null, 2));
            }
        } catch (err) {
            console.error('Error:', err.message);
            process.exit(1);
        }
    })();
}
