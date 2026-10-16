// POST /api/deobfuscate — coba deobfuscate file Lua (multipart "file")
//
// Perilaku asli yang diprobe:
//   POST tanpa file            -> 400 {"success":false,"statusCode":400,"error":"No file uploaded"}
//   POST file obfuscated (advanced VM style, WeAreDevs)
//                              -> 502 {"success":false,"statusCode":502,"error":"Deobfuscation failed"}
//   Bentuk error style Fastify: ada field "statusCode"
//
// Implementasi: best-effort pattern deobfuscator sederhana
//   (string base64 / hex-gsub / string.char) — kalau tidak match → DeObfuscation failed.

const { sendOptions, sendJson, readBody } = require("./lib/helpers");
const { parseMultipartFile } = require("./_compile");

const B64_RE = /^[A-Za-z0-9+/={0-9}]+$/;
function tryBase64(s) {
  const dec = Buffer.from(s, "base64").toString("utf8");
  // valid kalau hasilnya printable & tidak hancur
  if (dec && !/[\x00-\x08\x0E-\x1F]/.test(dec) && /[A-Za-z0-9 \-\.\(\)]/.test(dec)) return dec;
  return null;
}

function tryHexGsub(s) {
  // format string hex pair: "48656c6c6f" gsub(nil, tonumber(c,16))
  const decoded = s.replace(/\.\./g, "").replace(/[^0-9a-fA-F]/g, "");
  if (decoded.length < 2 || decoded.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(decoded)) return null;
  const buf = Buffer.from(decoded, "hex").toString("utf8");
  if (!buf || /[\x00-\x08\x0E-\x1F]/.test(buf)) return null;
  return buf;
}

/**
 * Best-effort: temukan string literal panjang di script obfuscated & coba decode.
 * @returns {{ok:true, deobfuscated:string}|{ok:false}}
 */
function deobfuscateSource(src) {
  const strings = [...src.matchAll(/"((?:[^"\\\n]|\\.){8,})"/g)].map((m) => m[1]);
  for (const s of strings) {
    const asHex = tryHexGsub(s);
    if (asHex && asHex.length > 4) {
      return { ok: true, deobfuscated: asHex };
    }
    if (B64_RE.test(s)) {
      const asB64 = tryBase64(s);
      if (asB64 && asB64.length > 4) {
        return { ok: true, deobfuscated: asB64 };
      }
    }
  }
  return { ok: false };
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return sendOptions(res);
  if (req.method !== "POST") {
    return sendJson(res, 404, { success: false, statusCode: 404, error: "Not found" });
  }

  try {
    let file = await parseMultipartFile(req);
    if (file === null) {
      const raw = await readBody(req);
      file = raw && raw.length ? raw : null;
    }
    if (!file) {
      // persis persis bentuk error upstream
      return sendJson(res, 400, { success: false, statusCode: 400, error: "No file uploaded" });
    }

    const r = deobfuscateSource(file.toString("utf8"));
    if (!r.ok) {
      // perilaku asli: gagal -> 502 Deobfuscation failed
      return sendJson(res, 502, { success: false, statusCode: 502, error: "Deobfuscation failed" });
    }
    sendJson(res, 200, {
      success: true,
      deobfuscated: r.deobfuscated.slice(0, 100000), // batas aman = 100KB
    });
  } catch (e) {
    sendJson(res, 500, { success: false, statusCode: 500, error: e.message });
  }
};
