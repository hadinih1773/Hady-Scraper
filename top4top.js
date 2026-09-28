/**
 * CLI Top4Top Converter
 * Upload audio ke top4top.io via API hadytools.
 *
 * Mendukung:
 *  - URL file audio langsung (.mp3 dll)
 *  - Link YouTube  (di-resolve lokal dulu via api-faa)
 *  - Link TikTok   (di-resolve lokal dulu via tikwm)
 *  - Link Spotify  (di-resolve lokal dulu via nexray)
 *
 * Pemakaian:
 *   node top4top.js <URL> [judul]
 *   node top4top.js https://youtu.be/xxxx "judul lagu"
 *
 * Catatan: resolve link platform dilakukan di komputer kamu (bukan di server),
 * karena sebagian API downloader memblokir IP server (Vercel).
 */
const axios = require('axios');

const API_URL = 'https://hadytools.vercel.app/api/top4top';
const YT_RE = /youtube\.com|youtu\.be/i;
const TT_RE = /tiktok\.com/i;
const SP_RE = /spotify\.com/i;

async function getAudioUrl(link) {
    if (YT_RE.test(link)) {
        console.log('Deteksi: YouTube -> convert ke MP3 dulu...');
        const { data } = await axios.get(
            `https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(link)}`,
            { timeout: 60000 }
        );
        if (!data.status || !data.result?.mp3) throw new Error('Gagal convert YouTube ke MP3');
        return { audioUrl: data.result.mp3, title: data.result.title || 'audio' };
    }
    if (TT_RE.test(link)) {
        console.log('Deteksi: TikTok -> ambil musik dulu...');
        const { data } = await axios.get(
            `https://tikwm.com/api/?url=${encodeURIComponent(link)}`,
            { timeout: 60000 }
        );
        if (data.code !== 0 || !data.data?.music) throw new Error('Gagal mengambil musik TikTok');
        return { audioUrl: data.data.music, title: data.data.title || 'audio' };
    }
    if (SP_RE.test(link)) {
        console.log('Deteksi: Spotify -> ambil audio dulu...');
        const { data } = await axios.get(
            `https://api.nexray.eu.cc/downloader/spotify?url=${encodeURIComponent(link)}`,
            { timeout: 60000 }
        );
        if (!data.status || !data.result?.url) throw new Error('Gagal mengambil audio Spotify');
        return { audioUrl: data.result.url, title: data.result.title || 'audio' };
    }
    if (!/^https?:\/\//i.test(link)) {
        throw new Error('URL tidak valid, harus diawali http:// atau https://');
    }
    return { audioUrl: link, title: 'audio' };
}

async function main() {
    const args = process.argv.slice(2);
    const input = args[0];
    const titleOverride = args[1];

    if (!input) {
        console.log('Penggunaan: node top4top.js <URL_AUDIO / YouTube / TikTok / Spotify> [judul]');
        console.log('Contoh : node top4top.js https://youtu.be/xxxx "judul lagu"');
        console.log('         node top4top.js https://example.com/audio.mp3');
        process.exit(1);
    }

    try {
        const { audioUrl, title } = await getAudioUrl(input);
        const finalTitle = titleOverride || title;

        console.log('Sedang memproses upload...');
        const response = await axios.post(
            API_URL,
            { audioUrl, title: finalTitle },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 300000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            }
        );

        if (response.data && response.data.status) {
            console.log('\n--- Berhasil ---');
            console.log('Judul      :', response.data.result.title);
            console.log('Top4Top URL:', response.data.result.top4top);
        } else {
            console.error('\nGagal:', response.data?.error);
            process.exit(1);
        }
    } catch (err) {
        console.error('\nError:', err.response?.data?.error || err.message);
        process.exit(1);
    }
}

main();
