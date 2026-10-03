/**
 * Spotify downloader 
 * Creator: IzzXd
 * Base: https://musicfab.io
 * Saluran: https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K
 * Note: req scrape bawa url
 */
 
 const https = require('https');
const crypto = require('crypto');

const HOST = 'musicfab.io';
const WM = {
  Creator: 'IzzXd',
  Saluran: 'https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K'
};
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

const ERR = {
  unsupported_url: 'Link nggak didukung',
  no_audio_stream: 'Audio nggak ketemu',
  upstream_failed: 'API upstream error',
  upstream_timeout: 'Timeout dari upstream',
  upstream_unavailable: 'Server upstream down',
  too_many_requests: 'Kena rate limit',
  server_busy: 'Server sibuk',
  queue_timeout: 'Antrian timeout'
};

function request(opts, body, timeout) {
  return new Promise((resolve, reject) => {
    const r = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.setTimeout(timeout, () => r.destroy(new Error('Timeout')));
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function tryJson(buf) {
  try { return JSON.parse(buf.toString()); } catch (e) { return null; }
}

function absUrl(u) {
  if (!u || typeof u !== 'string') return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return 'https://' + HOST + u;
  return 'https://' + u;
}

function uploadUguu(buffer, filename) {
  return new Promise((resolve, reject) => {
    const boundary = '----izz' + crypto.randomBytes(12).toString('hex');
    const head = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="files[]"; filename="' + filename.replace(/"/g, '') + '"\r\n' +
      'Content-Type: audio/mpeg\r\n\r\n'
    );
    const tail = Buffer.from('\r\n--' + boundary + '--\r\n');
    const body = Buffer.concat([head, buffer, tail]);
    request({
      hostname: 'uguu.se',
      path: '/upload.php',
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      }
    }, body, 300000).then(res => {
      const j = tryJson(res.body) || {};
      const url = j.files && j.files[0] && j.files[0].url;
      if (res.status !== 200 || !url) return reject(new Error('Uguu gagal: ' + (j.description || j.message || 'HTTP ' + res.status)));
      resolve(url);
    }).catch(reject);
  });
}

function fmtDuration(d) {
  if (typeof d === 'string') return d;
  if (typeof d === 'number') {
    const m = Math.floor(d / 60000);
    const s = Math.floor((d % 60000) / 1000);
    return m + ':' + String(s).padStart(2, '0');
  }
  return '';
}

function fileNameFrom(headers, artist, title) {
  const cd = headers['content-disposition'] || '';
  const u = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const f = /filename="?([^";]+)"?/i.exec(cd);
  let n = (u && u[1]) || (f && f[1]) || '';
  try { n = decodeURIComponent(n); } catch (e) {}
  if (!n) n = (artist ? artist + ' - ' : '') + (title || 'track') + '.mp3';
  return n.replace(/[\\/:*?"<>|]/g, '_');
}

async function convert(input) {
  const payload = JSON.stringify({ url: input });
  const res = await request({
    hostname: HOST,
    path: '/api/spotify',
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Origin': 'https://' + HOST,
      'Referer': 'https://' + HOST + '/'
    }
  }, payload, 180000);

  const ct = String(res.headers['content-type'] || '').toLowerCase();
  const isBinary = res.status === 200 && (ct.startsWith('audio/') || ct.includes('octet-stream'));

  if (isBinary) {
    return { type: 'file', buffer: res.body, headers: res.headers, meta: {} };
  }

  const j = tryJson(res.body);
  if (!j) throw new Error('Response bukan JSON (HTTP ' + res.status + '): ' + res.body.toString().slice(0, 120));

  if (res.status >= 400 || j.error) {
    const e = typeof j.error === 'object' && j.error ? (j.error.code || j.error.message) : j.error;
    throw new Error(ERR[e] || String(e || 'HTTP ' + res.status));
  }

  const meta = (j.data && j.data.metadata) || j.metadata || null;
  if (!meta || !meta.name) throw new Error('Data lagu nggak ketemu');

  const dl = absUrl(meta.download || meta.downloadUrl || j.web_url || j.download_url || (j.data && (j.data.download || j.data.downloadUrl || j.data.url)) || '');
  if (!dl) throw new Error('Link download nggak ada di response');
  if (dl.includes('open.spotify.com')) throw new Error('Link download masih link Spotify');

  return { type: 'url', url: dl, meta };
}

const input = process.argv[2];

(async () => {
  try {
    if (!input) {
      console.log('Usage: node musicfab.js <spotify track url>');
      process.exit(1);
    }
    const r = await convert(input);
    const m = r.meta || {};
    const cover = m.image || m.cover || '';
    const info = {
      title: m.name || m.title || '',
      artist: m.artist || '',
      album: m.album || '',
      duration: fmtDuration(m.duration),
      cover: typeof cover === 'object' && cover ? (cover.url || '') : cover,
      spotify_url: input
    };

    if (r.type === 'file') {
      const name = fileNameFrom(r.headers, info.artist, info.title);
      const link = await uploadUguu(r.buffer, name);
      console.log(JSON.stringify({ ...WM, ...info, result: 'file', filename: name, size: r.buffer.length, download_url: link }, null, 2));
      return;
    }

    console.log(JSON.stringify({ ...WM, ...info, result: 'url', download_url: r.url }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ...WM, ok: false, error: e.message }, null, 2));
    process.exit(1);
  }
})();
