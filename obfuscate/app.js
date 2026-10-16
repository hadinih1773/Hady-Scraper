const $splash = document.getElementById("splash");
const $main   = document.getElementById("main");
const $video  = document.getElementById("bgVideo");
const $music  = document.getElementById("bgMusic");
const $toast  = document.getElementById("toast");
const $toastMsg = document.getElementById("toastMessage");
let toastTimer;

function showToast(msg){
  $toastMsg.textContent = msg;
  clearTimeout(toastTimer);
  $toast.classList.add("show");
  toastTimer = setTimeout(() => $toast.classList.remove("show"), 3000);
}

document.addEventListener("DOMContentLoaded", function() {
  const audio = document.getElementById("bgMusic");
  if (!audio) return;

  audio.loop = true;
  audio.volume = 0.5;

  audio.play().catch(function(error) {
    document.addEventListener('click', function playOnce() {
      audio.play().catch(() => {});
      document.removeEventListener('click', playOnce);
    });
  });

  audio.addEventListener('ended', function() {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });
});

let entered = false;
function enterSite(){
  if (entered) return;
  entered = true;

  if ($video) {
    $video.muted = true; $video.loop = true; $video.playsInline = true;
    const p = $video.play();
    if (p && p.catch) p.catch(() => {});
    $video.classList.add("playing");
  }

  if ($music) {
    $music.loop = true;
    $music.volume = 0.5;
    $music.play().catch(() => {});
  }

  $splash.classList.add("hide");
  $main.classList.add("show");
  setTimeout(() => { $splash.style.display = "none"; }, 750);
}
$splash.addEventListener("click", enterSite);
$splash.addEventListener("touchstart", enterSite, {passive:true});

const navLinks = document.querySelectorAll(".communityzenn-navlinks a[data-page]");
const pages    = document.querySelectorAll(".page");
navLinks.forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    const target = link.dataset.page;
    navLinks.forEach(l => l.classList.toggle("active", l === link));
    pages.forEach(p => p.classList.toggle("active", p.id === "page-" + target));
    window.scrollTo({top:0, behavior:"smooth"});
  });
});

const subTabs   = document.querySelectorAll(".subtab");
const toolPanels = document.querySelectorAll(".tool-panel");
subTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tool;
    subTabs.forEach(t => t.classList.toggle("active", t === tab));
    toolPanels.forEach(p => p.classList.toggle("active", p.id === "tool-" + target));
  });
});

(function bypassTool(){
  const input       = document.getElementById("urlInput");
  const button      = document.getElementById("bypassBtn");
  const result      = document.getElementById("bypassResult");
  const statusBox   = document.getElementById("statusBox");
  const resultCard  = document.getElementById("resultCard");
  const providerBadge = document.getElementById("providerBadge");
  const resultLink  = document.getElementById("resultLink");
  const copyButton  = document.getElementById("copyButton");
  const openButton  = document.getElementById("openButton");
  const pasteBtn    = document.getElementById("pasteBtn");

  let destinationUrl = "";

  function setLoading(state){
    button.disabled = state;
    if (state){
      button.innerHTML = '<span class="loader-sm"></span>';
    } else {
      button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg><span>Proses tautan</span>';
    }
  }

  function showSuccess(link, provider){
    destinationUrl = link;
    statusBox.className = "result-status";
    statusBox.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span id="statusText">Bypass berhasil</span>';
    document.getElementById("statusText").textContent = "Bypass berhasil";
    providerBadge.textContent = provider;
    resultLink.href = link;
    resultLink.textContent = link;
    resultCard.style.display = "block";
  }

  function showError(msg){
    destinationUrl = "";
    statusBox.className = "result-status error";
    statusBox.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><span id="statusText"></span>';
    document.getElementById("statusText").textContent = msg;
    resultCard.style.display = "none";
  }

  function showLoading(msg){
    statusBox.className = "result-status loading";
    statusBox.innerHTML = '<span class="loader-sm"></span><span id="statusText"></span>';
    document.getElementById("statusText").textContent = msg;
    resultCard.style.display = "none";
  }

  async function bypass(){
    const url = input.value.trim();
    if (!url){ input.focus(); showToast("Masukin url dulu"); return; }
    try { new URL(url); } catch {
      result.classList.add("show");
      showError("URL tidak valid.");
      return;
    }

    setLoading(true);
    result.classList.remove("show");
    void result.offsetWidth;
    result.classList.add("show");
    showLoading("Memproses...");

    try {
      const res = await fetch("/api/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (!res.ok || !data.success){
        showError(data.error || "Bypass gagal.");
        return;
      }

      showSuccess(data.result, data.provider || "sfl");
      showToast("Bypass berhasil");

    } catch (err){
      showError(err.message || "Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text){ input.value = text.trim(); input.focus(); }
      else showToast("Clipboard kosong");
    } catch { showToast("Izin clipboard ditolak"); }
  });

  copyButton.addEventListener("click", async () => {
    if (!destinationUrl) return;
    try {
      await navigator.clipboard.writeText(destinationUrl);
      showToast("url disalin");
    } catch {
      const t = document.createElement("textarea");
      t.value = destinationUrl; document.body.appendChild(t);
      t.select(); document.execCommand("copy"); t.remove();
      showToast("url disalin");
    }
  });

  openButton.addEventListener("click", () => {
    if (!destinationUrl) return;
    try {
      const u = new URL(destinationUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      window.open(u.href, "_blank", "noopener,noreferrer");
    } catch {}
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); bypass(); }
  });
  button.addEventListener("click", bypass);
})();

(function obfuscateTool(){
  const API_BASE = "https://endpoint-zenn.vercel.app";

  const $in         = document.getElementById("obfInput");
  const $log        = document.getElementById("obfLog");
  const $run        = document.getElementById("runBtn");
  const $mode       = document.getElementById("modeSelect");
  const $file       = document.getElementById("fileInput");
  const $uploadText = document.getElementById("uploadText");
  const $inputMeta  = document.getElementById("inputMeta");
  const $status     = document.getElementById("obfStatus");

  let loadedFileName = null;

  function fmtBytes(n){
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }
  function updateMeta(){
    $inputMeta.textContent = fmtBytes(new Blob([$in.value]).size);
  }
  function setStatus(msg, type){
    $status.className = "obf-status" + (type === "ok" ? " ok" : type === "err" ? " err" : "");
    const icons = {
      info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      ok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      err: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      load: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    };
    $status.innerHTML = (icons[type] || icons.info) + '<span id="obfStatusText"></span>';
    document.getElementById("obfStatusText").textContent = msg;
  }
  function log(msg){
    const t = new Date().toLocaleTimeString("id-ID");
    $log.value += `[${t}] ${msg}\n`;
    $log.scrollTop = $log.scrollHeight;
  }
  function clearLog(){ $log.value = ""; }

  $in.addEventListener("input", () => {
    if (loadedFileName !== null){
      loadedFileName = null;
      $uploadText.innerHTML = '<strong>Upload file .lua</strong> — atau tempel kode di bawah';
    }
    updateMeta();
  });

  $file.addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".lua")){
      setStatus("Hanya file .lua yang diizinkan.", "err");
      $file.value = ""; return;
    }
    if (f.size > 1024 * 1024){
      setStatus("File terlalu besar (maks 1MB).", "err");
      $file.value = ""; return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      $in.value = ev.target.result;
      updateMeta();
      loadedFileName = f.name;
      $uploadText.innerHTML = `<strong>${f.name}</strong> — ${fmtBytes(f.size)}`;
      setStatus(`File dimuat: ${f.name}`, "ok");
    };
    reader.onerror = () => setStatus("Gagal membaca file.", "err");
    reader.readAsText(f);
  });

  async function apiObfuscate(script){
    const res = await fetch(`${API_BASE}/api/obfuscatezenn`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({script})
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error("Response bukan JSON: " + text.slice(0, 200)); }
    if (!res.ok || !data.success){
      throw new Error(data.error || data.detail || "Obfuscate gagal");
    }
    return data.obfuscated;
  }

  async function apiCompile(script, bits){
    const fd = new FormData();
    const blob = new Blob([script], {type:"text/plain"});
    fd.append("file", blob, loadedFileName || "input.lua");
    const compileUrl = bits === 64
      ? `${API_BASE}/api/zenn64bit`
      : `${API_BASE}/api/zenn32bit`;
    const res = await fetch(compileUrl, {method:"POST", body:fd});
    if (!res.ok){
      const errText = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(errText);
        msg = j.error || msg;
        if (j.stderr) msg += " | " + j.stderr.slice(0, 200);
      } catch {}
      throw new Error(msg);
    }
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }

  function createZip(files){
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const file of files){
      const nameBytes = encoder.encode(file.name);
      const data = file.data;

      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++){
        crc ^= data[i];
        for (let j = 0; j < 8; j++){
          crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
        }
      }
      crc = (crc ^ 0xFFFFFFFF) >>> 0;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      chunks.push(localHeader);
      chunks.push(data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      central.push(centralHeader);

      offset += localHeader.length + data.length;
    }

    const centralSize = central.reduce((a, c) => a + c.length, 0);

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const allChunks = [...chunks, ...central, eocd];
    const totalSize = allChunks.reduce((a, c) => a + c.length, 0);
    const result = new Uint8Array(totalSize);
    let pos = 0;
    for (const chunk of allChunks){
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  function downloadBytes(bytes, filename){
    const blob = new Blob([bytes], {type:"application/octet-stream"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function downloadText(text, filename){
    const blob = new Blob([text], {type:"text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function run(){
    const code = $in.value.trim();
    if (!code){ setStatus("Input masih kosong.", "err"); return; }
    const mode = $mode.value;

    $run.disabled = true;
    $mode.disabled = true;
    clearLog();
    setStatus("Memproses...", "load");

    const baseName = loadedFileName
      ? loadedFileName.replace(/\.lua$/i, "")
      : "output";

    try {
      let currentCode = code;
      let obfuscated = false;

      if (mode === "wd" || mode === "wd64" || mode === "wd32" || mode === "wd3264"){
        log("→ Obfuscate sedang di proses");
        currentCode = await apiObfuscate(code);
        obfuscated = true;
        log(`✓ Obfuscate berhasil (${fmtBytes(new Blob([currentCode]).size)})`);
      }

      if (mode === "c64" || mode === "wd64"){
        log("→ Compile 64-bit...");
        const bytes = await apiCompile(currentCode, 64);
        log(`✓ Compile 64-bit berhasil (${fmtBytes(bytes.length)})`);
        const name = obfuscated ? `${baseName}-64bit.luac` : `${baseName}-64bit.luac`;
        downloadBytes(bytes, name);
        log(`→ Download: ${name}`);
        setStatus(`Selesai. File: ${name}`, "ok");

      } else if (mode === "c32" || mode === "wd32"){
        log("→ Compile 32-bit...");
        const bytes = await apiCompile(currentCode, 32);
        log(`✓ Compile 32-bit berhasil (${fmtBytes(bytes.length)})`);
        const name = obfuscated ? `${baseName}-32bit.luac` : `${baseName}-32bit.luac`;
        downloadBytes(bytes, name);
        log(`→ Download: ${name}`);
        setStatus(`Selesai. File: ${name}`, "ok");

      } else if (mode === "wd3264"){
        log("→ Compile 64-bit...");
        const bytes64 = await apiCompile(currentCode, 64);
        log(`✓ Compile 64-bit berhasil (${fmtBytes(bytes64.length)})`);

        log("→ Compile 32-bit...");
        const bytes32 = await apiCompile(currentCode, 32);
        log(`✓ Compile 32-bit berhasil (${fmtBytes(bytes32.length)})`);

        log("→Sedang membuat zip");
        const zipBytes = createZip([
          { name: `${baseName}-64bit.luac`, data: bytes64 },
          { name: `${baseName}-32bit.luac`, data: bytes32 }
        ]);
        const zipName = `obfuscate-32-64bit.zip`;
        downloadBytes(zipBytes, zipName);
        log(`→ Download: ${zipName} (${fmtBytes(zipBytes.length)})`);
        setStatus(`Selesai. File: ${zipName}`, "ok");

      } else {
        const name = `${baseName}-obfuscateZenn.lua`;
        downloadText(currentCode, name);
        log(`→ Download: ${name}`);
        setStatus(`Obfuscate selesai. File: ${name}`, "ok");
      }
    } catch (e){
      log(`✗ Error: ${e.message}`);
      setStatus("Gagal: " + e.message, "err");
      console.error(e);
    } finally {
      $run.disabled = false;
      $mode.disabled = false;
    }
  }

  $run.addEventListener("click", run);
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter"){
      e.preventDefault();
      if (document.getElementById("page-tools").classList.contains("active") &&
          document.getElementById("tool-obfuscate").classList.contains("active")){
        run();
      }
    }
  });

  updateMeta();
})();