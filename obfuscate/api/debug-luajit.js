// GET /api/debug-luajit — cek binary luajit & self-test compile
//
// Perilaku asli yang diprobe:
//   GET -> 200 {
//     "luajit64_exists": true,
//     "luajit32_exists": true,
//     "luajit64_version": "LuaJIT 2.1.1788856981 -- Copyright ...",
//     "luajit32_version": "LuaJIT 2.1.1788856981 -- Copyright ...",
//     "test_compile": "OK - 39 bytes"
//   }

const { sendOptions, sendJson } = require("./lib/helpers");
const { luajitVersion, testCompile } = require("./lib/luajit");
const fs = require("fs");

async function exists(bin) {
  try {
    const { execSync } = require("child_process");
    execSync(`command -v ${JSON.stringify(bin)}`, { stdio: "ignore" });
    return true;
  } catch {
    // fallback: path filesystem langsung
    try { fs.accessSync(bin); return true; } catch { return false; }
  }
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return sendOptions(res);

  const [e64, e32, v64, v32] = await Promise.all([
    exists("luajit64"), exists("luajit32"),
    luajitVersion(64), luajitVersion(32),
  ]);

  sendJson(res, 200, {
    luajit64_exists: e64,
    luajit32_exists: e32,
    luajit64_version: v64,
    luajit32_version: v32,
    test_compile: await testCompile(64),
  });
};
