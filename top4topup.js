/**
 *
 * Scrape Name: Uploader Top4Top
 * Credit By Zix
 * Link Saluran other: https://whatsapp.com/channel/0029Vb6P2e1E50UZYaX4wI0W
 *
**/

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Daftar MIME type per ekstensi (gambar, video, audio, dokumen, arsip)
const MIME_TYPES = {
    // Gambar
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    // Video
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.webm': 'video/webm', '.3gp': 'video/3gpp',
    '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv',
    // Audio
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
    '.opus': 'audio/opus', '.amr': 'audio/amr',
    // Dokumen
    '.pdf': 'application/pdf', '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Arsip & lainnya
    '.zip': 'application/zip', '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed', '.apk': 'application/vnd.android.package-archive',
    '.json': 'application/json'
};

function getMime(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

// Ekstensi yang diizinkan, diambil otomatis dari daftar MIME_TYPES
const EXT_LIST = Object.keys(MIME_TYPES).map(e => e.slice(1)).join('|');

// Link langsung ke file media (berakhir .jpg, .mp3, dll), bukan halaman/link lain
const DIRECT_LINK_REGEX = new RegExp(
    `https?:\\/\\/[^\\s"'<>\\[\\]]+?\\.(?:${EXT_LIST})(?![a-z0-9])`, 'gi'
);

function extractDirectLinks(text) {
    return text.match(DIRECT_LINK_REGEX) || [];
}

/**
 * Upload satu atau banyak file ke Top4Top.
 * @param {string|string[]} files - path file atau array path file
 * @returns {Promise<string[]>} daftar link langsung hasil upload
 */
async function uploadFileToTop4Top(files) {
    const targetUrl = 'https://top4top.io/index.php';
    const list = Array.isArray(files) ? files : [files];

    // Validasi file
    const validFiles = list.filter(f => {
        if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
            console.error(`❌ File tidak ditemukan: ${f}`);
            return false;
        }
        return true;
    });

    if (validFiles.length === 0) return [];

    try {
        console.log(`Memulai upload ${validFiles.length} file...`);

        const form = new FormData();

        validFiles.forEach((filePath, i) => {
            const size = fs.statSync(filePath).size;
            console.log(`  • ${path.basename(filePath)} (${getMime(filePath)}, ${formatSize(size)})`);

            form.append(`file_${i}_`, fs.createReadStream(filePath), {
                filename: path.basename(filePath),
                contentType: getMime(filePath),
                knownLength: size
            });
        });

        form.append('submitr', '[ رفع الملفات ]');

        const response = await axios.post(targetUrl, form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Referer': 'https://top4top.io/',
                'Origin': 'https://top4top.io'
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 0 // tanpa batas waktu, supaya video besar tidak putus
        });

        const $ = cheerio.load(response.data);
        const found = [];

        // Ambil dari input/textarea, lalu saring hanya link file langsung
        $('input[type="text"], textarea').each((i, el) => {
            const val = $(el).val() || $(el).text();
            if (val) found.push(...extractDirectLinks(val));
        });

        // Cadangan: cari langsung di seluruh HTML
        found.push(...extractDirectLinks(response.data));

        const links = [...new Set(found)];

        if (links.length > 0) {
            console.log('\n✅ Upload berhasil:');
            links.forEach((link, idx) => console.log(`${idx + 1}. ${link}`));
        } else {
            console.log('\n⚠️ Proses HTTP sukses, tetapi link langsung tidak ditemukan di halaman.');
            console.log('Kemungkinan format file tidak didukung atau ukuran melebihi batas Top4Top.');
        }

        return links;

    } catch (error) {
        console.error('\n❌ Terjadi kesalahan saat upload:', error.message);
        if (error.response) {
            console.error('Status Code:', error.response.status);
        }
        return [];
    }
}

module.exports = { uploadFileToTop4Top };

// Jalankan langsung: node upload.js file1.jpg video.mp4 lagu.mp3
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Cara pakai: node upload.js <file1> <file2> ...');
        process.exit(0);
    }
    uploadFileToTop4Top(args);
}
