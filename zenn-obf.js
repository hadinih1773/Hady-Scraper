const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const BASE_URL = "https://endpoint-zenn.vercel.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MODES = {
  "wd": "Obfuscate only",
  "wd64": "Obfuscate + Compile 64-bit",
  "wd32": "Obfuscate + Compile 32-bit",
  "wd3264": "Obfuscate + Compile 32/64-bit (zip)",
  "c64": "Compile 64-bit only",
  "c32": "Compile 32-bit only"
};

async function checkApi() {
  try {
    await axios.post(`${BASE_URL}/api/obfuscatezenn`, { script: "print('test')" }, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function obfuscate(script) {
  const res = await axios.post(`${BASE_URL}/api/obfuscatezenn`, {
    script
  }, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA
    },
    timeout: 30000
  });
  
  if (!res.data?.success) {
    throw new Error(res.data?.error || "Obfuscation failed");
  }
  return res.data.obfuscated;
}

async function compile(script, bits) {
  const form = new FormData();
  const buffer = Buffer.from(script, "utf8");
  form.append("file", buffer, {
    filename: "input.lua",
    contentType: "text/plain",
    knownLength: buffer.length
  });

  const url = bits === 64 ? `${BASE_URL}/api/zenn64bit` : `${BASE_URL}/api/zenn32bit`;
  
  const res = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      "User-Agent": UA
    },
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });
  
  return res.data;
}

async function processLua(inputFile, mode, outputFile) {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`File tidak ditemukan: ${inputFile}`);
  }

  const code = fs.readFileSync(inputFile, "utf8");
  console.log(`[1/4] Membaca file: ${inputFile} (${code.length} bytes)`);

  // Check API availability
  console.log("[2/4] Memeriksa API...");
  const apiOk = await checkApi();
  if (!apiOk) {
    throw new Error("API tidak tersedia. Coba lagi nanti.");
  }
  console.log("✓ API tersedia");

  let current = code;
  let obfuscated = false;

  // Step 1: Obfuscate if needed
  if (["wd", "wd64", "wd32", "wd3264"].includes(mode)) {
    console.log("[3/4] Obfuscating...");
    current = await obfuscate(code);
    obfuscated = true;
    console.log(`✓ Obfuscate OK (${current.length} bytes)`);
  }

  // Step 2: Compile if needed
  if (mode === "c64" || mode === "wd64") {
    console.log("[4/4] Compiling 64-bit...");
    const bytes = await compile(current, 64);
    const name = outputFile || (obfuscated ? "output-obfuscate-64bit.luac" : "output-64bit.luac");
    fs.writeFileSync(name, bytes);
    console.log(`✓ Compile 64-bit OK (${bytes.length} bytes)`);
    console.log(`→ Saved: ${name}`);
    return name;

  } else if (mode === "c32" || mode === "wd32") {
    console.log("[4/4] Compiling 32-bit...");
    const bytes = await compile(current, 32);
    const name = outputFile || (obfuscated ? "output-obfuscate-32bit.luac" : "output-32bit.luac");
    fs.writeFileSync(name, bytes);
    console.log(`✓ Compile 32-bit OK (${bytes.length} bytes)`);
    console.log(`→ Saved: ${name}`);
    return name;

  } else if (mode === "wd3264") {
    console.log("[4/4] Compiling 32-bit & 64-bit...");
    const bytes32 = await compile(current, 32);
    const bytes64 = await compile(current, 64);
    
    const baseName = path.basename(inputFile, ".lua");
    const zipName = outputFile || `${baseName}-32-64bit.zip`;
    
    // Create simple zip (using simple concatenation for now, real zip would need archiver)
    // For simplicity, we'll just save both files
    const name32 = `${baseName}-32bit.luac`;
    const name64 = `${baseName}-64bit.luac`;
    fs.writeFileSync(name32, bytes32);
    fs.writeFileSync(name64, bytes64);
    console.log(`✓ Compile 32-bit OK (${bytes32.length} bytes)`);
    console.log(`✓ Compile 64-bit OK (${bytes64.length} bytes)`);
    console.log(`→ Saved: ${name32}, ${name64}`);
    return { name32, name64 };
  }

  // Obfuscate only
  const name = outputFile || "output-obfuscate.lua";
  fs.writeFileSync(name, current);
  console.log(`→ Saved: ${name} (${current.length} bytes)`);
  return name;
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(`
Usage: node zenn-obf.js <file.lua> <mode> [output]

Modes:
  wd       Obfuscate only
  wd64     Obfuscate + Compile 64-bit
  wd32     Obfuscate + Compile 32-bit
  wd3264   Obfuscate + Compile 32-bit & 64-bit
  c64      Compile 64-bit only
  c32      Compile 32-bit only

Examples:
  node zenn-obf.js script.lua wd
  node zenn-obf.js script.lua wd64
  node zenn-obf.js script.lua wd32
  node zenn-obf.js script.lua wd3264
  node zenn-obf.js script.lua c64
  node zenn-obf.js script.lua c32
`);
  process.exit(1);
}

const [inputFile, mode, outputFile] = args;

if (!MODES[mode]) {
  console.error(`Mode tidak valid: ${mode}`);
  console.log(`Valid modes: ${Object.keys(MODES).join(", ")}`);
  process.exit(1);
}

processLua(inputFile, mode, outputFile)
  .then(name => console.log(`\n✓ Selesai: ${JSON.stringify(name)}`))
  .catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

module.exports = { obfuscate, compile, processLua };