// GET /api/health — listing endpoint + status mesin
//
// Perilaku asli yang diprobe:
//   GET -> 200 {"status":"ok","timestamp":<ms-epoch>,
//               "endpoints":[ "POST /api/zenn64bit",
//                             "POST /api/zenn32bit",
//                             "POST /api/obfuscatezenn",
//                             "POST /api/deobfuscate",
//                             "GET  /api/debug-luajit",
//                             "GET  /api/health" ]}

const { sendOptions, sendJson } = require("./lib/helpers");

const ENDPOINTS = [
  "POST /api/zenn64bit",
  "POST /api/zenn32bit",
  "POST /api/obfuscatezenn",
  "POST /api/deobfuscate",
  "GET  /api/debug-luajit",
  "GET  /api/health",
];

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return sendOptions(res);
  sendJson(res, 200, {
    status: "ok",
    timestamp: Date.now(),
    endpoints: ENDPOINTS,
  });
};
