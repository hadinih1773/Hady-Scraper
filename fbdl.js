#!/usr/bin/env node
/**
 * fbdl.js — Facebook Video Downloader
 *
 * Pemakaian:
 *   node fbdl.js <url>
 *
 * Contoh:
 *   node fbdl.js https://www.facebook.com/watch?v=123456789
 *   node fbdl.js https://fb.watch/abcdef123/
 *   node fbdl.js https://www.facebook.com/reel/123456789
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

/* =========================================================
 *  KONFIG
 * ========================================================= */
const CREATOR = 'Hady';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TIMEOUT = 30000;

const client = axios.create({
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id,en;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    DNT: '1',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  },
  timeout: TIMEOUT,
  maxRedirects: 10,
  validateStatus: () => true
});

/* =========================================================
 *  UTIL
 * ========================================================= */
function normalizeUrl(input) {
  try {
    const u = new URL(input);
    u.searchParams.delete('fbclid');
    u.searchParams.delete('ref');
    u.searchParams.delete('__tn__');
    u.searchParams.delete('__cft__');
    u.hash = '';
    return u.href;
  } catch {
    return input;
  }
}

function isFacebookUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === 'facebook.com' ||
      hostname === 'www.facebook.com' ||
      hostname === 'm.facebook.com' ||
      hostname === 'mbasic.facebook.com' ||
      hostname === 'fb.watch' ||
      hostname === 'www.fb.watch' ||
      hostname === 'm.fb.watch'
    );
  } catch {
    return false;
  }
}

function extractVideoUrls(html) {
  const urls = { sd: null, hd: null };
  const patterns = [
    /"playable_url(?:_quality_hd)?"\s*:\s*"([^"]+)"/g,
    /"browser_native_(?:sd|hd)_url"\s*:\s*"([^"]+)"/g,
    /"playable_url"\s*:\s*"([^"]+)"/g,
    /"video_redirect_url"\s*:\s*"([^"]+)"/g,
    /src:"([^"]*?\.mp4[^"]*)"/g,
    /"src":"([^"]*?\.mp4[^"]*)"/g,
    /data-sigil="video"[^>]*data-store="\{[^"]*"src":"([^"]+)"/g,
    /<video[^>]+src="([^"]+)"/g,
    /<source[^>]+src="([^"]+)"/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      if (url.includes('.mp4') || url.includes('video') || url.includes('blob:')) {
        if (url.includes('hd') || url.includes('720') || url.includes('1080')) {
          if (!urls.hd) urls.hd = url;
        } else {
          if (!urls.sd) urls.sd = url;
        }
      }
    }
  }

  const hdMatch = html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/);
  if (hdMatch) {
    urls.hd = hdMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
  }

  const sdMatch = html.match(/"playable_url"\s*:\s*"([^"]+)"/);
  if (sdMatch && !urls.hd) {
    urls.sd = sdMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
  }

  return urls;
}

async function tryMobileVersion(url) {
  const mobileUrl = url.replace(/^(https?:\/\/)(www\.)?facebook\.com/, '$1m.facebook.com');
  try {
    const res = await client.get(mobileUrl);
    if (res.status === 200 && typeof res.data === 'string') {
      return res.data;
    }
  } catch {}
  return null;
}

async function tryMbasicVersion(url) {
  const mbasicUrl = url.replace(/^(https?:\/\/)(www\.)?facebook\.com/, '$1mbasic.facebook.com');
  try {
    const res = await client.get(mbasicUrl);
    if (res.status === 200 && typeof res.data === 'string') {
      return res.data;
    }
  } catch {}
  return null;
}

async function tryFbWatchRedirect(url) {
  if (!url.includes('fb.watch')) return null;
  try {
    const res = await client.get(url, { maxRedirects: 5 });
    if (res.request?.res?.responseUrl) {
      return await tryMobileVersion(res.request.res.responseUrl);
    }
    return res.data;
  } catch {}
  return null;
}

function extractTitle(html) {
  const $ = cheerio.load(html);
  return (
    $('title').text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    'Facebook Video'
  );
}

function extractThumbnail(html) {
  const $ = cheerio.load(html);
  return (
    $('meta[property="og:image"]').attr('content')?.trim() ||
    $('meta[name="twitter:image"]').attr('content')?.trim() ||
    $('meta[property="og:video:thumbnail"]').attr('content')?.trim() ||
    null
  );
}

/* =========================================================
 *  MAIN DOWNLOAD FUNCTION
 * ========================================================= */
async function downloadFacebookVideo(url) {
  const normalizedUrl = normalizeUrl(url);

  if (!isFacebookUrl(normalizedUrl)) {
    throw new Error('URL bukan Facebook yang valid');
  }

  let html = null;
  let source = 'www';

  // Try fb.watch redirect first
  if (normalizedUrl.includes('fb.watch')) {
    html = await tryFbWatchRedirect(normalizedUrl);
    if (html) source = 'fb.watch';
  }

  // Try desktop version
  if (!html) {
    try {
      const res = await client.get(normalizedUrl);
      if (res.status === 200 && typeof res.data === 'string' && res.data.length > 1000) {
        html = res.data;
        source = 'desktop';
      }
    } catch {}
  }

  // Try mobile version
  if (!html) {
    html = await tryMobileVersion(normalizedUrl);
    if (html) source = 'mobile';
  }

  // Try mbasic version
  if (!html) {
    html = await tryMbasicVersion(normalizedUrl);
    if (html) source = 'mbasic';
  }

  if (!html) {
    throw new Error('Gagal mengambil halaman Facebook (mungkin butuh login atau video private)');
  }

  const videoUrls = extractVideoUrls(html);
  const title = extractTitle(html);
  const thumbnail = extractThumbnail(html);

  const result = {
    title,
    thumbnail,
    source,
    urls: {}
  };

  if (videoUrls.hd) result.urls.hd = videoUrls.hd;
  if (videoUrls.sd) result.urls.sd = videoUrls.sd;

  if (!videoUrls.hd && !videoUrls.sd) {
    // Try to find any video-like URLs in the HTML
    const $ = cheerio.load(html);
    const videoElements = $('video source, video, [data-sigil="video"]');
    videoElements.each((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('data-src');
      if (src && (src.includes('.mp4') || src.includes('video'))) {
        if (!result.urls.sd) result.urls.sd = src;
      }
    });
  }

  if (!result.urls.hd && !result.urls.sd) {
    result.error = 'Tidak ditemukan URL video. Video mungkin private, dihapus, atau butuh login.';
  }

  return result;
}

/* =========================================================
 *  EMIT
 * ========================================================= */
function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

/* =========================================================
 *  MAIN
 * ========================================================= */
(async () => {
  const url = process.argv[2];

  if (!url) {
    emit({
      status: false,
      creator: CREATOR,
      error: 'Pemakaian: node fbdl.js <url_facebook>',
      data: []
    });
    process.exit(1);
  }

  try {
    const result = await downloadFacebookVideo(url);

    if (result.error) {
      emit({
        status: false,
        creator: CREATOR,
        error: result.error,
        data: []
      });
      process.exit(1);
    }

    emit({
      status: true,
      creator: CREATOR,
      result: result
    });
  } catch (e) {
    emit({
      status: false,
      creator: CREATOR,
      error: e.message,
      data: []
    });
    process.exit(2);
  }
})();