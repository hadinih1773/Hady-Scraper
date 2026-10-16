// lib/obfdevs.js — client obfuscate ke upstream WeAreDevs
// Fakta dari probe /api/obfuscatezenn (endpoint asli):
//   Kode hasil awalnya selalu: --[[ v1.0.0 https://wearedevs.net/obfuscator ]]
//   Script invalid -> 400 {"success":false,"error":"WeAreDevs error (HTTP 400)",
//                          "detail":"{\"success\":false,\"reason\":\"Failed to obfuscate\"}"}
//   Field kosong   -> 400 {"success":false,"error":"Field 'script' required"}
//   Output deterministik: input sama -> output sama (etag sama antar request)
//   Kadang kena 429 di sisi upstream (hukuman rate-limit), transient.
//
// Kebutuhan runtime: form-data (npm i form-data) — dideteksi lazily
// supaya module bisa diimport di lingkungan tanpa dep.

const { execSync } = require("child_process");
const https = require("https");

const WEAREDEVS_URL = "https://wearedevs.net/obfuscator/obf"; // upstream obfuscator
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BANNER = "--[[ v1.0.0 https://wearedevs.net/obfuscator ]]";

function postFormFields(url, fields, extraHeaders = {}) {
  // Node >=18 punya FormData & fetch global — cukup untuk multipart kecil
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fetch(url, {
    method: "POST",
    headers: { "User-Agent": UA, ...extraHeaders },
    body: fd,
  });
}

/**
 * Kirim script ke upstream, balikin hasil obfuscated.
 * @param {string} script
 * @returns {Promise<{ok:true, obfuscated:string}|{ok:false, status:number, error:string, detail?:string}>}
 */
async function obfuscateUpstream(script) {
  try {
    const res = await postFormFields(WEAREDEVS_URL, { data: script });
    const text = await res.text();

    if (!res.ok) {
      // bentuk error gitu persis: "WeAreDevs error (HTTP 400)" + detail = body upstream
      return { ok: false, status: res.status, error: `WeAreDevs error (HTTP ${res.status})`, detail: text };
    }

    // Upstream WeAreDevs normalnya balikinEither HTML/json/baris hasil obfuscated
    let obfuscated = text;
    try {
      const j = JSON.parse(text);
      if (typeof j === "object" && j !== null) {
        if (j.success === false) {
          return { ok: false, status: 400, error: `WeAreDevs error (HTTP ${res.status || 400})`, detail: text };
        }
        obfuscated = j.obfuscated || j.data || j.result || text;
      }
    } catch { /* bukan json — anggap text murni */ }

    if (!obfuscated || typeof obfuscated !== "string" || obfuscated.includes("Failed to obfuscate")) {
      return { ok: false, status: 400, error: `WeAreDevs error (HTTP 400)`, detail: obfuscated || text };
    }

    return { ok: true, obfuscated: obfuscated.replace(/^\uFEFF/, "").trim() };
  } catch (e) {
    // network/timeout di wrap 502
    return { ok: false, status: 502, error: `WeAreDevs error (${e.code || e.message})` };
  }
}

module.exports = { obfuscateUpstream, BANNER };
