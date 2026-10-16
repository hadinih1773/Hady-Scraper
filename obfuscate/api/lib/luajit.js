// lib/luajit.js — wrapper kompilasi Lua -> LuaJIT bytecode (32/64-bit)
// Fakta dari probe /api/debug-luajit (endpoint asli):
//   luajit64_version: "LuaJIT 2.1.1788856981 -- Copyright (C) 2005-2026 Mike Pall. https://luajit.org/"
//   test_compile: "OK - 39 bytes"   (test nya compile print("hi"), output 39 byte)
//
// Magic bytes hasil compile (diprobe dari /api/zenn64bit & file luac user):
//   1b 4c 4a 02 FF <flag>  ->  FF = versi byte, flag = 0x0a untuk 64-bit, 0x02 untuk 32-bit
// Header header "1b 4c 4a" = ESC L J (signature LuaJIT bytecode)

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const LUAJIT64 = process.env.LUAJIT64_BIN || "luajit64";
const LUAJIT32 = process.env.LUAJIT32_BIN || "luajit32";

function checkFlag(buffer, bits) {
  // byte[0]=0x1b byte[1]=0x4c byte[2]=0x4a byte[3]=versi(0x02) byte[4]=flag arch
  return (
    buffer.length > 4 &&
    buffer[0] === 0x1b && buffer[1] === 0x4c && buffer[2] === 0x4a &&
    buffer[3] === 0x02 &&
    (bits === 64 ? buffer[4] === 0x0a : buffer[4] === 0x02)
  );
}

function run(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd });
    let out = Buffer.alloc(0);
    let err = "";
    p.stdout.on("data", (d) => (out = Buffer.concat([out, d])));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", () => resolve({ out, err }));
  });
}

/**
 * Compile source Lua -> LuaJIT bytecode sesuai arsitektur.
 * Mirroring perilaku upstream: validasi dulu lewat `luajit -bl`,
 * lalu compile `luajit64 -b input output`.
 * @param {string} source kode Lua
 * @param {32|64} bits
 * @returns {Promise<{ok:true, bytes:Buffer}|{ok:false, error:string}>}
 */
async function compileLua(source, bits) {
  if (typeof source !== "string" || source.length === 0) {
    return { ok: false, error: "Script kosong." };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zennc-"));
  const inPath = path.join(tmp, "input.lua");
  const outPath = path.join(tmp, bits === 64 ? "compiled-64bit.luac" : "compiled-32bit.luac");
  fs.writeFileSync(inPath, source, "utf8");

  const bin = bits === 64 ? LUAJIT64 : LUAJIT32;

  try {
    // Validasi syntax dulu: -b diatasi dulu dengan listing bytecode (-bl) supaya error parse tertangkap sebelum compile beneran
    const check = await run(bin, ["-bl", inPath, path.join(tmp, "list.out")]);
    if (check.err && /error|cannot|invalid/i.test(check.err + check.out.toString())) {
      return { ok: false, error: firstLuaError(check.err + check.out.toString()) };
    }

    const res = await run(bin, ["-b", inPath, outPath]);
    const combined = res.err + res.out.toString();
    if (res.err && !fs.existsSync(outPath)) {
      return { ok: false, error: firstLuaError(combined) || "Compile failed" };
    }
    if (!fs.existsSync(outPath)) {
      return { ok: false, error: firstLuaError(combined) || "Compile gagal: tidak ada output bytecode" };
    }

    const bytes = fs.readFileSync(outPath);
    if (!checkFlag(bytes, bits)) {
      return { ok: false, error: `Output bukan bytecode ${bits}-bit yang valid (magic byte mismatch)` };
    }
    return { ok: true, bytes };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

function firstLuaError(text) {
  // LuaJIT biasanya: input.lua:3: unexpected symbol near '@'
  const m = text.match(/([^\s:]+\.lua:\d+:[^\r\n]+)/i);
  return m ? m[1].trim() : text.trim().split("\n")[0] || null;
}

/** Versi binary luajit, untuk /api/health & /api/debug-luajit */
async function luajitVersion(bits) {
  const bin = bits === 64 ? LUAJIT64 : LUAJIT32;
  const r = await run(bin, ["-v"]);
  return (r.out.toString() + r.err).trim().split("\n")[0] || `${bin} tidak tersedia`;
}

/** Compile self-test seperti debug-luajit upstream: print("hi") harus 39 byte */
async function testCompile(bits) {
  try {
    const r = await compileLua('print("hi")', bits);
    if (!r.ok) return `FAIL - ${r.error}`;
    return `OK - ${r.bytes.length} bytes`;
  } catch (e) {
    return `FAIL - ${e.message}`;
  }
}

module.exports = { compileLua, luajitVersion, testCompile, checkFlag };
