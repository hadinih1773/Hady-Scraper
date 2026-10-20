const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const https = require('https');
const crypto = require('crypto');
const streamPipeline = promisify(pipeline);

// Cookie manager dengan auto refresh
class CookieManager {
  constructor() {
    this.cookie = '';
    this.lastRefresh = 0;
    this.refreshInterval = 5 * 60 * 1000; // 5 menit
  }

  async getCookie() {
    const now = Date.now();
    if (!this.cookie || (now - this.lastRefresh) > this.refreshInterval) {
      await this.refresh();
    }
    return this.cookie;
  }

  async refresh() {
    try {
      console.log('🔄 Refresh cookie...');
      const response = await axios.get('https://spotsaver.net', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
          'Accept': 'text/html'
        }
      });
      
      // Ambil cookie dari response headers
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        // Parse cookie string
        const cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        this.cookie = cookies;
        this.lastRefresh = Date.now();
        console.log('✅ Cookie updated');
        return this.cookie;
      }
      
      // Fallback ke cookie default jika gagal
      this.cookie = '__cf_bm=UAXrIUhlDpf75O02Q5js1bSmuDi9pG5b.n6ZkkKFuHc-1788997601.2172897-1.0.1.1-ieHbzgVTOZV1M4HPE47SHYF2DGvhSjTFjyJ.OG.OeMMmk77k_qMAlkoE2Hp3u8VAmf8hwus.0fmvt8giyVu8JyL3Q2BPKbzjSRfzq_MLbqN9Im3o1Veckj9M7Bulg.FR';
      this.lastRefresh = Date.now();
      return this.cookie;
      
    } catch (error) {
      console.log('⚠️ Gagal refresh cookie, pakai default');
      this.cookie = '__cf_bm=UAXrIUhlDpf75O02Q5js1bSmuDi9pG5b.n6ZkkKFuHc-1788997601.2172897-1.0.1.1-ieHbzgVTOZV1M4HPE47SHYF2DGvhSjTFjyJ.OG.OeMMmk77k_qMAlkoE2Hp3u8VAmf8hwus.0fmvt8giyVu8JyL3Q2BPKbzjSRfzq_MLbqN9Im3o1Veckj9M7Bulg.FR';
      this.lastRefresh = Date.now();
      return this.cookie;
    }
  }
}

const cookieManager = new CookieManager();

// Watermark info
const WM = {
  Creator: 'Hady'
};

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

// Upload ke uguu.se
async function uploadUguu(buffer, filename) {
  return new Promise((resolve, reject) => {
    const boundary = '----izz' + crypto.randomBytes(12).toString('hex');
    const head = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="files[]"; filename="' + filename.replace(/"/g, '') + '"\r\n' +
      'Content-Type: audio/mpeg\r\n\r\n'
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
        const j = json(Buffer.concat(chunks));
        const url = j && j.files && j.files[0] && j.files[0].url;
        if (res.statusCode !== 200 || !url) return reject(new Error('Uguu gagal: ' + (j.description || j.message || j.error || 'HTTP ' + res.statusCode)));
        resolve(url);
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

function json(buf) {
  const t = buf.toString();
  try { return JSON.parse(t); } catch (e) { return { error: 'Bukan JSON: ' + t.slice(0, 120) }; }
}

async function spotifyDl(query) {
  const cookie = await cookieManager.getCookie();
  
  const headers = {
    'User-Agent': UA,
    'Cookie': cookie,
    'Content-Type': 'application/json',
    'origin': 'https://spotsaver.net',
    'referer': 'https://spotsaver.net/results/',
    'Accept': 'application/json'
  };

  // Parse query - support "Judul - Artis"
  let title = query;
  let artist = '';

  if (query.includes(' - ')) {
    const parts = query.split(' - ');
    title = parts[0].trim();
    artist = parts.slice(1).join(' - ').trim();
  }

  // Jika tidak ada artist, cari dari search
  if (!artist) {
    console.log(`🔍 Mencari: ${title}`);
    
    // Refresh cookie lagi sebelum search
    const freshCookie = await cookieManager.getCookie();
    headers.Cookie = freshCookie;
    
    const search = await axios.get(`https://spotsaver.net/api/spotify/?q=${encodeURIComponent(title)}`, {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
    
    // Update cookie dari response
    if (search.headers['set-cookie']) {
      const newCookie = search.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      cookieManager.cookie = newCookie;
      cookieManager.lastRefresh = Date.now();
    }
    
    const items = search.data?.items || [];
    if (items.length) {
      for (const item of items) {
        if (item && item.name && item.name !== 'Unknown' && item.name !== 'undefined') {
          title = item.name;
          artist = item.artists?.map(a => a.name).join(', ') || 
                   item.artist || 
                   item.artist_name || 
                   'Unknown';
          break;
        }
      }
    }
  }

  if (!artist || artist === 'Unknown' || artist === 'undefined') {
    const lastDash = query.lastIndexOf(' - ');
    if (lastDash > 0) {
      title = query.substring(0, lastDash).trim();
      artist = query.substring(lastDash + 3).trim();
    }
  }

  // Validasi
  if (!title || title === 'undefined' || title === '') {
    title = 'Unknown';
  }
  if (!artist || artist === 'undefined' || artist === '') {
    artist = 'Unknown';
  }

  // Refresh cookie sebelum request
  const freshCookie = await cookieManager.getCookie();
  headers.Cookie = freshCookie;

  // Get video ID
  const id = await axios.post('https://spotsaver.net/api/get-id/', { title, artist }, { headers });
  
  // Update cookie
  if (id.headers['set-cookie']) {
    const newCookie = id.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    cookieManager.cookie = newCookie;
    cookieManager.lastRefresh = Date.now();
  }
  
  const videoId = id.data?.videoId;
  if (!videoId) throw new Error('Gagal dapat ID');

  // Refresh cookie lagi
  const freshCookie2 = await cookieManager.getCookie();
  headers.Cookie = freshCookie2;

  // Get download URL
  const fullTitle = `${title} - ${artist}`;
  const dl = await axios.post('https://spotsaver.net/api/download/', {
    videoId,
    candidateIds: [],
    format: 'mp3',
    title: fullTitle
  }, { headers });

  const url = dl.data?.downloadUrl;
  if (!url) throw new Error('Gagal dapat URL');

  // Download MP3
  const res = await axios({ 
    url, 
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA }
  });
  
  const buffer = Buffer.from(res.data);
  
  // Upload ke uguu.se
  const safeTitle = title.replace(/[^\w\s]/g, '').trim() || 'unknown';
  const safeArtist = artist.replace(/[^\w\s]/g, '').trim() || 'unknown';
  const filename = `${safeArtist} - ${safeTitle}.mp3`;
  
  console.log(`📤 Upload ke uguu.se...`);
  const downloadUrl = await uploadUguu(buffer, filename);
  
  // Return structured JSON response
  return {
    ...WM,
    title: title,
    artists: artist,
    album: '',
    release: '',
    duration_ms: 0,
    cover: '',
    spotify_url: '',
    filename: filename,
    size: buffer.length,
    download_url: downloadUrl
  };
}

// CLI
const query = process.argv.slice(2).join(' ') || 'Bahagia Lagi - Piche Kota';

(async () => {
  try {
    const result = await spotifyDl(query);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ...WM, ok: false, error: e.message }, null, 2));
    process.exit(1);
  }
})();