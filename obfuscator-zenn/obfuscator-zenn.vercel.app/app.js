let uploadedType = null;
let uploadedFileName = null;
let lastBlob = null;
let lastFilename = 'Obfuscate-by-Zenn.lua';
let isTurnstileVerified = false;

function closeModal() {
    document.getElementById('disclaimerModal').classList.add('hidden');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

function onTurnstileSuccess(token) {
    isTurnstileVerified = true;
    console.log('✅ Turnstile verified');
}

function onTurnstileExpired() {
    isTurnstileVerified = false;
    console.log('❌ Turnstile expired');
}

function uploadFile(event) {
    const file = event.target.files[0];
    if (!file) { showToast('Gak ada file yang dipilih!'); return; }

    uploadedFileName = file.name;
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) uploadedType = 'html';
    else if (fileName.endsWith('.lua')) uploadedType = 'lua';
    else uploadedType = null;

    document.getElementById('fileInfo').textContent =
        ' ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('sourceCode').value = e.target.result;
        showToast('File "' + file.name + '" berhasil diupload!');
    };
    reader.onerror = function() { showToast('Gagal membaca file!'); };
    reader.readAsText(file);
    event.target.value = '';
}

async function processObfuscate() {
    const source = document.getElementById('sourceCode').value;
    const errorMsg = document.getElementById('errorMsg');
    const btn = document.getElementById('obfBtn');

    if (source.trim() === "") {
        errorMsg.style.display = 'block';
        return;
    }
    errorMsg.style.display = 'none';

    const tokenEl = document.querySelector('[name="cf-turnstile-response"]');
    const turnstileToken = tokenEl ? tokenEl.value : '';

    if (!turnstileToken || !isTurnstileVerified) {
        showToast('⚠️ Selesaikan verifikasi Cloudflare dulu!');
        return;
    }

    let mode = 'lua';
    if (uploadedType === 'html') mode = 'html';
    else if (uploadedType === 'lua') mode = 'lua';
    else if (source.trim().startsWith('<')) mode = 'html';

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
        const res = await fetch('/api/obfuscate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source, mode, turnstileToken })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Server error: ' + res.status);
        }

        const data = await res.json();
        if (!data.result) throw new Error('Response tidak valid');

        const bytes = new Uint8Array(data.result.length);
        for (let i = 0; i < data.result.length; i++) {
            bytes[i] = data.result.charCodeAt(i) & 0xFF;
        }
        lastBlob = new Blob([bytes], { type: 'application/octet-stream' });

        if (uploadedFileName) {
            const baseName = uploadedFileName.replace(/\.[^.]+$/, '');
            lastFilename = baseName + '_obf.' + (mode === 'html' ? 'html' : 'lua');
        } else {
            lastFilename = 'Obfuscate-by-Zenn.' + (mode === 'html' ? 'html' : 'lua');
        }

        showToast('✅ Obfuscate berhasil! Klik Download .' + (mode === 'html' ? 'html' : 'lua'));

    } catch (e) {
        showToast('Error: ' + e.message);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-microchip"></i> Obfuscate Now';
    }
}

function downloadResult() {
    if (!lastBlob) {
        showToast('Belum ada hasil. Klik Obfuscate dulu.');
        return;
    }
    const url = URL.createObjectURL(lastBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lastFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ File downloaded: ' + lastFilename);
}

function clearFields() {
    document.getElementById('sourceCode').value = "";
    document.getElementById('errorMsg').style.display = 'none';
    document.getElementById('fileInfo').textContent = 'Belum ada file';
    document.getElementById('fileInput').value = '';
    uploadedType = null;
    uploadedFileName = null;
    lastBlob = null;
    if (window.turnstile) window.turnstile.reset();
    isTurnstileVerified = false;
    showToast('Semua dibersihkan!');
}

document.getElementById('disclaimerModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

document.addEventListener('DOMContentLoaded', function() {
    const audio = document.getElementById('bgMusic');
    if (!audio) return;

    audio.play().catch(function(error) {
        console.log('Autoplay di-block, klik sembarang tempat untuk memutar.');
        document.addEventListener('click', function playOnce() {
            audio.play();
            document.removeEventListener('click', playOnce);
        });
    });

    audio.addEventListener('ended', function() {
        audio.currentTime = 0;
        audio.play();
    });
});