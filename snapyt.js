/**
 * SnapYT Scraper & Downloader
 * ============================
 * Scrape https://www.snapyt.app/ — ambil semua metadata + semua format
 * video & audio yang tersedia, siap dipakai untuk bot.
 *
 * Cara kerja (di-reverse dari situs SnapYT):
 *   1. GET  https://www.snapyt.app/            → ambil nonce dari window.videoDownloader
 *   2. POST /wp-admin/admin-ajax.php           → action=process_video_url (+ nonce)
 *      → response JSON berisi redirect ke halaman video-preview
 *   3. GET  halaman video-preview              → parse <select id="fmt-select">
 *      → tiap <option> punya data-label, data-kind, data-ext, data-bytes,
 *        data-url (stream googlevideo langsung), data-force (proxy download SnapYT)
 *
 * Contoh pakai:
 *   const snapyt = require('./snapyt');
 *   const info = await snapyt.getVideoInfo('https://youtu.be/dQw4w9WgXcQ');
 *   console.log(info.title, info.thumbnail);
 *   info.formats.forEach(f => console.log(f.label, f.sizeText, f.downloadUrl));
 *
 *   // Download ke file:
 *   await snapyt.download(info, { kind: 'video+audio' }, 'video.mp4');
 *   await snapyt.download(info, { kind: 'audio-only', ext: 'm4a' }, 'audio.m4a');
 *
 *   // MP3 (butuh ffmpeg terinstall di sistem):
 *   await snapyt.downloadMp3(info, 'audio.mp3', 320);
 *
 * CLI:
 *   node snapyt.js                        → metadata halaman utama SnapYT
 *   node snapyt.js <youtube-url>          → metadata + semua format video tsb
 *   node snapyt.js <youtube-url> --dl 0   → download format index 0 ke file
 *   node snapyt.js <youtube-url> --dl mp3 → download audio & convert ke MP3 320k
 */

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL: URLParser } = require('url');

const BASE_URL = 'https://www.snapyt.app';
const AJAX_URL = BASE_URL + '/wp-admin/admin-ajax.php';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 45000;
const MAX_REDIRECTS = 10;

/* ------------------------------------------------------------------ */
/* HTTP helper                                                         */
/* ------------------------------------------------------------------ */

/**
 * Request HTTP/HTTPS generik. Support redirect, method POST, header custom.
 * Return { statusCode, headers, body(Buffer) }.
 */
function request(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) return reject(new Error('Too many redirects'));
    const urlObj = new URLParser(url);
    const mod = urlObj.protocol === 'https:' ? https : http;

    const req = mod.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          ...(options.headers || {}),
        },
        timeout: options.timeout || TIMEOUT,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URLParser(res.headers.location, url).href;
          return resolve(request(next, options, redirectCount + 1));
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.on('error', reject);

    if (options.body) req.write(options.body);
    req.end();
  });
}

/* ------------------------------------------------------------------ */
/* YouTube URL validation & parsing (sama seperti logika SnapYT)       */
/* ------------------------------------------------------------------ */

/**
 * Validasi & normalisasi URL YouTube (watch / youtu.be / shorts / embed / live / v).
 * Return URL string yang sudah dinormalisasi, atau null kalau invalid.
 */
function normalizeYouTubeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URLParser(s);
    const host = (u.hostname || '').toLowerCase();
    if (host === 'youtu.be' && u.pathname.length > 1) return `https://youtu.be${u.pathname}`;
    if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtube-nocookie\.com$/.test(host)) {
      const p = u.pathname || '';
      if (p === '/watch' && u.searchParams && u.searchParams.get('v')) {
        return `https://www.youtube.com/watch?v=${u.searchParams.get('v')}`;
      }
      if (/^\/(shorts|embed|live|v)\/[^/]+/.test(p)) return `https://www.youtube.com${p}`;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/** Ekstrak video ID dari URL YouTube yang valid. */
function extractVideoId(raw) {
  const norm = normalizeYouTubeUrl(raw);
  if (!norm) return null;
  try {
    const u = new URLParser(norm);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    const m = u.pathname.match(/\/(shorts|embed|live|v)\/([^/?]+)/);
    if (m) return m[2];
    return u.searchParams.get('v');
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* HTML parsing helper (tanpa dependency eksternal)                    */
/* ------------------------------------------------------------------ */

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/* ------------------------------------------------------------------ */
/* Step 1: ambil nonce dari halaman utama                              */
/* ------------------------------------------------------------------ */

function extractNonce(html) {
  // window.videoDownloader = {"ajaxUrl":"...","nonce":"ac67cd7ec7"}
  const m =
    html.match(/videoDownloader\s*=\s*\{[^}]*"nonce"\s*:\s*"([a-f0-9]+)"/) ||
    html.match(/video_downloader_ajax\s*=\s*\{[^}]*"nonce"\s*:\s*"([a-f0-9]+)"/);
  return m ? m[1] : null;
}

async function getNonce() {
  const res = await request(BASE_URL + '/');
  if (res.statusCode !== 200) throw new Error(`Gagal fetch homepage (HTTP ${res.statusCode})`);
  const html = res.body.toString('utf8');
  const nonce = extractNonce(html);
  if (nonce) return nonce;

  // Fallback: minta nonce fresh dari server (action=vd_fresh_nonce)
  const fresh = await request(AJAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: BASE_URL + '/',
    },
    body: 'action=vd_fresh_nonce',
  });
  try {
    const j = JSON.parse(fresh.body.toString('utf8'));
    if (j && j.success && j.data && j.data.nonce) return j.data.nonce;
  } catch (e) {
    /* ignore */
  }
  throw new Error('Nonce tidak ditemukan — kemungkinan SnapYT mengubah struktur halaman');
}

/* ------------------------------------------------------------------ */
/* Step 2: submit URL ke AJAX → dapat redirect ke halaman preview      */
/* ------------------------------------------------------------------ */

async function submitVideoUrl(videoUrl, nonce) {
  const body =
    'action=process_video_url' +
    `&video_url=${encodeURIComponent(videoUrl)}` +
    (nonce ? `&security=${encodeURIComponent(nonce)}` : '');

  const res = await request(AJAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: BASE_URL + '/',
      Origin: BASE_URL,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });

  const text = res.body.toString('utf8');
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Response AJAX tidak valid (HTTP ${res.statusCode}): ${text.slice(0, 200)}`);
  }

  if (json && json.success && json.data && json.data.redirect) {
    return json.data.redirect;
  }

  // Nonce kadang stale → minta fresh lalu retry sekali
  const errMsg =
    json && json.data && typeof json.data === 'string' ? json.data : 'AJAX gagal tanpa pesan';
  const err = new Error(errMsg);
  err.staleNonce = res.statusCode === 403 || !json || !json.success;
  throw err;
}

/* ------------------------------------------------------------------ */
/* Step 3: fetch halaman preview → parse metadata + semua format       */
/* ------------------------------------------------------------------ */

function parseFormatOptions(html) {
  const formats = [];
  const re = /<option\b([^>]*)>([^<]*)<\/option>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const text = decodeEntities(m[2]).trim();
    if (!text) continue; // skip "Select video quality"

    const attr = (name) => {
      const a = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return a ? decodeEntities(a[1]) : '';
    };

    const label = attr('data-label');
    const kind = attr('data-kind');
    if (!label || !kind) continue;

    const force = attr('data-force');
    const streamUrl = attr('data-url');
    const ext = attr('data-ext') || null;
    const bytesAttr = attr('data-bytes');
    const mp3kbpsAttr = attr('data-mp3');

    formats.push({
      index: attr('data-index') ? parseInt(attr('data-index'), 10) : formats.length,
      label,
      kind, // 'video+audio' | 'video-only' | 'audio-only'
      ext,
      quality: label.split(' ')[0], // "360p", "1080p", "MP3", "M4A", "Opus"...
      sizeBytes: bytesAttr ? parseInt(bytesAttr, 10) : null,
      sizeText: attr('data-size') || null,
      recommended: attr('data-recommended') === '1',
      // MP3 di SnapYT dikonversi client-side dari stream audio sumber:
      mp3Kbps: mp3kbpsAttr ? parseInt(mp3kbpsAttr, 10) : null,
      mp3SourceIndex: attr('data-src') ? parseInt(attr('data-src'), 10) : null,
      durationSecs: attr('data-secs') ? parseInt(attr('data-secs'), 10) : null,
      // URL download via proxy SnapYT (snapyt_force_download) — paling reliable
      downloadUrl: force || null,
      // Stream langsung googlevideo.com — lebih cepat tapi cepat expired & IP-locked
      streamUrl: streamUrl || null,
    });
  }
  return formats;
}

function parsePreviewPage(html, previewUrl) {
  const pick = (re) => {
    const m = html.match(re);
    return m ? decodeEntities(m[1]) : null;
  };

  const title = pick(/VIDEO_TITLE\s*=\s*"([^"]*)"/) || pick(/<title>([^<]*)<\/title>/);
  const saveTitle = pick(/SAVE_TITLE\s*=\s*"([^"]*)"/);
  const thumbnail = pick(/<img[^>]*id="vd-image"[^>]*src="([^"]*)"/) ||
    pick(/<img[^>]*src="([^"]*i\.ytimg\.com[^"]*)"/);
  const videoId = pick(/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\//);

  const formats = parseFormatOptions(html);
  const hasMux = /id="mux-video"/.test(html);

  return {
    source: 'snapyt.app',
    scrapedAt: new Date().toISOString(),
    previewUrl,
    videoId,
    title: title || null,
    filenameBase: saveTitle || (title ? title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-') : 'video'),
    thumbnail: thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : null),
    canMergeInBrowser: hasMux, // situs punya ffmpeg.wasm mux video-only + audio
    formats,
    videos: formats.filter((f) => f.kind !== 'audio-only'),
    audios: formats.filter((f) => f.kind === 'audio-only'),
  };
}

async function fetchPreviewPage(previewUrl) {
  const res = await request(previewUrl, {
    headers: { Referer: BASE_URL + '/' },
  });
  if (res.statusCode !== 200) {
    throw new Error(`Gagal fetch halaman preview (HTTP ${res.statusCode})`);
  }
  return res.body.toString('utf8');
}

/* ------------------------------------------------------------------ */
/* API utama                                                           */
/* ------------------------------------------------------------------ */

/**
 * Ambil semua metadata + format video/audio untuk 1 URL YouTube.
 * Return object:
 *   { source, videoId, title, thumbnail, formats[], videos[], audios[] }
 */
async function getVideoInfo(youtubeUrl) {
  const normalized = normalizeYouTubeUrl(youtubeUrl);
  if (!normalized) {
    throw new Error('URL YouTube tidak valid. Contoh: https://www.youtube.com/watch?v=xxx atau https://youtu.be/xxx');
  }

  const nonce = await getNonce();

  let previewUrl;
  try {
    previewUrl = await submitVideoUrl(normalized, nonce);
  } catch (err) {
    if (err.staleNonce) {
      // retry sekali dengan nonce fresh
      const freshNonce = await getNonce();
      previewUrl = await submitVideoUrl(normalized, freshNonce);
    } else {
      throw err;
    }
  }

  const html = await fetchPreviewPage(previewUrl);
  const info = parsePreviewPage(html, previewUrl);
  info.requestedUrl = normalized;
  return info;
}

/**
 * Cari satu format dari info. Filter contoh:
 *   pickFormat(info, { kind: 'video+audio' })                  → progressif (ada suara)
 *   pickFormat(info, { kind: 'video-only', quality: '1080p' }) → video 1080p tanpa suara
 *   pickFormat(info, { kind: 'audio-only', ext: 'm4a' })       → audio m4a
 *   pickFormat(info, { kind: 'audio-only', mp3Kbps: 320 })     → sumber audio utk MP3 320k
 * Tanpa filter → format recommended (biasanya 360p MP4 video+audio).
 */
function pickFormat(info, filter = {}) {
  if (!info || !Array.isArray(info.formats) || info.formats.length === 0) return null;
  let list = info.formats;
  if (filter.kind) list = list.filter((f) => f.kind === filter.kind);
  if (filter.ext) list = list.filter((f) => f.ext === filter.ext);
  if (filter.quality) list = list.filter((f) => f.quality === filter.quality);
  if (filter.mp3Kbps) list = list.filter((f) => f.mp3Kbps === filter.mp3Kbps);
  if (list.length === 0) return null;
  // paling tinggi dulu kalau tidak minta recommended
  if (filter.recommended) {
    const rec = list.find((f) => f.recommended);
    if (rec) return rec;
  }
  return list[0];
}

/**
 * Download sebuah format ke file. Pakai downloadUrl (proxy SnapYT) secara default;
 * fallback ke streamUrl kalau proxy gagal. Return path file.
 */
async function download(info, filterOrFormat, outputPath) {
  const format =
    typeof filterOrFormat === 'object' && filterOrFormat && 'label' in filterOrFormat
      ? filterOrFormat
      : pickFormat(info, filterOrFormat || {});
  if (!format) throw new Error('Format tidak ditemukan untuk filter tsb');

  const ext = format.ext || 'bin';
  const file = outputPath || `${info.filenameBase || 'snapyt'}-${format.label.replace(/\s+/g, '')}.${ext}`;

  const urls = [format.downloadUrl, format.streamUrl].filter(Boolean);
  let lastErr;
  for (const url of urls) {
    try {
      await downloadToFile(url, file, {
        Referer: BASE_URL + '/',
      });
      return file;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Download gagal');
}

/** Stream URL → file, mengikuti redirect. */
function downloadToFile(url, filePath, headers = {}) {
  return new Promise((resolve, reject) => {
    const doFetch = (u, count) => {
      if (count > MAX_REDIRECTS) return reject(new Error('Too many redirects'));
      const urlObj = new URLParser(u);
      const mod = urlObj.protocol === 'https:' ? https : http;

      const req = mod.get(
        u,
        {
          headers: { 'User-Agent': USER_AGENT, ...headers },
          timeout: 120000,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return doFetch(new URLParser(res.headers.location, u).href, count + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} saat download`));
          }
          const out = fs.createWriteStream(filePath);
          res.pipe(out);
          out.on('finish', () => out.close(() => resolve(filePath)));
          out.on('error', reject);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout saat download'));
      });
      req.on('error', reject);
    };
    doFetch(url, 0);
  });
}

/**
 * Download audio + convert ke MP3 via ffmpeg lokal (situs aslinya pakai
 * ffmpeg.wasm di browser; di Node kita pakai ffmpeg binary).
 * @param {number} kbps 128 | 192 | 320
 */
async function downloadMp3(info, outputPath = null, kbps = 320) {
  const src = pickFormat(info, { kind: 'audio-only', ext: 'm4a' }) ||
    pickFormat(info, { kind: 'audio-only' });
  if (!src) throw new Error('Tidak ada stream audio yang tersedia');

  const tmp = path.join(
    require('os').tmpdir(),
    `snapyt-audio-${Date.now()}-${(src.label || 'a').replace(/\s+/g, '')}.${src.ext || 'm4a'}`
  );

  const urls = [src.downloadUrl, src.streamUrl].filter(Boolean);
  let lastErr;
  for (const url of urls) {
    try {
      await downloadToFile(url, tmp, { Referer: BASE_URL + '/' });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;

  const file = outputPath || `${info.filenameBase || 'snapyt'}.mp3`;
  await convertToMp3(tmp, file, kbps, info.title || '');
  try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  return file;
}

/** Convert file audio/video → MP3 pakai ffmpeg binary sistem. */
function convertToMp3(input, output, kbps = 320, title = '') {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', input,
      '-vn',
      '-map', '0:a:0',
      '-ac', '2',
      '-c:a', 'libmp3lame',
      '-b:a', `${kbps}k`,
      '-id3v2_version', '3',
    ];
    if (title) args.push('-metadata', `title=${title}`);
    args.push(output);

    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errOut = '';
    ff.stderr.on('data', (d) => { if (errOut.length < 4000) errOut += d.toString(); });
    ff.on('error', (e) =>
      reject(new Error('ffmpeg tidak ditemukan. Install dulu (apt install ffmpeg / brew install ffmpeg)'))
    );
    ff.on('close', (code) => {
      if (code === 0) return resolve(output);
      reject(new Error(`ffmpeg exit ${code}: ${errOut.slice(-400)}`));
    });
  });
}

/* ------------------------------------------------------------------ */
/* Metadata halaman utama SnapYT (untuk keperluan scrape umum)         */
/* ------------------------------------------------------------------ */

async function getSiteMetadata() {
  const res = await request(BASE_URL + '/');
  const html = res.body.toString('utf8');
  const pick = (re) => {
    const m = html.match(re);
    return m ? decodeEntities(m[1]) : null;
  };
  return {
    url: BASE_URL + '/',
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    ogTitle: pick(/<meta property="og:title" content="([^"]*)"/),
    ogDescription: pick(/<meta property="og:description" content="([^"]*)"/),
    ogImage: pick(/<meta property="og:image" content="([^"]*)"/),
    nonce: extractNonce(html),
    languages: Array.from(html.matchAll(/href="(https:\/\/www\.snapyt\.app\/[a-z-]+\/)"/g))
      .map((m) => m[1])
      .filter((v, i, a) => a.indexOf(v) === i),
    tools: Array.from(html.matchAll(/href="(\/[a-z-]*downloader\/)"/g)).map((m) => BASE_URL + m[1]),
  };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

if (require.main === module) {
  const arg = process.argv[2];
  const dlArgIdx = process.argv.indexOf('--dl');
  const dlArg = dlArgIdx !== -1 ? process.argv[dlArgIdx + 1] : null;

  if (!arg) {
    // Metadata situs
    getSiteMetadata()
      .then((meta) => console.log(JSON.stringify(meta, null, 2)))
      .catch((e) => {
        console.error('Gagal:', e.message);
        process.exit(1);
      });
  } else {
    const ytUrl = arg;
    (async () => {
      try {
        console.error(`→ Mengambil info: ${ytUrl}`);
        const info = await getVideoInfo(ytUrl);

        if (!dlArg) {
          // Print metadata ringkas + semua format
          const brief = {
            videoId: info.videoId,
            title: info.title,
            thumbnail: info.thumbnail,
            durationSecs: info.formats.find((f) => f.durationSecs)?.durationSecs || null,
            previewUrl: info.previewUrl,
            formats: info.formats.map((f) => ({
              index: f.index,
              label: f.label,
              kind: f.kind,
              ext: f.ext,
              size: f.sizeText,
              recommended: f.recommended,
              mp3Kbps: f.mp3Kbps || undefined,
              downloadUrl: f.downloadUrl,
            })),
          };
          console.log(JSON.stringify(brief, null, 2));
          return;
        }

        // Mode download
        let file;
        if (dlArg === 'mp3') {
          console.error('→ Download audio + convert MP3 320k (butuh ffmpeg)...');
          file = await downloadMp3(info, null, 320);
        } else if (/^\d+$/.test(dlArg)) {
          const fmt = info.formats.find((f) => f.index === parseInt(dlArg, 10));
          if (!fmt) throw new Error(`Format index ${dlArg} tidak ada. Pilihan: ${info.formats.map((f) => f.index).join(', ')}`);
          console.error(`→ Download: ${fmt.label} (${fmt.sizeText || '?'})...`);
          file = await download(info, fmt);
        } else if (dlArg === 'video') {
          console.error('→ Download video terbaik yang ada audionya (progressive)...');
          const fmt = pickFormat(info, { kind: 'video+audio', recommended: true }) ||
            pickFormat(info, { kind: 'video+audio' });
          if (!fmt) throw new Error('Tidak ada format video+audio');
          console.error(`→ Download: ${fmt.label}...`);
          file = await download(info, fmt);
        } else if (dlArg === 'audio') {
          console.error('→ Download audio terbaik...');
          const fmt = pickFormat(info, { kind: 'audio-only' });
          if (!fmt) throw new Error('Tidak ada format audio');
          console.error(`→ Download: ${fmt.label}...`);
          file = await download(info, fmt);
        } else {
          throw new Error('--dl menerima: angka index, "video", "audio", atau "mp3"');
        }
        console.log('✔ Tersimpan:', file);
      } catch (e) {
        console.error('✖ Gagal:', e.message);
        process.exit(1);
      }
    })();
  }
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

module.exports = {
  getSiteMetadata,
  getVideoInfo,
  pickFormat,
  download,
  downloadMp3,
  normalizeYouTubeUrl,
  extractVideoId,
};
