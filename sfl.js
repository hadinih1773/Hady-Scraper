'use strict';

/**
 * SFL Bypass (puppeteer)
 * Bypass shortlink sfl.gl / linku.to / khaddavi (safelink) lalu ambil link akhirnya.
 *
 * Penggunaan:
 *   node sfl.js https://sfl.gl/vLoY
 *   node sfl.js https://linku.to/xxxxx
 *
 * Output: JSON metadata ke stdout (log progres ke stderr).
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Domain gate shortener: harus dilewati, belum link final
const GATE_HOSTS = [
  'sfl.gl',
  'linku.to',
  'safelinku.com',
  'safelinku.net',
  'safelinku.id',
];

// Domain intermediate milik jaringan safelink (bukan gate, tapi masih rantai)
const CHAIN_HOSTS = ['khaddavi.net', 'comun.id'];

// File host / link download yang dicari sebagai tujuan akhir
const FILE_HOSTS = [
  'mediafire.com', 'mega.nz', 'mega.io', 'drive.google.com', 'docs.google.com/uc',
  'dropbox.com', 'terabox', 'pixeldrain.com', 'gofile.io', 'anonfiles.com',
  'krakenfiles.com', 'zippyshare.com', 'uptobox.com', '1fichier.com',
  'rapidgator.net', 'nitroflare.com', 'filefactory.com', 'tusfiles.com',
  'dailyuploads.net', 'userscloud.com', 'uploads.to', 'sendspace.com',
  'solidfiles.com', 'mirrorcreator.com', 'mirrorace.com', 'workupload.com',
  'katfile.com', 'hexupload.net', 'modsbase.com', 'douploads.net',
  '4shared.com', 'file-upload.com', 'uploadev.org', 'downloader.la',
];

const MAX_GATE_HOPS = 4;

// Domain iklan/tracker -> jangan dianggap link final walau kebuka di popup/tab
const AD_HOSTS = [
  'googlesyndication.com', 'doubleclick.net', 'googleadservices.com',
  'googletagmanager.com', 'google-analytics.com', 'analytics.google.com',
  'adtrafficquality.google', 'adservice.google.com', 'tpc.googlesyndication.com',
  'propellerads', 'popads', 'popcash', 'adsterra', 'hilltopads',
  'mgid.com', 'revcontent', 'outbrain.com', 'taboola.com', 'exoclick',
  'juicyads', 'clickaine', 'zeropark', 'onclckds', 'onclickalgo',
  'monetag', 'adcash', 'galaksion', 'richads', 'bidvertiser',
  'cloudflareinsights.com', 'recaptcha.net', 'gstatic.com', 'g.doubleclick.net',
  'clarity.ms', 'hotjar.com', 'facebook.net', 'connect.facebook.net',
];

const CONTINUE_PATTERNS = [
  'get link', 'getlink', 'continue', 'proceed', 'verif', 'klik di sini',
  'click here', 'lanjut', 'buka link', 'buka situs', 'open link',
  'open site', 'generate link', 'download now', 'link akhir',
  'final link', 'menuju', 'confirm', 'skip ad', 'skip this ad',
];

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

const IDLE_TIMEOUT_MS = 30000;  // maks nunggu UI gate yang belum muncul
const TOTAL_TIMEOUT_MS = 90000; // deadline total
const STEP_DELAY_MS = 1000;

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function matchHost(hostname, list) {
  return list.some((d) => hostname === d || hostname.endsWith('.' + d));
}

function isGate(u) {
  return matchHost(hostOf(u), GATE_HOSTS);
}

function isChainHost(u) {
  return matchHost(hostOf(u), CHAIN_HOSTS);
}

function isFileHost(u) {
  return FILE_HOSTS.some((d) => u.toLowerCase().includes(d));
}

function isAd(u) {
  return matchHost(hostOf(u), AD_HOSTS);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function logStep(msg) {
  if (process.stderr.isTTY || process.env.SFL_DEBUG) {
    console.error(`[sfl] ${msg}`);
  }
}

/**
 * Kandidat executable Chrome/Chromium:
 * 1. chromium dari cache playwright (dependensinya tervalidasi installer)
 * 2. chrome/chromium sistem
 * 3. build chrome dari cache puppeteer
 */
function* chromeCandidates() {
  const pwRoot = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (exists(pwRoot)) {
    try {
      const dirs = fs
        .readdirSync(pwRoot)
        .filter((d) => /^chromium(-\d+)?$/.test(d))
        .sort()
        .reverse();
      for (const d of dirs) {
        for (const sub of ['chrome-linux-arm64', 'chrome-linux64', 'chrome-linux']) {
          const bin = path.join(pwRoot, d, sub, 'chrome');
          if (exists(bin)) yield bin;
        }
      }
    } catch {}
  }

  for (const c of [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) {
    if (exists(c)) yield c;
  }

  const ppRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (exists(ppRoot)) {
    try {
      const builds = fs
        .readdirSync(ppRoot)
        .map((d) => path.join(ppRoot, d))
        .filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } })
        .sort()
        .reverse();
      for (const b of builds) {
        for (const sub of ['chrome-linux64', 'chrome-linux-arm64', 'chrome-linux']) {
          const bin = path.join(b, sub, 'chrome');
          if (exists(bin)) yield bin;
        }
      }
    } catch {}
  }
}

/**
 * Launch puppeteer dengan fallback: build default puppeteer dulu,
 * lalu semua kandidat executable. Tiap kandidat diuji bisa buka halaman.
 */
async function launchBrowser() {
  const errors = [];
  const attempts = [undefined, ...chromeCandidates()];

  for (const executablePath of attempts) {
    let browser = null;
    try {
      browser = await puppeteer.launch({ headless: true, executablePath, args: LAUNCH_ARGS });
      const p = await browser.newPage();
      await p.evaluate(() => 1 + 1); // sanity check renderer
      await p.close().catch(() => {});
      logStep(`browser: ${executablePath || 'puppeteer-default'}`);
      return browser;
    } catch (e) {
      errors.push(`${executablePath || 'puppeteer-default'}: ${String(e.message).split('\n')[0]}`);
      if (browser) await browser.close().catch(() => {});
    }
  }

  throw new Error(
    'Tidak ada Chrome/Chromium yang bisa dipakai. Coba: npx puppeteer browsers install chrome\n' +
      errors.join('\n')
  );
}

async function extractMetadata(page) {
  const meta = await page
    .evaluate(() => {
      const pick = (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          const val = el && (el.getAttribute('content') || el.getAttribute('href') || el.textContent);
          if (val && val.trim()) return val.trim();
        }
        return '';
      };
      return {
        title:
          pick(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
          document.title ||
          '',
        description:
          pick([
            'meta[property="og:description"]',
            'meta[name="description"]',
            'meta[name="twitter:description"]',
          ]),
        image: pick(['meta[property="og:image"]', 'meta[name="twitter:image"]', 'link[rel="image_src"]']),
        site_name: pick(['meta[property="og:site_name"]']),
        og_url: pick(['meta[property="og:url"]', 'link[rel="canonical"]']),
      };
    })
    .catch(() => ({}));

  if (!meta.title) {
    meta.title = await page.title().catch(() => '');
  }
  return meta;
}

/**
 * Deteksi elemen countdown/timer di halaman gate.
 */
async function detectCountdown(page) {
  return page
    .evaluate(() => {
      // selector umum countdown safelink
      const sel = '[class*="countdown"],[id*="countdown"],[class*="timer"],[id*="timer"],[class*="clock"],[data-time],[data-timer]';
      if (document.querySelector(sel)) return true;

      // teks pendek berisi hitungan detik / kata tunggu
      const rx = /\b\d{1,3}\s*(detik|sec|seconds?|s)\b|(please\s*wait|mohon\s*tunggu|tunggu|waiting)/i;
      const els = document.querySelectorAll('span,div,p,h1,h2,h3,h4,button,a,label');
      for (const el of els) {
        if (el.childElementCount > 2) continue;
        const t = (el.textContent || '').trim().toLowerCase();
        if (t.length > 0 && t.length < 80 && rx.test(t)) return true;
      }
      return false;
    })
    .catch(() => false);
}

/**
 * Cari & klik kandidat tombol "lanjut / get link" di halaman.
 * Return descriptor kandidat yang diklik, atau null.
 */
async function clickContinue(page, clickedSigs) {
  const clicked = await page
    .evaluate((patterns) => {
      const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

      const scored = [];
      const els = document.querySelectorAll(
        'a[href], button, [role="button"], input[type="submit"], input[type="button"], .btn, a.btn'
      );

      for (const el of els) {
        if (el.offsetParent === null && getComputedStyle(el).visibility === 'hidden') continue;

        const text = norm(el.innerText || el.value || el.getAttribute('aria-label') || '');
        const href = el.tagName === 'A' ? el.href || '' : '';
        let score = 0;

        // anchor dalam halaman & link js bukan link lanjut
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
          if (el.tagName === 'A' && !el.onclick) continue;
        }
        // buang link aksesibilitas "skip to content" dll
        if (/^skip to\b/.test(text)) continue;

        for (const p of patterns) {
          if (text.includes(p)) {
            score += 10;
            break;
          }
        }
        if (/^(get\s*link|continue|verif|lanjut|klik di sini|buka link)/.test(text)) score += 15;
        if (el.className && /btn|button/.test(String(el.className))) score += 3;
        if (el.id && /btn|continue|verif|download/.test(el.id)) score += 5;
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) score += 6;

        if (score >= 10) scored.push({ score, el, text, href });
      }

      if (!scored.length) return null;
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];

      const sig = (best.href || '') + '|' + best.text;
      if (best.el.dataset.__sflClicked === '1') return { sig, already: true };

      best.el.dataset.__sflClicked = '1';
      best.el.click();
      return { sig, text: best.text, href: best.href, tag: best.el.tagName };
    }, CONTINUE_PATTERNS)
    .catch(() => null);

  if (!clicked || clicked.already) return null;
  if (clickedSigs.has(clicked.sig)) return null;
  clickedSigs.add(clicked.sig);
  logStep(`klik: "${clicked.text}" ${clicked.href || ''}`);
  return clicked;
}

/**
 * Cari link download (mediafire/mega/gdrive dll) di halaman.
 */
async function findFileHostLink(page) {
  return page
    .evaluate((hosts) => {
      const anchors = [...document.querySelectorAll('a[href]')];
      for (const a of anchors) {
        const h = a.href || '';
        if (!h || h.startsWith('#') || h.startsWith('javascript:')) continue;
        const low = h.toLowerCase();
        if (hosts.some((d) => low.includes(d))) return h;
      }
      return null;
    }, FILE_HOSTS)
    .catch(() => null);
}

/**
 * Cari link gate shortener berikutnya di halaman rantai.
 * Link domain gate dengan path kosong (homepage) diabaikan -> hindari loop footer.
 */
async function findNextGateLink(page) {
  return page
    .evaluate((hosts) => {
      const badText = /^(powered|credit|website|hosted|visit|created)/i;
      const anchors = [...document.querySelectorAll('a[href]')];
      for (const a of anchors) {
        const h = a.href || '';
        if (!h || h.startsWith('#') || h.startsWith('javascript:')) continue;
        try {
          const u = new URL(h);
          const host = u.hostname.replace(/^www\./, '');
          const isGate = hosts.some((d) => host === d || host.endsWith('.' + d));
          // wajib ada path (bukan homepage) & teks bukan footer credit
          if (!isGate || u.pathname === '/' || u.pathname === '') continue;
          const text = (a.innerText || '').trim();
          if (text && badText.test(text)) continue;
          return h;
        } catch {}
      }
      return null;
    }, GATE_HOSTS)
    .catch(() => null);
}

async function bypass(url) {
  const startedAt = Date.now();
  let browser;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
    );
    await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });

    let activePage = page;
    const popupCandidates = []; // popup non-gate & non-iklan
    const visited = [url];

    // Popup / tab baru: catat kandidat link final (popup iklan diabaikan)
    browser.on('targetcreated', (target) => {
      try {
        if (target.type() !== 'page') return;
        const tUrl = target.url();
        if (!tUrl || tUrl === 'about:blank') return;
        if (isGate(tUrl) || isAd(tUrl)) return;
        target
          .page()
          .then((p) => {
            if (!p) return;
            popupCandidates.push(p);
            // Jika main page masih di gate, anggap popup ini hasil klik get-link
            if (isGate(activePage.url()) || activePage.url() === 'about:blank') activePage = p;
          })
          .catch(() => {});
      } catch {}
    });

    logStep(`buka: ${url}`);

    // Kunci: form sfl.gl auto-submit ~10ms setelah DOMContentLoaded.
    // Pasang waiter SEBELUM goto supaya navigasi auto-submit tidak terlewat.
    const autoSubmitNav = page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => {});

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await autoSubmitNav;

    logStep(`mendarat: ${activePage.url()}`);

    const visitedSet = new Set([url]);
    const addVisited = (u) => {
      if (u && !visitedSet.has(u)) {
        visitedSet.add(u);
        visited.push(u);
      }
    };

    const clickedSigs = new Set();
    let idleMs = 0;
    let foundDownload = null;
    let gateHops = 0;

    while (Date.now() - startedAt < TOTAL_TIMEOUT_MS) {
      const currentUrl = activePage.url();
      addVisited(currentUrl);

      // Popup blank/error -> pindah ke kandidat popup
      if ((currentUrl === 'about:blank' || !currentUrl) && popupCandidates.length) {
        activePage = popupCandidates[popupCandidates.length - 1];
        continue;
      }

      const gate = isGate(currentUrl);

      // Bukan domain gate & bukan domain rantai -> ini tujuan
      if (!gate && !isChainHost(currentUrl)) break;

      // Halaman gate/rantai: cari tombol lanjut / get link
      let clickInfo = null;
      try {
        clickInfo = await clickContinue(activePage, clickedSigs);
      } catch {}

      if (clickInfo) {
        idleMs = 0;
        await Promise.race([
          activePage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
          sleep(4000),
        ]).catch(() => {});
        await sleep(STEP_DELAY_MS);
        logStep(`posisi: ${activePage.url()}`);
        continue;
      }

      // Tidak ada tombol: cek countdown
      const hasCountdown = await detectCountdown(activePage);
      if (hasCountdown) {
        logStep('countdown berjalan, menunggu...');
        await sleep(2000);
        continue;
      }

      if (gate) {
        // Halaman gate tapi UI belum muncul -> tunggu sebentar
        idleMs += 3000;
        if (idleMs > IDLE_TIMEOUT_MS) break;
        await sleep(3000);
        continue;
      }

      // Halaman rantai (mis. artikel khaddavi):
      // 1) cari link download (mediafire/mega/gdrive dll)
      const fileLink = await findFileHostLink(activePage);
      if (fileLink) {
        logStep(`link download ditemukan: ${fileLink}`);
        foundDownload = fileLink;
        break;
      }

      // 2) ikuti gate shortener berikutnya di dalam artikel
      const nextGate = await findNextGateLink(activePage);
      if (nextGate && gateHops < MAX_GATE_HOPS) {
        gateHops++;
        logStep(`lanjut ke gate berikutnya (${gateHops}/${MAX_GATE_HOPS}): ${nextGate}`);
        await activePage
          .goto(nextGate, { waitUntil: 'domcontentloaded', timeout: 60000 })
          .catch(() => {});
        await sleep(STEP_DELAY_MS);
        continue;
      }

      // 3) tidak ada apa-apa -> halaman ini final
      break;
    }

    // Fallback: main page masih di gate tapi ada popup kandidat
    if ((isGate(activePage.url()) || activePage.url() === 'about:blank') && popupCandidates.length) {
      const newest = popupCandidates[popupCandidates.length - 1];
      if (!newest.isClosed() && !isGate(newest.url()) && !isAd(newest.url())) {
        activePage = newest;
      }
    }

    const finalUrl = activePage.url();

    // Di halaman gate terakhir, kadang link final cuma berupa <a> di DOM
    let domFinalLink = null;
    if (isGate(finalUrl) || isChainHost(finalUrl)) {
      domFinalLink = await activePage
        .evaluate(() => {
          const norm = (s) => (s || '').toLowerCase();
          const anchors = [...document.querySelectorAll('a[href]')];
          for (const a of anchors) {
            const t = norm(a.innerText);
            const h = a.href || '';
            if (!h || h.startsWith('#') || h.startsWith('javascript:')) continue;
            if (/get link|continue|lanjut|download|verif/.test(t)) return h;
          }
          return null;
        })
        .catch(() => null);
    }

    const metadata = await extractMetadata(activePage).catch(() => ({}));

    let resolvedFinal = !isGate(finalUrl) ? finalUrl : domFinalLink || finalUrl;
    if (foundDownload) resolvedFinal = foundDownload;

    const fileHost = isFileHost(resolvedFinal)
      ? FILE_HOSTS.find((d) => resolvedFinal.toLowerCase().includes(d))
      : null;

    await browser.close().catch(() => {});

    return {
      success: true,
      original_url: url,
      final_url: resolvedFinal,
      is_download: Boolean(fileHost),
      file_host: fileHost,
      bypassed: !isGate(resolvedFinal) && hostOf(resolvedFinal) !== hostOf(url),
      metadata,
      redirect_chain: visited,
      steps: visited.length,
      duration_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    return {
      success: false,
      original_url: url,
      error: error.message,
      duration_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}

const inputUrl = process.argv[2];

module.exports = {
  bypass,
  findFileHostLink,
  findNextGateLink,
  isFileHost,
  isGate,
  isChainHost,
  FILE_HOSTS,
  GATE_HOSTS,
  CHAIN_HOSTS,
};

if (require.main === module) {
  if (!inputUrl) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node sfl.js <url>' }, null, 2));
    process.exit(1);
  }

  bypass(inputUrl)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.log(
        JSON.stringify({ success: false, original_url: inputUrl, error: err.message }, null, 2)
      );
      process.exit(1);
    });
}
