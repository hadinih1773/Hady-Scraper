#!/usr/bin/env node
// Pemakaian:
//   node quote.js kelas fiq gokil. Panutan, ganggouii
//   node quote.js kelas fiq gokil. Panutan, ganggouii -b foto.jpg -o hasil.png
//
// Install dulu: npm install @napi-rs/canvas

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// ---------- Parse argumen ----------
const argv = process.argv.slice(2);
const opt = { author: '', bg: 'bg.jpg', out: 'quote.png' };
const words = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-b' || a === '--bg') opt.bg = argv[++i];
  else if (a === '-o' || a === '--out') opt.out = argv[++i];
  else words.push(a);
}

// Format: kata-kata, author  (author = teks setelah koma terakhir)
let text = words.join(' ').trim();
const koma = text.lastIndexOf(',');
if (koma !== -1) {
  const author = text.slice(koma + 1).trim();
  if (author) {
    opt.author = author;
    text = text.slice(0, koma).trim();
  }
}

if (!text) {
  console.log('Pemakaian: node quote.js kata-kata, author [-b foto.jpg] [-o output.png]');
  process.exit(1);
}

// ---------- Konfigurasi ----------
const W = 1200;
const H = 630;
const FONT = 'monospace';
const TEXT_X = 880;            // titik tengah area teks (kanan)
const TEXT_MAX_W = 520;        // lebar maksimal teks

// ---------- Helper ----------
function wrap(ctx, str, maxW) {
  const lines = [];
  let line = '';
  for (const word of str.split(/\s+/)) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function toGrayscale(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- Main ----------
(async () => {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background hitam
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Foto di sisi kiri (hitam putih, memudar ke hitam)
  if (opt.bg && fs.existsSync(opt.bg)) {
    const img = await loadImage(opt.bg);
    const areaW = 720;

    // cover-fit ke area kiri
    const scale = Math.max(areaW / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;

    const tmp = createCanvas(areaW, H);
    const tctx = tmp.getContext('2d');
    tctx.drawImage(img, (areaW - dw) / 2, (H - dh) / 2, dw, dh);
    toGrayscale(tmp);
    ctx.drawImage(tmp, 0, 0);

    // fade ke hitam
    const grad = ctx.createLinearGradient(180, 0, 600, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, areaW, H);
  } else {
    console.log(`(foto "${opt.bg}" tidak ditemukan, pakai background polos)`);
  }

  // Teks quote: perkecil font otomatis kalau terlalu panjang
  let size = 54;
  let lines;
  let lineH;
  do {
    ctx.font = `bold ${size}px ${FONT}`;
    lines = wrap(ctx, text, TEXT_MAX_W);
    lineH = size * 1.3;
    size -= 2;
  } while (lines.length * lineH > 340 && size > 20);

  const authorBlock = opt.author ? 90 : 0;
  const blockH = lines.length * lineH + authorBlock;
  let y = (H - blockH) / 2 + size * 0.9;

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const l of lines) {
    ctx.fillText(l, TEXT_X, y);
    y += lineH;
  }

  // Author
  if (opt.author) {
    ctx.font = `italic 28px ${FONT}`;
    ctx.fillText(`- ${opt.author}`, TEXT_X, y + 40);
  }

  // Watermark
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.fillText('Quote', W - 20, H - 20);

  fs.writeFileSync(opt.out, canvas.toBuffer('image/png'));
  console.log('Berhasil dibuat:', path.resolve(opt.out));
})();
