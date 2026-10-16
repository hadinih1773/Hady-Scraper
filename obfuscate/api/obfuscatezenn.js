// POST /api/obfuscatezenn — obfuscate Lua via upstream WeAreDevs
//
// Perilaku asli yang diprobe:
//   POST {script: "print(1)"}    -> 200 {"success":true,"obfuscated":"--[[ v1.0.0 https://wearedevs.net/obfuscator ]]..."}
//   POST {}                      -> 400 {"success":false,"error":"Field 'script' required"}
//   POST {script:"invalid @@@"}  -> 400 {"success":false,"error":"WeAreDevs error (HTTP 400)",
//                                         "detail":"{\"success\":false,\"reason\":\"Failed to obfuscate\"}"}
//   OPTIONS srv                  -> 200 body kosong
//   GET                          -> 404 (function hanya handle POST)

const { sendOptions, sendJson, readBody } = require("./lib/helpers");
const { obfuscateUpstream } = require("./lib/obfdevs");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return sendOptions(res);
  if (req.method !== "POST") return sendJson(res, 404, { success: false, error: "Not found" });

  try {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw.toString("utf8") || "{}"); } catch {
      return sendJson(res, 400, { success: false, error: "Body harus JSON" });
    }

    if (typeof body.script !== "string" || body.script.trim() === "") {
      // persis pesan upstream
      return sendJson(res, 400, { success: false, error: "Field 'script' required" });
    }

    const r = await obfuscateUpstream(body.script);

    if (!r.ok) {
      const payload = { success: false, error: r.error };
      if (r.detail !== undefined) payload.detail = r.detail;
      return sendJson(res, r.status === 502 ? 502 : 400, payload);
    }

    sendJson(res, 200, { success: true, obfuscated: r.obfuscated });
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message });
  }
};
