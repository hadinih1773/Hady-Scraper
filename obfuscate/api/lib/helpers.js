// lib/helpers.js — CORS + response helpers
// Rekonstruksi perilaku endpoint-zenn.vercel.app:
//   access-control-allow-origin: *
//   access-control-allow-methods: POST, GET, OPTIONS
//   access-control-allow-headers: *
//   OPTIONS apapun -> 200 body kosong

function cors(res) {
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
  res.setHeader("access-control-allow-origin", "*");
}

function sendOptions(res) {
  cors(res);
  res.statusCode = 200;
  res.end();
  return true;
}

function sendJson(res, statusCode, obj) {
  cors(res);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function sendBinary(res, buffer, filename) {
  cors(res);
  res.statusCode = 200;
  res.setHeader("content-type", "application/octet-stream");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  res.end(buffer);
}

function sendText(res, statusCode, text) {
  cors(res);
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain");
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = { cors, sendOptions, sendJson, sendBinary, sendText, readBody };
