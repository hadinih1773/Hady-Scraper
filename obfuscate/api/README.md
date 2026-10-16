# Rekonstruksi API — endpoint-zenn.vercel.app

Source code asli di Vercel tidak bisa diunduh via HTTP (function-nya sudah ter-compile),
jadi folder ini adalah **rekonstruksi perilaku berdasarkan probing langsung** terhadap
API live. Semua bentuk request/response di bawah diverifikasi dari respon asli
(Oktober 2026).

## Endpoint live yang diprobe

### 1. `GET /api/health`
```json
{"status":"ok","timestamp":1792156127091,
 "endpoints":["POST /api/zenn64bit","POST /api/zenn32bit","POST /api/obfuscatezenn",
              "POST /api/deobfuscate","GET  /api/debug-luajit","GET  /api/health"]}
```

### 2. `GET /api/debug-luajit`
```json
{"luajit64_exists":true,"luajit32_exists":true,
 "luajit64_version":"LuaJIT 2.1.1788856981 -- Copyright (C) 2005-2026 Mike Pall. https://luajit.org/",
 "luajit32_version":"LuaJIT 2.1.1788856981 -- Copyright (C) 2005-2026 Mike Pall. https://luajit.org/",
 "test_compile":"OK - 39 bytes"}
```

### 3. `POST /api/obfuscatezenn`  (JSON body)
- `{script:"print(1)"}` → 200
  `{"success":true,"obfuscated":"--[[ v1.0.0 https://wearedevs.net/obfuscator ]] ..."}`
- `{}` → 400 `{"success":false,"error":"Field 'script' required"}`
- script invalid → 400 `{"success":false,"error":"WeAreDevs error (HTTP 400)","detail":"{\"success\":false,\"reason\":\"Failed to obfuscate\"}"}`
- Output **deterministik** (etag sama di 2 request input sama).
- Kadang 429 (`hukuman` sisi upstream, bukan hard-limit — kedua retry 200).

### 4. `POST /api/zenn64bit` / `POST /api/zenn32bit`  (multipart `file`)
- 200 `application/octet-stream`
  - header: `content-disposition: attachment; filename="compiled-64bit.luac"`
            `x-powered-by: Express`
  - bytecode LuaJIT: magic `1b 4c 4a 02 FF` → FF=versi byte, flag arch:
    - 64-bit = `0a`
    - 32-bit = `02`
- GET → 404

### 5. `POST /api/deobfuscate`  (multipart `file`)
- tanpa file → 400 `{"success":false,"statusCode":400,"error":"No file uploaded"}`
- file obfuscated style VM (WeAreDevs) → 502
  `{"success":false,"statusCode":502,"error":"Deobfuscation failed"}`
  → upstream kemungkinan besar hanya mendukung obfuscation sederhana,
  bukan full VM-wrapped.

## Seluruh endpoint memakai CORS:
```
access-control-allow-headers: *
access-control-allow-methods: POST, GET, OPTIONS
access-control-allow-origin: *
```
OPTIONS apapun → 200 body kosong.

## Yang ditemukan di folder frontend (`zenntools/`)
- `app.js` frontend hanya memanggil:
  - `POST /api/bypass` (di domain frontend sendiri, support `sfl.gl`, `sub4unlock`, `bicolink`)
  - `POST ${API_BASE}/api/obfuscatezenn`
  - `POST ${API_BASE}/api/zenn64bit` / `zenn32bit` (form-data `file`)
- `API_BASE` di frontend mengarah ke `https://endpoint-zenn.vercel.app`.

## Perilaku `/api/bypass` (di-host di domain frontend, bukan di sini)
- `{}` → 400 `{"success":false,"error":"URL wajib diisi."}`
- domain tidak didukung → 400
  `{"success":false,"error":"Link tidak didukung. Hanya sfl.gl, sub4unlock, dan bicolink."}`
- link valid tapi upstream-nya error →
  - sfl.gl  → `{"success":false,"error":"Error: 500 Internal Server"}`
  - sub4unlock → `{"success":false,"error":"Internal Server Error"}`
  - bicolink → `{"success":false,"error":"Unable to extract destination URL."}`

## Cara jalankan rekonstruksi ini lokal
```bash
node dev-server.js 8080
# tes cepat:
curl localhost:8080/api/health
curl -X POST -H 'content-type: application/json' \
     -d '{"script":"print(1)"}' localhost:8080/api/obfuscatezenn
curl -F file=@test.lua localhost:8080/api/zenn64bit -o out.luac
```
Compile memerlukan binary LuaJIT (`luajit64` & `luajit32`) yang bisa di-override
via env `LUAJIT64_BIN` / `LUAJIT32_BIN`. Obfuscate tidak butuh dependency: pakai
`fetch` bawaan Node 18+.
