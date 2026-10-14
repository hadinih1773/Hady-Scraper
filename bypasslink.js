/* © 2026 Zennq7. All rights reserved. */
const axios = require("axios");

const BASE = "https://bypass-link.com";
const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

// Supported services
const SUPPORTED_DOMAINS = [
  "linkvertise.com", "linkvertise.net", "linkvertise.org",
  "lootlabs.com", "loot-link.com",
  "work.ink", "workink.co",
  "lockr.link", "lockr.to",
  "rekonise.com", "rekonise.net",
  "sub2unlock.com", "sub2unlock.net",
  "mboost.me", "boost.ink",
  "letsboost.net", "letsboost.org",
  "adshrink.it", "adfoc.us", "adf.ly",
  "shorte.st", "sh.st",
  "bc.vc", "clk.sh", "cutt.ly",
  "short.io", "tinyurl.com", "bit.ly"
];

// cookie jar
const jar = new Map();
axios.defaults.headers.common["User-Agent"] = UA;

function ingest(res) {
  const sc = res.headers["set-cookie"] || [];
  for (const c of sc) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function commonHeaders(extra = {}) {
  const h = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: BASE + "/",
    Origin: BASE,
    ...extra,
  };
  const c = cookieHeader();
  if (c) h.Cookie = c;
  return h;
}

function isSupportedUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return SUPPORTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

async function getToken() {
  const r = await axios.get(`${BASE}/api/token`, { headers: commonHeaders() });
  ingest(r);
  const token = r.data?.token;
  if (!token) throw new Error("gagal dapet token: " + JSON.stringify(r.data));
  return token;
}

async function bypass(url) {
  // Validate URL
  if (!isSupportedUrl(url)) {
    console.warn(`⚠️  Peringatan: URL mungkin tidak didukung. Layanan ini mendukung: ${SUPPORTED_DOMAINS.join(', ')}`);
  }

  // ambil cookie session dulu (biar token terikat ke session yang sama)
  const home = await axios.get(BASE, { headers: { "User-Agent": UA, Accept: "text/html" } });
  ingest(home);

  const bypass_token = await getToken();

  const r = await axios.post(
    `${BASE}/api/bypass`,
    { url, bypass_token },
    { headers: commonHeaders({ "Content-Type": "application/json" }) }
  );
  ingest(r);

  if (!r.data?.success) {
    const error = r.data?.error || "bypass gagal: " + JSON.stringify(r.data);
    // Tambahkan hint jika URL tidak didukung
    if (!isSupportedUrl(url)) {
      throw new Error(error + "\n\n💡 Tip: Pastikan URL dari layanan yang didukung:\n" + SUPPORTED_DOMAINS.join(', '));
    }
    throw new Error(error);
  }
  return r.data;
}

const url = process.argv[2];
if (!url) {
  console.error(JSON.stringify({ 
    error: "Usage: node bypasslink.js <url>",
    supported_services: SUPPORTED_DOMAINS
  }, null, 2));
  process.exit(1);
}

bypass(url)
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error(
      JSON.stringify({ 
        error: e.response?.data?.error ?? e.response?.data ?? e.message,
        supported_services: SUPPORTED_DOMAINS
      }, null, 2)
    );
    process.exit(1);
  });
