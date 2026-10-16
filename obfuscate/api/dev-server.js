// dev-server.js — server lokal yang menjalankan semua handler di folder ini
// dengan routing persis seperti deploy Vercel.
//
// pakai: node dev-server.js [port]
// default port 8080. Tes:
//   curl localhost:8080/api/health
//   curl -X POST -H 'content-type: application/json' -d '{"script":"print(1)"}' localhost:8080/api/obfuscatezenn
//   curl -F file=@test.lua localhost:8080/api/zenn64bit -o out.luac
//   curl localhost:8080/api/debug-luajit

const http = require("http");

const routes = {
  "/api/obfuscatezenn": require("./obfuscatezenn"),
  "/api/zenn64bit": require("./zenn64bit"),
  "/api/zenn32bit": require("./zenn32bit"),
  "/api/deobfuscate": require("./deobfuscate"),
  "/api/health": require("./health"),
  "/api/debug-luajit": require("./debug-luajit"),
};

const port = parseInt(process.argv[2] || process.env.PORT || "8080", 10);

const server = http.createServer(async (req, res) => {
  try {
    const handler = routes[req.url.split("?")[0]];
    if (!handler) return res.end("The page could not be found\n\nNOT_FOUND");
    res.setHeader("x-powered-by", "Express");
    await handler(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ success: false, error: e.message }));
  }
});

server.listen(port, () => console.log(`listening on http://localhost:${port}`));
