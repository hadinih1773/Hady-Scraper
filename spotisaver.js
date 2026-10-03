/**
 * spoti down
 * Creator: IzzXd
 * Base: https://spotisaver.net/en
 * Saluran: https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K
 * Note: req scrape bawa url
 */
 
 const https = require('https');

const HOST = 'spotisaver.net';
const LANG = 'en';
const WM = {
  Creator: 'IzzXd',
  Saluran: 'https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K'
};
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

const jar = new Map();
const st = { token: '', wire: null, ip: '' };

function raw(method, p, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const h = {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://' + HOST + '/' + LANG + '/',
      'Origin': 'https://' + HOST,
      ...headers
    };
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => k + '=' + v).join('; ');
    if (payload) {
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = Buffer.byteLength(payload);
    }
    const r = https.request({ hostname: HOST, path: p, method, headers: h }, res => {
      for (const c of res.headers['set-cookie'] || []) {
        const pair = c.split(';')[0];
        const i = pair.indexOf('=');
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function json(buf) {
  const t = buf.toString();
  try { return JSON.parse(t); } catch (e) { return { error: 'Bukan JSON: ' + t.slice(0, 120) }; }
}

async function init() {
  const res = await raw('GET', '/' + LANG + '/', { Accept: 'text/html' }, null);
  const html = res.body.toString();
  const t = html.match(/requestToken:\s*"([a-f0-9]+)"/);
  const w = html.match(/wire:\s*(\{[^\n]*\})\}\s*;/);
  const ip = html.match(/const user_ip\s*=\s*"([^"]*)"/);
  if (!t || !w) throw new Error('Token/wire nggak ketemu (HTTP ' + res.status + '), kemungkinan kena proteksi Cloudflare');
  st.token = t[1];
  st.wire = JSON.parse(w[1]);
  st.ip = ip ? ip[1] : '';
}

function enc(ctx) {
  return Buffer.from(JSON.stringify(ctx)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(action, ctx, retry = true) {
  const w = st.wire;
  const q = new URLSearchParams();
  q.set(w.token_param, st.token);
  q.set(w.action_param, w.actions[action]);
  q.set(w.ctx_param, enc(ctx));
  const res = await raw('GET', '/api/get_signature.php?' + q, { Accept: 'application/json' }, null);
  const j = json(res.body);
  if (!j.success || !j.token || !j.exp) {
    if (retry && res.status === 403 && j.error === 'signature_rejected') {
      const r = await raw('GET', '/api/get_request_token.php', { Accept: 'application/json' }, null);
      const t = json(r.body);
      if (!t.success || !t.request_token) throw new Error('Gagal refresh token');
      st.token = t.request_token;
      return sign(action, ctx, false);
    }
    throw new Error('Signature gagal: ' + (j.error || 'HTTP ' + res.status));
  }
  return { [w.sig_header]: String(j.token), [w.exp_header]: String(j.exp) };
}

function parse(input) {
  let m = input.match(/spotify\.com\/(?:intl-[a-z]+\/)?(playlist|track|album|artist|show|episode)\/([a-zA-Z0-9]+)/);
  if (m) return { type: m[1], id: m[2] };
  m = input.match(/^spotify:(playlist|track|album|artist|show|episode):([a-zA-Z0-9]{22})$/i);
  if (m) return { type: m[1].toLowerCase(), id: m[2] };
  if (/^[a-zA-Z0-9]{22}$/.test(input)) return { type: 'track', id: input };
  return null;
}

async function getInfo(input) {
  const sp = parse(input);
  const q = sp
    ? 'id=' + encodeURIComponent(sp.id) + '&type=' + sp.type + '&lang=' + LANG
    : 'url=' + encodeURIComponent(input) + '&lang=' + LANG;
  const sig = await sign('get_playlist', sp ? { id: sp.id, type: sp.type, lang: LANG } : { url: input, lang: LANG });
  const res = await raw('GET', '/api/get_playlist.php?' + q, { Accept: 'application/json', ...sig }, null);
  const j = json(res.body);
  if (j.error) throw new Error(j.error);
  return j;
}

async function download(track) {
  const ctx = { lang: LANG };
  if (track.id) ctx.id = String(track.id).trim();
  if (track.name) ctx.name = String(track.name).trim();
  if (Number.isFinite(Number(track.duration_ms))) ctx.duration_ms = String(Math.trunc(Number(track.duration_ms)));
  const sig = await sign('download_track', ctx);
  const res = await raw('POST', '/api/download_track.php', { Accept: '*/*', ...sig }, {
    track,
    download_dir: 'downloads',
    filename_tag: 'SPOTISAVER',
    user_ip: st.ip,
    is_premium: false,
    lang: LANG
  });
  const ct = String(res.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json') || res.status >= 400) {
    const j = json(res.body);
    throw new Error(j.error || j.message || 'HTTP ' + res.status);
  }
  const cd = res.headers['content-disposition'] || '';
  const u = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const f = /filename="?([^";]+)"?/i.exec(cd);
  let name = (u && u[1]) || (f && f[1]) || '';
  try { name = decodeURIComponent(name); } catch (e) {}
  if (!name) name = [].concat(track.artists || []).join(', ') + ' - ' + track.name + '.mp3';
  name = name.replace(/[\\/:*?"<>|]/g, '_');
  return { buffer: res.body, filename: name };
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

const crypto = require('crypto');
const input = process.argv[2];

(async () => {
  try {
    if (!input) {
      console.log('Usage: node spotisaver.js <spotify track url>');
      process.exit(1);
    }
    await init();
    const data = await getInfo(input);
    const info = data.playlist_info || {};
    const track = (data.tracks || [])[0];
    if (!track) throw new Error('Track nggak ketemu');
    const dl = await download(track);
    const link = await uploadUguu(dl.buffer, dl.filename);
    console.log(JSON.stringify({
      ...WM,
      title: track.name || '',
      artists: [].concat(track.artists || []).join(', '),
      album: info.name || '',
      release: info.release_date || '',
      duration_ms: track.duration_ms || 0,
      cover: track.image || track.thumb_image || (info.images && info.images[0] ? info.images[0].url : ''),
      spotify_url: track.external_url || info.external_url || '',
      filename: dl.filename,
      size: dl.buffer.length,
      download_url: link
    }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ...WM, ok: false, error: e.message }, null, 2));
    process.exit(1);
  }
})();
