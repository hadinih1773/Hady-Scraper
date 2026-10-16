// POST /api/zenn64bit & /api/zenn32bit — compile Lua -> LuaJIT bytecode
//
// Perilaku asli yang diprobe:
//   POST multipart "file" (Lua source)
//     -> 200 application/octet-stream, LuaJIT bytecode:
//        magic: 1b 4c 4a 02 FF <flag>   flag=0x0a utk 64-bit, flag=0x02 utk 32-bit
//        header: content-disposition: attachment; filename="compiled-64bit.luac"
//                x-powered-by: Express
//   GET  -> 404
//   debug-luajit menunjukkan binary compilernya: LuaJIT 2.1.1788856981 (luajit64 & luajit32)

const { sendOptions, sendJson, sendBinary, readBody } = require("./lib/helpers");
const { compileLua } = require("./lib/luajit");

function parseMultipartFile(req) {
  return new Promise((resolve) => {
    const ct = req.headers["content-type"] || "";
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!m || ct.indexOf("multipart/form-data") !== 0) return resolve(null);
    const boundary = "--" + (m[1] || m[2]).trim();

    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const start = body.indexOf(boundary);
      if (start === -1) return resolve(null);
      const headEnd = body.indexOf("\r\n\r\n", start);
      if (headEnd === -1) return resolve(null);
      const head = body.slice(start, headEnd).toString("utf8");
      const nameMatch = head.match(/name="([^"]*)"/);
      if (!nameMatch || nameMatch[1] !== "file") return resolve(null);
      const end = body.indexOf("\r\n" + boundary, headEnd);
      if (end === -1) return resolve(null);
      resolve(body.slice(headEnd + 4, end));
    });
  });
}

function makeCompiler(bits) {
  return async (req, res) => {
    if (req.method === "OPTIONS") return sendOptions(res);
    if (req.method !== "POST") return sendJson(res, 404, { success: false, error: "Not found" });

    try {
      let source = await parseMultipartFile(req);
      if (source === null) {
        const raw = await readBody(req);
        // fallback: coba raw body sebagai lua source
        source = raw && raw.length ? raw : null;
      }
      if (!source) {
        return sendJson(res, 400, { success: false, error: "No file uploaded" });
      }

      const r = await compileLua(source.toString("utf8"), bits);
      if (!r.ok) {
        return sendJson(res, 400, { success: false, error: r.error });
      }

      sendBinary(res, r.bytes, `compiled-${bits}bit.luac`);
    } catch (e) {
      sendJson(res, 500, { success: false, error: e.message });
    }
  };
}

module.exports = { makeCompiler, parseMultipartFile };
