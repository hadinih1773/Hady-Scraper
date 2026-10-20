/**
 * Omo Downloader - JSON API with uguu.se upload
 * Creator: Hady
 * Base: https://www.omdown.site
 */

const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BASE_URL = 'https://www.omdown.site';
const META = { Creator: 'Hady' };

const jantung = {
  'User-Agent': UA,
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Ch-Ua': '"Chromium";v="124", "Not.A/Brand";v="8"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Origin': BASE_URL,
  'Referer': BASE_URL + '/id'
};

const jar = new Map();
const simpanCookie = (res) => (res.headers['set-cookie'] || []).forEach(c => {
  if (!c) return;
  const p = c.split(';')[0].split('=');
  jar.set(p[0].trim(), p.slice(1).join('=').trim());
});
const cookieStr = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');

const customHash = (str) => {
  let a = 0x811c9dc5, n = 0x9e3779b9, t = 0x7fffffff, o = 0x27d4eb2d;
  for (let i = 0; i < str.length; i++) {
    const r = str.charCodeAt(i);
    a = Math.imul(a ^ r, 0x01000193); n = Math.imul(n ^ (r >> 2), 0x85ebca6b);
    t = Math.imul(t ^ ((r << 3) & 255), 0xc2b2ae35); o = Math.imul(o ^ r, 0x165667b1);
  }
  const l = (x) => (x >>> 0).toString(16).padStart(8, '0');
  return l(a) + l(n) + l(t) + l(o) + l(a ^ t) + l(n ^ o) + l(a + n) + l(t + o);
};

const getPlatform = (u) => {
  const rules = [
    [/spotify\.com|spoti\.fi/i, 'Spotify'], [/instagram\.com|instagr\.am|ig\.me/i, 'Instagram'],
    [/tiktok\.com/i, 'TikTok'], [/youtube\.com|youtu\.be/i, 'YouTube'],
    [/facebook\.com|fb\.watch|fb\.com/i, 'Facebook'], [/twitter\.com|x\.com|t\.co/i, 'X'],
    [/pinterest\.|pin\.it/i, 'Pinterest'], [/soundcloud\.com/i, 'SoundCloud'],
    [/reddit\.com|redd\.it/i, 'Reddit'], [/threads\./i, 'Threads'],
    [/bilibili\.com|b23\.tv|bili\.im/i, 'Bilibili'], [/capcut\.com/i, 'CapCut'],
    [/twitch\.tv/i, 'Twitch'], [/snapchat\.com/i, 'Snapchat'],
    [/douyin\.com|iesdouyin\.com/i, 'Douyin'], [/kuaishou\.com|kwai\.com/i, 'Kuaishou'],
    [/xiaohongshu\.com|rednote\.com|xhslink\.com/i, 'RedNote'], [/bsky\.app|bsky\.social/i, 'Bluesky'],
    [/deviantart\.com/i, 'DeviantArt'], [/pixiv\.net/i, 'Pixiv'],
    [/mangadex\.org/i, 'MangaDex'], [/imgur\.com/i, 'Imgur'],
    [/dailymotion\.com|dai\.ly/i, 'Dailymotion'], [/lahelu\.com/i, 'Lahelu'],
    [/music\.apple\.com|apple\.co/i, 'Apple Music'], [/shortdrama\.tiktok\.com/i, 'PineDrama'],
    [/snackvideo\.com|sck\.io/i, 'SnackVideo']
  ];
  for (const [p, n] of rules) if (p.test(u)) return n;
  return 'Media';
};

function parseRSC(rawData) {
  let pos = 0;
  const refs = new Map();
  let actionResult = null;

  while (pos < rawData.length) {
    while (pos < rawData.length && (rawData[pos] === '\n' || rawData[pos] === '\r')) pos++;
    if (pos >= rawData.length) break;
    const cIdx = rawData.indexOf(':', pos);
    if (cIdx === -1) break;
    const id = rawData.slice(pos, cIdx);
    pos = cIdx + 1;
    const tag = rawData[pos];
    
    if (tag === 'T' || tag === 't') {
      pos++; const cmIdx = rawData.indexOf(',', pos); if (cmIdx === -1) break;
      const len = parseInt(rawData.slice(pos, cmIdx), 16); pos = cmIdx + 1;
      refs.set('$' + id, rawData.slice(pos, pos + len)); pos += len;
    } else if (tag === 'I' || tag === 'i') {
      const nNl = rawData.indexOf('\n', pos); pos = nNl === -1 ? rawData.length : nNl + 1;
    } else if (tag === '{' || tag === '[' || tag === '"') {
      const nNl = rawData.indexOf('\n', pos);
      const chunkStr = nNl === -1 ? rawData.slice(pos) : rawData.slice(pos, nNl);
      pos = nNl === -1 ? rawData.length : nNl + 1;
      try {
        const obj = JSON.parse(chunkStr); refs.set('$' + id, obj);
        if (id === '1' || id === '0') { if (obj && (obj.success !== undefined || obj.data)) actionResult = obj; }
      } catch (e) {}
    } else {
      const nNl = rawData.indexOf('\n', pos); pos = nNl === -1 ? rawData.length : nNl + 1;
    }
  }

  if (!actionResult) {
    const fbMatch = rawData.match(/\{"success":true,"data":\{.*\}\}/);
    if (fbMatch) { try { actionResult = JSON.parse(fbMatch[0]); } catch(e){} }
  }

  const resolve = (val) => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
      if (val === '$undefined') return undefined;
      if (refs.has(val)) return resolve(refs.get(val));
      if (val.startsWith('/api/media/stream')) return BASE_URL + val;
      return val;
    }
    if (Array.isArray(val)) return val.map(resolve).filter(v => v !== undefined);
    if (typeof val === 'object') {
      const out = {}; for (const [k, v] of Object.entries(val)) { const r = resolve(v); if (r !== undefined) out[k] = r; } return out;
    }
    return val;
  };

  return resolve(actionResult);
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

async function omoDownload(url, options = {}) {
  const { onlyMp3 = false, onlyMp4 = false } = options;
  
  if (!url) throw new Error('Link medianya mana?');

  console.error('→ Mengambil session...');
  
  // Step 1: Get homepage
  const getRes = await axios.get(BASE_URL + '/id', { 
    headers: { ...jantung, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1', 'Upgrade-Insecure-Requests': '1' }, 
    validateStatus: () => true 
  });
  simpanCookie(getRes);
  await new Promise(r => setTimeout(r, 1500));
  
  // Step 2: Get salt
  const saltRes = await axios.post(BASE_URL + '/id', JSON.stringify([{ trusted: true, clientTime: Date.now(), interactionType: 'resolve' }]), { 
    headers: { ...jantung, 'Accept': 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': '40010ff24080496480300f210c602eff421bbabc68', 'Cookie': cookieStr() }, 
    validateStatus: () => true 
  });
  simpanCookie(saltRes);
  await new Promise(r => setTimeout(r, 1500));
  
  const saltText = typeof saltRes.data === 'string' ? saltRes.data : JSON.stringify(saltRes.data);
  let dynamicSalt = null;
  
  for (const line of saltText.split('\n')) {
    const match = line.match(/^1:(.*)$/) || line.match(/"salt"\s*:\s*"([a-f0-9]+)"/);
    if (match) {
      try {
        const j = JSON.parse(match[1] || match[0]);
        if (j && j.salt) dynamicSalt = j.salt;
      } catch(e) {
        if (match[1] && (match[1].length === 64 || match[1].length === 32)) dynamicSalt = match[1];
      }
    }
  }
  
  if (!dynamicSalt) throw new Error('Gagal mencuri Session Salt RSC');
  
  // Step 3: Submit URL
  const t = Date.now();
  const p = getPlatform(url);
  const rawPayload = JSON.stringify({ u: url.trim(), p, l: 'id', t, n: Math.floor(1e9 * Math.random()).toString(36) });
  
  const keyHex = customHash(`${(23100 ^ t) >>> 0}:${dynamicSalt}:${t % 997}`);
  const keyBytes = [];
  for (let i = 0; i < keyHex.length; i += 2) keyBytes.push(parseInt(keyHex.slice(i, i + 2), 16));
  
  const pb = Buffer.from(rawPayload, 'utf-8');
  const xb = Buffer.alloc(pb.length);
  for (let i = 0; i < pb.length; i++) xb[i] = pb[i] ^ keyBytes[i % keyBytes.length];
  
  const d = xb.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const h = customHash(`${d}:${t}:${dynamicSalt}`);
  
  const finalRes = await axios.post(BASE_URL + '/id', JSON.stringify([{ data: d, t, h }, p, 'id']), { 
    headers: { ...jantung, 'Accept': 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': '702804ccc82147179e70c99569473492d22dd96950', 'Cookie': cookieStr() }, 
    validateStatus: () => true 
  });
  
  const rawData = typeof finalRes.data === 'string' ? finalRes.data : JSON.stringify(finalRes.data);
  const extractedData = parseRSC(rawData);
  
  if (!extractedData || extractedData.success === false) throw new Error('Gagal parse RSC atau ditolak server');
  
  const data = extractedData.data || extractedData;
  
  // Extract formats
  const formats = data.formats || [];
  const videoFormat = formats.find(f => f.kind === 'video' && !f.hasWatermark) || formats.find(f => f.kind === 'video');
  const audioFormat = formats.find(f => f.kind === 'audio') || formats.find(f => f.id === 'audio_video');
  const musicFormat = formats.find(f => f.id === 'audio_music');
  
  let mp4Url = null, mp3Url = null, musicUrl = null;
  let mp4Size = 0, mp3Size = 0, musicSize = 0;
  let mp4Filename = null, mp3Filename = null, musicFilename = null;
  
  // Download & Upload MP4 (video without watermark)
  if (!onlyMp3 && videoFormat && videoFormat.downloadUrl) {
    console.error('→ Download Video (tanpa watermark)...');
    const mp4Buffer = await downloadToBuffer(videoFormat.downloadUrl, { Referer: BASE_URL + '/' });
    mp4Size = mp4Buffer.length;
    mp4Filename = `${(data.title || 'video').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.mp4`;
    console.error('→ Upload MP4 ke uguu.se...');
    mp4Url = await uploadUguu(mp4Buffer, mp4Filename);
  }
  
  // Download & Upload MP3 (audio from video)
  if (!onlyMp4 && audioFormat && audioFormat.downloadUrl) {
    console.error('→ Download Audio dari Video (MP3)...');
    const mp3Buffer = await downloadToBuffer(audioFormat.downloadUrl, { Referer: BASE_URL + '/' });
    mp3Size = mp3Buffer.length;
    mp3Filename = `${(data.title || 'audio').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.mp3`;
    console.error('→ Upload MP3 ke uguu.se...');
    mp3Url = await uploadUguu(mp3Buffer, mp3Filename);
  }
  
  // Download & Upload Music (original sound)
  if (!onlyMp4 && musicFormat && musicFormat.downloadUrl) {
    console.error('→ Download Sound Musik (MP3)...');
    const musicBuffer = await downloadToBuffer(musicFormat.downloadUrl, { Referer: BASE_URL + '/' });
    musicSize = musicBuffer.length;
    musicFilename = `${(data.music?.title || 'music').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.mp3`;
    console.error('→ Upload Music ke uguu.se...');
    musicUrl = await uploadUguu(musicBuffer, musicFilename);
  }
  
  return {
    ...META,
    status: true,
    platform: data.platform,
    title: data.title,
    duration: data.durationLabel,
    durationSec: data.music?.duration || null,
    thumbnail: data.thumbnailUrl,
    preview: data.previewUrl,
    author: data.author,
    authorAvatar: data.authorAvatar,
    stats: data.stats,
    music: data.music ? {
      title: data.music.title,
      author: data.music.author,
      duration: data.music.duration
    } : null,
    mp4: mp4Url ? {
      url: mp4Url,
      filename: mp4Filename,
      size: mp4Size,
      sizeText: formatSize(mp4Size),
      quality: videoFormat?.quality || 'Original / HD'
    } : null,
    mp3: mp3Url ? {
      url: mp3Url,
      filename: mp3Filename,
      size: mp3Size,
      sizeText: formatSize(mp3Size),
      quality: audioFormat?.quality || '320 kbps',
      source: 'video'
    } : null,
    music: musicUrl ? {
      url: musicUrl,
      filename: musicFilename,
      size: musicSize,
      sizeText: formatSize(musicSize),
      quality: musicFormat?.quality || '320 kbps',
      source: 'original_sound'
    } : null
  };
}

// CLI
(async () => {
  const args = process.argv.slice(2);
  const url = args[0];
  const onlyMp3 = args.includes('--mp3');
  const onlyMp4 = args.includes('--mp4');
  const help = args.includes('-h') || args.includes('--help');

  if (!url || help) {
    console.log(`Usage: node omo.js <url> [options]`);
    console.log(`Options:`);
    console.log(`  --mp3       Download MP3 only (audio from video + music)`);
    console.log(`  --mp4       Download MP4 only (video without watermark)`);
    console.log(`  -h, --help  Show this help`);
    console.log(`\nSupported platforms: TikTok, Instagram, YouTube, Facebook, X/Twitter, Spotify, SoundCloud, Pinterest, Reddit, Threads, Bilibili, CapCut, Twitch, Snapchat, Douyin, Kuaishou, RedNote, Bluesky, DeviantArt, Pixiv, MangaDex, Imgur, Dailymotion, Lahelu, Apple Music, SnackVideo`);
    process.exit(help ? 0 : 1);
  }

  try {
    const result = await omoDownload(url, { onlyMp3, onlyMp4 });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ...META, status: false, error: e.message }, null, 2));
    process.exit(1);
  }
})();

module.exports = { omoDownload, uploadUguu };