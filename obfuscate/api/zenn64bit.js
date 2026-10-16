// POST /api/zenn64bit — compile Lua -> LuaJIT bytecode 64-bit
const { makeCompiler } = require("./_compile");
module.exports = makeCompiler(64);
