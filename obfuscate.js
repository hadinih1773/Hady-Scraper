/**
 * Lua Obfuscator - 4 Core Features
 * 1. String Encoding - Convert strings to byte arrays/encrypted
 * 2. Variable/Function Renaming - Mangling identifiers to hex/short names
 * 3. Control Flow Obfuscation - Flatten control flow with opaque predicates
 * 4. Dead Code Injection - Insert unreachable/dead code blocks
 */

const crypto = require("crypto");

class LuaObfuscator {
  constructor(options = {}) {
    this.options = {
      stringEncoding: options.stringEncoding ?? true,
      renameVariables: options.renameVariables ?? true,
      controlFlow: options.controlFlow ?? true,
      deadCode: options.deadCode ?? true,
      encodingAlgorithm: options.encodingAlgorithm || "xor",
      renamePrefix: options.renamePrefix || "_0x",
      deadCodeRatio: options.deadCodeRatio || 0.15,
      controlFlowDepth: options.controlFlowDepth || 2
    };

    this.identifierMap = new Map();
    this.counter = 0;
    this.stringTable = [];
  }

  genName() {
    return this.options.renamePrefix + (this.counter++).toString(16).padStart(4, "0");
  }

  getRenamed(original) {
    if (!this.identifierMap.has(original)) {
      this.identifierMap.set(original, this.genName());
    }
    return this.identifierMap.get(original);
  }

  encodeString(str, algorithm = "xor") {
    const bytes = Buffer.from(str, "utf8");
    let encoded;
    const key = crypto.randomBytes(1)[0];

    switch (algorithm) {
      case "xor":
        encoded = bytes.map(b => b ^ key);
        break;
      case "base64":
        encoded = bytes;
        break;
      case "hex":
        encoded = bytes;
        break;
      case "chunked":
        encoded = [];
        for (let i = 0; i < bytes.length; i += 4) {
          const chunk = bytes.slice(i, i + 4);
          encoded.push(...chunk.map(b => b ^ key));
        }
        break;
      default:
        encoded = bytes.map(b => b ^ key);
    }

    const encodedStr = Buffer.from(encoded).toString("base64");
    const keyStr = key.toString();

    if (algorithm === "base64") {
      return `(function() local s="${encodedStr}" return (function(s) local r="" for i=1,#s do r=r..string.char(s:byte(i)) end return r end)((s:gsub("..",function(c)return string.char(tonumber(c,16))end))) end)()`;
    }

    return `(function() local s="${encodedStr}" local k=${keyStr} local r="" local d=s:gsub("..",function(c)return string.char(tonumber(c,16))end) for i=1,#d do r=r..string.char(d:byte(i)~k) end return r end)()`;
  }

  renameIdentifiers(code) {
    if (!this.options.renameVariables) return code;

    const preserved = new Set([
      "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
      "if", "in", "local", "nil", "not", "or", "repeat", "return", "then",
      "true", "until", "while", "goto",
      "print", "pairs", "ipairs", "next", "type", "tostring", "tonumber",
      "require", "pcall", "xpcall", "error", "assert", "select", "rawget",
      "rawset", "rawlen", "rawequal", "setmetatable", "getmetatable",
      "string", "table", "math", "io", "os", "debug", "coroutine", "package",
      "byte", "char", "find", "format", "gmatch", "gsub", "len", "lower",
      "match", "rep", "reverse", "sub", "upper",
      "insert", "remove", "sort", "concat", "unpack", "pack", "maxn",
      "abs", "acos", "asin", "atan", "ceil", "cos", "deg", "exp", "floor",
      "log", "max", "min", "pow", "rad", "random", "randomseed", "sin",
      "sqrt", "tan", "pi", "huge",
      "read", "write", "open", "close", "flush", "lines", "seek", "setvbuf",
      "clock", "date", "difftime", "execute", "exit", "getenv", "remove",
      "rename", "setlocale", "time", "tmpname",
      "traceback", "getinfo", "getlocal", "setlocal", "getupvalue", "setupvalue",
      "getmetatable", "setmetatable", "getfenv", "setfenv",
      "create", "resume", "yield", "status", "wrap",
      "loadlib", "loaded", "preload", "cpath", "path", "seeall",
      "module", "require",
      "_G", "_VERSION", "arg", "self"
    ]);

    let result = code;

    result = result.replace(/\blocal\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g, (match, name) => {
      if (preserved.has(name)) return match;
      const renamed = this.getRenamed(name);
      return match.replace(name, renamed);
    });

    result = result.replace(/\blocal\s+function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, (match, name) => {
      if (preserved.has(name)) return match;
      const renamed = this.getRenamed(name);
      return match.replace(name, renamed);
    });

    result = result.replace(/\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, (match, name) => {
      if (preserved.has(name)) return match;
      const renamed = this.getRenamed(name);
      return match.replace(name, renamed);
    });

    for (const [original, renamed] of this.identifierMap) {
      if (preserved.has(original)) continue;
      const regex = new RegExp("\\b" + original + "\\b", "g");
      result = result.replace(regex, renamed);
    }

    return result;
  }

  obfuscateControlFlow(code) {
    if (!this.options.controlFlow) return code;

    const opaquePredicates = [
      "((#''+1)%2==1)",
      "((2*3)%6==0)",
      "((#'abc')>2)",
      "((1/0)=='inf')",
      "((0/0)~=(0/0))",
      "((1/0)>0)",
      "(({}=={})==false)",
      "((function()end)==(function()end))"
    ];

    let result = code;

    result = result.replace(/if\s+(.*?)\s+then\s+(.*?)\s+end/g, (match, condition, body) => {
      if (Math.random() < 0.3) {
        const predicate = opaquePredicates[Math.floor(Math.random() * opaquePredicates.length)];
        return `if ${predicate} then ${body} end -- obfuscated: ${condition}`;
      }
      return match;
    });

    if (this.options.deadCode) {
      const deadLoop = `while ${opaquePredicates[Math.floor(Math.random() * opaquePredicates.length)]} do break end`;
      result = result.replace(/(function\s+\w+\s*\([^)]*\)\s*\n)/g, `$1${deadLoop}\n`);
    }

    return result;
  }

  injectDeadCode(code) {
    if (!this.options.deadCode) return code;

    const deadCodeBlocks = [
      `if false then ${this.genDeadBlock()} end`,
      `if 1==2 then ${this.genDeadBlock()} end`,
      `if nil then ${this.genDeadBlock()} end`,
      `while false do ${this.genDeadBlock()} end`,
      `repeat ${this.genDeadBlock()} until true`,
      `if #{''}==0 then ${this.genDeadBlock()} end`
    ];

    const lines = code.split("\n");
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);

      if (Math.random() < this.options.deadCodeRatio && lines[i].trim() && !lines[i].trim().startsWith("--")) {
        const deadCode = deadCodeBlocks[Math.floor(Math.random() * deadCodeBlocks.length)];
        result.push(`  ${deadCode} -- dead code`);
      }
    }

    return result.join("\n");
  }

  genDeadBlock() {
    const blocks = [
      `local ${this.genName()} = ${Math.floor(Math.random() * 1000)}`,
      `local ${this.genName()} = function() return ${Math.random()} end`,
      `if ${Math.random()} > 0.5 then return nil end`,
      `for ${this.genName()} = 1, 0 do end`,
      `local ${this.genName()} = {${Math.random()}, ${Math.random()}, ${Math.random()}}`
    ];
    return blocks[Math.floor(Math.random() * blocks.length)];
  }

  encodeStringsInCode(code) {
    const stringRegex = /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(\[\[[^\]]*\]\])/gs;

    return code.replace(stringRegex, (match) => {
      if (match.startsWith("function()")) return match;

      let content;
      if (match.startsWith("[[")) {
        content = match.slice(2, -2);
      } else {
        content = match.slice(1, -1);
      }

      if (content.length < 3) return match;
      if (/\b(function|if|then|else|end|local|for|while|return)\b/.test(content)) return match;

      const encoded = this.encodeString(content, this.options.encodingAlgorithm);
      return encoded;
    });
  }

  obfuscate(code, options = {}) {
    Object.assign(this.options, options);
    this.identifierMap.clear();
    this.counter = 0;
    this.stringTable = [];

    let result = code;

    if (this.options.stringEncoding) {
      result = this.encodeStringsInCode(result);
    }

    if (this.options.renameVariables) {
      result = this.renameIdentifiers(result);
    }

    if (this.options.controlFlow) {
      result = this.obfuscateControlFlow(result);
    }

    if (this.options.deadCode) {
      result = this.injectDeadCode(result);
    }

    const header = "--[[ Obfuscated by LuaObfuscator v1.0 ]]\n";
    return header + result;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
Usage: node obfuscate.js <input.lua> [options]

Options:
  --no-strings    Disable string encoding (Feature 1)
  --no-rename     Disable variable renaming (Feature 2)
  --no-flow       Disable control flow obfuscation (Feature 3)
  --no-dead       Disable dead code injection (Feature 4)
  --encoding      Encoding algorithm: xor, base64, hex, chunked (default: xor)
  --ratio         Dead code ratio 0-1 (default: 0.15)
  --prefix        Rename prefix (default: _0x)
  -o, --output    Output file (default: stdout)

Examples:
  node obfuscate.js script.lua
  node obfuscate.js script.lua --encoding chunked --ratio 0.2
  node obfuscate.js script.lua --no-dead --no-flow -o output.lua
  node obfuscate.js script.lua --encoding base64 -o out.lua
`);
    process.exit(1);
  }

  const fs = require("fs");
  const inputFile = args[0];
  const options = {
    stringEncoding: true,
    renameVariables: true,
    controlFlow: true,
    deadCode: true,
    encodingAlgorithm: "xor",
    deadCodeRatio: 0.15,
    renamePrefix: "_0x"
  };

  let outputFile = null;
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--no-strings": options.stringEncoding = false; break;
      case "--no-rename": options.renameVariables = false; break;
      case "--no-flow": options.controlFlow = false; break;
      case "--no-dead": options.deadCode = false; break;
      case "--encoding": options.encodingAlgorithm = args[++i]; break;
      case "--ratio": options.deadCodeRatio = parseFloat(args[++i]); break;
      case "--prefix": options.renamePrefix = args[++i]; break;
      case "-o":
      case "--output": outputFile = args[++i]; break;
    }
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  const code = fs.readFileSync(inputFile, "utf8");
  const obfuscator = new LuaObfuscator(options);
  const result = obfuscator.obfuscate(code, options);

  if (outputFile) {
    fs.writeFileSync(outputFile, result);
    console.log(`Obfuscated: ${inputFile} -> ${outputFile}`);
  } else {
    console.log(result);
  }
}

module.exports = { LuaObfuscator };