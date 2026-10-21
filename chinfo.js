#!/usr/bin/env node
/**
 * chinfo.js — WhatsApp Channel Info Scraper
 *
 * Pemakaian:
 *   node chinfo.js <url>
 *
 * Contoh:
 *   node chinfo.js https://whatsapp.com/channel/0029Vb6TwQ84tRrw2345Ut1z
 */

const axios = require('axios');
const cheerio = require('cheerio');

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
function extractChannelCode(url) {
  try {
    const match = url.match(/whatsapp\.com\/channel\/([A-Za-z0-9]{20,24})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isValidWhatsAppChannelUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'whatsapp.com' && u.pathname.startsWith('/channel/');
  } catch {
    return false;
  }
}

function formatNumber(num) {
  if (!num) return '0';
  const n = parseInt(num);
  if (isNaN(n)) return num.toString();
  return n.toLocaleString('id-ID');
}

function formatDate(timestamp) {
  if (!timestamp) return 'Tidak diketahui';
  try {
    return new Date(timestamp * 1000).toLocaleString('id-ID');
  } catch {
    return 'Tidak diketahui';
  }
}

/* =========================================================
 *  MAIN SCRAPER
 * ========================================================= */
async function getChannelInfo(url) {
  const channelCode = extractChannelCode(url);
  if (!channelCode) {
    throw new Error('Kode channel tidak ditemukan dalam URL');
  }

  // Try multiple approaches to get channel info
  let html = null;

  // Approach 1: Direct channel page
  const channelUrl = `https://whatsapp.com/channel/${channelCode}`;
  try {
    const res = await client.get(channelUrl);
    if (res.status === 200 && typeof res.data === 'string' && res.data.length > 1000) {
      html = res.data;
    }
  } catch {}

  // Approach 2: Meta tags from invite page
  if (!html) {
    const inviteUrl = `https://whatsapp.com/channel/${channelCode}?mode=invite`;
    try {
      const res = await client.get(inviteUrl);
      if (res.status === 200 && typeof res.data === 'string' && res.data.length > 1000) {
        html = res.data;
      }
    } catch {}
  }

  // Approach 3: Embed page
  if (!html) {
    const embedUrl = `https://whatsapp.com/channel/${channelCode}?mode=embed`;
    try {
      const res = await client.get(embedUrl);
      if (res.status === 200 && typeof res.data === 'string' && res.data.length > 1000) {
        html = res.data;
      }
    } catch {}
  }

  if (!html) {
    throw new Error('Gagal mengambil halaman channel (mungkin private atau tidak ada)');
  }

  const $ = cheerio.load(html);

  // Extract from meta tags
  const title = $('meta[property="og:title"]').attr('content')?.trim() ||
                $('meta[name="twitter:title"]').attr('content')?.trim() ||
                $('title').text().trim() ||
                'Unknown Channel';

  const description = $('meta[property="og:description"]').attr('content')?.trim() ||
                      $('meta[name="twitter:description"]').attr('content')?.trim() ||
                      $('meta[name="description"]').attr('content')?.trim() ||
                      'Tidak ada deskripsi';

  const image = $('meta[property="og:image"]').attr('content')?.trim() ||
                $('meta[name="twitter:image"]').attr('content')?.trim() ||
                null;

  const urlCanonical = $('meta[property="og:url"]').attr('content')?.trim() ||
                       $('link[rel="canonical"]').attr('href')?.trim() ||
                       channelUrl;

  // Try to extract from JSON-LD or embedded data
  let channelId = channelCode;
  let subscribersCount = '0';
  let creationTime = null;
  let channelState = 'UNKNOWN';

  // Look for embedded JSON data
  const scripts = $('script[type="application/ld+json"], script[data-testid], script:contains("newsletter"), script:contains("channel")');
  scripts.each((_, el) => {
    const content = $(el).html() || '';
    // Try to find channel metadata in script
    const idMatch = content.match(/"id"\s*:\s*"([^"]+)"/);
    if (idMatch && idMatch[1].includes('@newsletter')) {
      channelId = idMatch[1];
    }
    const subMatch = content.match(/"subscribers[_\s]?count"\s*:\s*(\d+)/i);
    if (subMatch) {
      subscribersCount = subMatch[1];
    }
    const createMatch = content.match(/"creation[_\s]?time"\s*:\s*(\d+)/i);
    if (createMatch) {
      creationTime = parseInt(createMatch[1]);
    }
    const stateMatch = content.match(/"state"\s*:\s*"([^"]+)"/i);
    if (stateMatch) {
      channelState = stateMatch[1];
    }
  });

  // Also check for meta tags with subscriber count
  const metaSubscribers = $('meta[property="og:subscribers"], meta[name="subscribers"], meta[property="channel:subscribers"]').attr('content');
  if (metaSubscribers) {
    subscribersCount = metaSubscribers;
  }

  // Try to get from page text
  const pageText = $('body').text();
  const subTextMatch = pageText.match(/(\d[\d.,]*)\s*(subscriber|pengikut|follower)/i);
  if (subTextMatch) {
    subscribersCount = subTextMatch[1].replace(/[.,]/g, '');
  }

  return {
    channelCode,
    channelId,
    channelName: title,
    description,
    image,
    url: urlCanonical,
    subscribersCount: formatNumber(subscribersCount),
    subscribersRaw: subscribersCount,
    creationTime,
    createdAt: formatDate(creationTime),
    state: channelState
  };
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
      error: 'Pemakaian: node chinfo.js <url_whatsapp_channel>',
      data: []
    });
    process.exit(1);
  }

  if (!isValidWhatsAppChannelUrl(url)) {
    emit({
      status: false,
      creator: CREATOR,
      error: 'URL tidak valid. Format: https://whatsapp.com/channel/KODE',
      data: []
    });
    process.exit(1);
  }

  try {
    const result = await getChannelInfo(url);

    emit({
      status: true,
      creator: CREATOR,
      result: result
    });
    process.exit(0);
  } catch (e) {
    emit({
      status: false,
      creator: CREATOR,
      error: e.message,
      data: []
    });
    process.exit(1);
  }
})();