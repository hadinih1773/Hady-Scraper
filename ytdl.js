/**
 * YouTube Search + Downloader with uguu.se upload
 * Creator: Hady
 * Base: https://www.youtube.com
 */

const axios = require("axios");
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const YT = "https://www.youtube.com";
const CNV = "https://cnv.cx/v2";
const FRAME = "https://frame.y2meta-uk.com";
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const FALLBACK = {
  key: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  version: "2.20261002.10.00",
};
const META = {
  Creator: "Hady"
};

const yt = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent": UA,
    "Content-Type": "application/json",
    Origin: YT,
    Referer: YT + "/",
  },
});

const cnv = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent": UA,
    Referer: FRAME + "/",
    Origin: FRAME,
  },
});

async function getConfig() {
  try {
    const res = await axios.get(YT + "/?hl=en", {
      timeout: 10000,
      headers: { "User-Agent": UA, Cookie: "CONSENT=YES+1; SOCS=CAI" },
    });
    const html = String(res.data);
    const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    return {
      key: key ? key[1] : FALLBACK.key,
      version: version ? version[1] : FALLBACK.version,
    };
  } catch {
    return FALLBACK;
  }
}

const text = (o) => (o ? o.simpleText || (o.runs ? o.runs.map((r) => r.text).join("") : null) : null) || null;

function collect(node, out) {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (node.videoRenderer) out.push(node.videoRenderer);
  for (const k in node) {
    if (k !== "videoRenderer") collect(node[k], out);
  }
}

function mapVideo(v) {
  const owner = v.ownerText && v.ownerText.runs ? v.ownerText.runs[0] : null;
  const path = owner && owner.navigationEndpoint && owner.navigationEndpoint.browseEndpoint
    ? owner.navigationEndpoint.browseEndpoint.canonicalBaseUrl
    : null;
  const snippet = v.detailedMetadataSnippets && v.detailedMetadataSnippets[0]
    ? text(v.detailedMetadataSnippets[0].snippetText)
    : null;
  return {
    videoId: v.videoId,
    title: text(v.title),
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    duration: text(v.lengthText),
    views: text(v.viewCountText),
    published: text(v.publishedTimeText),
    description: snippet || text(v.descriptionSnippet),
    channel: {
      name: text(v.ownerText),
      url: path ? YT + path : null,
      verified: (v.ownerBadges || []).some((b) => /VERIFIED/i.test((b.metadataBadgeRenderer || {}).style || "")),
    },
    thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
  };
}

async function search(query) {
  const cfg = await getConfig();
  const res = await yt.post(
    `${YT}/youtubei/v1/search?key=${cfg.key}&prettyPrint=false`,
    {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: cfg.version,
          hl: "id",
          gl: "ID",
        },
      },
      query,
      params: "EgIQAQ==",
    },
    {
      headers: {
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": cfg.version,
      },
    }
  );
  const found = [];
  collect(res.data, found);
  const seen = new Set();
  const results = [];
  for (const v of found) {
    if (!v.videoId || seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    results.push(mapVideo(v));
  }
  if (!results.length) throw new Error("Hasil tidak ditemukan");
  return { query, total: results.length, results };
}

function extractVideoId(input) {
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function getKey(videoId) {
  const res = await cnv.get(`${CNV}/sanity/key?id=${videoId}`);
  return res.data.key;
}

async function convert(key, videoId, format, videoQuality, audioBitrate) {
  const res = await cnv.post(
    `${CNV}/converter`,
    new URLSearchParams({
      link: `https://youtu.be/${videoId}`,
      format,
      audioBitrate: String(audioBitrate),
      videoQuality: String(videoQuality),
      filenameStyle: "pretty",
      vCodec: "h264",
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "*/*",
        key,
      },
    }
  );
  return { url: (res.data && res.data.url) || null, filename: (res.data && res.data.filename) || null };
}

// Get video info including duration from YouTube innerTube player API
async function getVideoInfo(videoId) {
  try {
    const cfg = await getConfig();
    const res = await yt.post(
      `${YT}/youtubei/v1/player?key=${cfg.key}&prettyPrint=false`,
      {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: cfg.version,
            hl: "id",
            gl: "ID",
          },
        },
        videoId,
      },
      {
        headers: {
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": cfg.version,
        },
      }
    );
    const details = res.data.videoDetails || {};
    return {
      title: details.title || "Unknown",
      duration: details.lengthSeconds ? parseInt(details.lengthSeconds, 10) : null,
      viewCount: details.viewCount ? parseInt(details.viewCount, 10) : null,
    };
  } catch {
    return { title: "Unknown", duration: null, viewCount: null };
  }
}

// Upload ke uguu.se
async function uploadUguu(buffer, filename) {
  return new Promise((resolve, reject) => {
    const boundary = '----izz' + crypto.randomBytes(12).toString('hex');
    const isMp3 = filename.endsWith('.mp3');
    const head = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="files[]"; filename="' + filename.replace(/"/g, '') + '"\r\n' +
      'Content-Type: ' + (isMp3 ? 'audio/mpeg' : 'video/mp4') + '\r\n\r\n'
    );
    const tail = Buffer.from('\r\n--' + boundary + '--\r\n');
    const body = Buffer.concat([head, buffer, tail]);
    const r = https.request({
      hostname: 'uguu.se',
      path: '/upload.php',
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString());
          const url = j && j.files && j.files[0] && j.files[0].url;
          if (res.statusCode !== 200 || !url) return reject(new Error('Uguu gagal: ' + (j.description || j.message || j.error || 'HTTP ' + res.statusCode)));
          resolve(url);
        } catch (e) {
          reject(new Error('Uguu response parse error: ' + e.message));
        }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

// Download buffer from URL
async function downloadToBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : require('http');
    const req = mod.get(url, {
      headers: { 'User-Agent': UA, ...headers },
      timeout: 180000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadToBuffer(new URL(res.headers.location, url).href, headers));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} saat download`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout saat download')); });
    req.on('error', reject);
  });
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function downloadWithUpload(input, options = {}) {
  const { onlyMp3 = false, onlyMp4 = false } = options;
  
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error("Video ID tidak valid");

  // Get video info including duration
  const [videoInfo, key] = await Promise.all([getVideoInfo(videoId), getKey(videoId)]);
  const { title, duration, viewCount } = videoInfo;

  const mp4Qualities = [1080, 720, 360, 240, 144];
  const mp3Qualities = [320, 256, 128];

  let mp4Url = null, mp3Url = null;
  let mp4Size = 0, mp3Size = 0;
  let mp4Filename = null, mp3Filename = null;

  // Download & Upload MP4
  if (!onlyMp3) {
    console.error('→ Mencari format MP4...');
    const mp4Results = await Promise.all(
      mp4Qualities.map(async (q) => {
        const { url, filename } = await convert(key, videoId, "mp4", q, 128).catch(() => ({ url: null, filename: null }));
        return { quality: `${q}p`, format: "mp4", url, filename };
      })
    );
    
    // Pick first available (highest quality)
    const availableMp4 = mp4Results.find(r => r.url);
    if (availableMp4) {
      console.error(`→ Download MP4: ${availableMp4.quality}...`);
      const mp4Buffer = await downloadToBuffer(availableMp4.url, { Referer: FRAME + '/' });
      mp4Size = mp4Buffer.length;
      mp4Filename = `${(title || 'video').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.mp4`;

      console.error('→ Upload MP4 ke uguu.se...');
      mp4Url = await uploadUguu(mp4Buffer, mp4Filename);
    }
  }

  // Download & Upload MP3
  if (!onlyMp4) {
    console.error('→ Mencari format MP3...');
    const mp3Results = await Promise.all(
      mp3Qualities.map(async (q) => {
        const { url, filename } = await convert(key, videoId, "mp3", 720, q).catch(() => ({ url: null, filename: null }));
        return { quality: `${q}kbps`, format: "mp3", url, filename };
      })
    );
    
    // Pick first available (highest quality)
    const availableMp3 = mp3Results.find(r => r.url);
    if (availableMp3) {
      console.error(`→ Download MP3: ${availableMp3.quality}...`);
      const mp3Buffer = await downloadToBuffer(availableMp3.url, { Referer: FRAME + '/' });
      mp3Size = mp3Buffer.length;
      mp3Filename = `${(title || 'audio').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.mp3`;

      console.error('→ Upload MP3 ke uguu.se...');
      mp3Url = await uploadUguu(mp3Buffer, mp3Filename);
    }
  }

  return {
    ...META,
    videoId,
    title,
    duration, // in seconds
    durationText: duration ? formatDuration(duration) : null,
    viewCount,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    mp4: mp4Url ? {
      url: mp4Url,
      filename: mp4Filename,
      size: mp4Size,
      sizeText: formatSize(mp4Size)
    } : null,
    mp3: mp3Url ? {
      url: mp3Url,
      filename: mp3Filename,
      size: mp3Size,
      sizeText: formatSize(mp3Size)
    } : null
  };
}

async function run() {
  const [, , cmd, ...rest] = process.argv;
  const arg = rest.join(" ").trim();
  const name = String(cmd || "").toLowerCase();

  if (!["search", "s", "download", "dl", "d"].includes(name) || !arg) {
    console.log("Usage:");
    console.log("  node ytdl.js search <query>");
    console.log("  node ytdl.js download <url> [--mp3|--mp4]");
    console.log("  node ytdl.js dl <url> [--mp3|--mp4]");
    process.exit(1);
  }

  try {
    const onlyMp3 = process.argv.includes('--mp3');
    const onlyMp4 = process.argv.includes('--mp4');
    
    let data;
    if (["search", "s"].includes(name)) {
      data = await search(arg);
      // Add metadata to search results
      data = { ...META, ...data };
    } else {
      data = await downloadWithUpload(arg, { onlyMp3, onlyMp4 });
    }
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ ...META, ok: false, error: err.message }, null, 2));
    process.exit(1);
  }
}

run();

module.exports = { search, downloadWithUpload, uploadUguu };