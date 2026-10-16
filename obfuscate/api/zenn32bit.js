// POST /api/zenn32bit — compile Lua -> LuaJIT bytecode 32-bit
const { makeCompiler } = require("./_compile");
module.exports = makeCompiler(32);
