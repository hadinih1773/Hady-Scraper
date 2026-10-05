/***
 *** ᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁
 *** - Dev: FongsiDev
 *** - Contact: t.me/dashmodz
 *** - Gmail: fongsiapi@gmail.com & fgsidev@neko2.net
 *** - Group: chat.whatsapp.com/Ke94ex9fNLjE2h8QzhvEiy
 *** - Telegram Group: t.me/fongsidev
 *** - Github: github.com/Fgsi-APIs/RestAPIs/issues/new
 *** - Website: fgsi.koyeb.app
 *** ᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁᠁
 ***/

// Scraper By Fgsi

const axios = require("axios");
const cheerio = require("cheerio");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const { createWorker } = require("tesseract.js");
const sharp = require("sharp");

class DLBunnyClient {
  constructor() {
    this.apps = [
      { app: "tiktok", name: "🎵 TikTok", path: "/en", id: 1 },
      { app: "kuaishou", name: "📽️ Kuaishou", path: "/en/kuaishou", id: 5 },
      { app: "youtube", name: "🟥 YouTube", path: "/en/youtube", id: 2 },
      { app: "bilibili", name: "📺 BiliBili", path: "/en/bilibili", id: 3 },
      { app: "xiaohongshu", name: "📕 RedNote", path: "/en/xhs", id: 7 },
      { app: "twitter", name: "🐦 Twitter (X)", path: "/en/twitter", id: 9 },
      { app: "pinterest", name: "📌 Pinterest", path: "/en/pinterest", id: 10 },
      { app: "facebook", name: "🎭 Facebook", path: "/en/facebook", id: 8 },
      { app: "instagram", name: "📸 Instagram", path: "/en/instagram", id: 6 },
      { app: "suno", name: "💡 Suno AI", path: "/en/suno", id: 4 },
    ];

    this.jar = new CookieJar();
    this.worker = null;
    this.http = wrapper(
      axios.create({
        timeout: 1000 * 60 * 10,
        jar: this.jar,
        withCredentials: true,
        headers: {
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "accept-language": "ms-MY",
          "cache-control": "no-cache",
          pragma: "no-cache",
          priority: "i",
          "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "sec-fetch-dest": "image",
          "sec-fetch-mode": "no-cors",
          "sec-fetch-site": "same-origin",
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        },
      }),
    );
  }

  isNumberString(str) {
    return typeof str === "string" && /^[0-9]+$/.test(str);
  }

  async initOCR() {
    if (!this.worker) {
      this.worker = await createWorker("eng", 1);
      await this.worker.setParameters({
        tessedit_char_whitelist: "0123456789"
      });
    }
  }

  async getUUID() {
    const res = await this.http.get("https://dlbunny.com" + this.selected.path);
    const $ = cheerio.load(res.data);
    return $("#VerifyCaptchaIMG").attr("uuid");
  }

  async getCaptchaImage() {
    const res = await this.http.get("https://dlbunny.com/api/get_captcha", {
      params: { rand: "477", reload: "357" },
      responseType: "arraybuffer",
      timeout: 30000
    });
    return Buffer.from(res.data);
  }

  async preprocessCaptcha(buffer) {
    // Try multiple preprocessing strategies
    const strategies = [
      // Strategy 1: resize + greyscale + threshold
      async (buf) => await sharp(buf).resize({ width: 200, height: 80, fit: "fill" }).greyscale().threshold(128).png().toBuffer(),
      // Strategy 2: resize + greyscale + normalize
      async (buf) => await sharp(buf).resize({ width: 200, height: 80, fit: "fill" }).greyscale().normalize().png().toBuffer(),
      // Strategy 3: resize + threshold only
      async (buf) => await sharp(buf).resize({ width: 200, height: 80, fit: "fill" }).threshold(128).png().toBuffer(),
      // Strategy 4: original with just resize
      async (buf) => await sharp(buf).resize({ width: 200, height: 80, fit: "fill" }).png().toBuffer(),
    ];
    return strategies;
  }

  async solveCaptcha(buffer) {
    await this.initOCR();
    const strategies = await this.preprocessCaptcha(buffer);
    
    for (let i = 0; i < strategies.length; i++) {
      try {
        const processed = await strategies[i](buffer);
        const { data: { text } } = await this.worker.recognize(processed);
        const result = text.trim();
        if (result) return result;
      } catch (e) {
        // try next strategy
      }
    }
    return "";
  }

  async solveAuto(maxRetry = 20, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const captchaImage = await this.getCaptchaImage();
        const captchaText = (await this.solveCaptcha(captchaImage))?.trim();
        console.log(`[DEBUG] Attempt ${attempt}: OCR = "${captchaText}"`);
        if (captchaText && this.isNumberString(captchaText) && captchaText.length === 4) {
          return captchaText;
        }
      } catch (err) {
        console.log(`[DEBUG] Attempt ${attempt} error:`, err.message);
      }
      if (attempt < maxRetry) await new Promise(r => setTimeout(r, delayMs));
    }
    throw new Error("❌ OCR failed: could not retrieve valid captcha after max retries");
  }

  async createOrder({ uuid, url, format, captchaText }) {
    const res = await this.http.post(
      "https://dlbunny.com/api/create_oxy_order",
      {
        user_uuid_text: uuid,
        user_input_text: url,
        user_select_media_format: format,
        user_select_appid: this.selected.id,
        user_select_app: this.selected.path.split("/")[2],
        user_input_captcha_text: captchaText,
      },
    );
    return res.data;
  }

  async process({ app, url, format = "mp4" } = {}) {
    if (!app) throw new Error("❌ App choice is required!");
    this.selected = this.apps.find((a) => a.app === app);
    if (!this.selected) {
      throw new Error(`❌ App '${app}' not available! Choose: ${this.apps.map(a => a.app).join(", ")}`);
    }
    await this.initOCR();
    const uuid = await this.getUUID();
    const captchaText = await this.solveAuto();
    const result = await this.createOrder({ uuid, url, format, captchaText });
    return { uuid, captchaText, result };
  }
}

module.exports = { DLBunnyClient };

// Test
if (require.main === module) {
  (async () => {
    try {
      const client = new DLBunnyClient();
      const res = await client.process({
        app: "instagram",
        url: "https://www.instagram.com/reel/DTO7X2ND71d/?igsh=MWQyaXk3ZzRwM2Q4ZA==",
        format: "mp4",
      });
      console.log(JSON.stringify(res, null, 2));
    } catch (e) {
      console.error("Error:", e.message);
      if (e.response) console.error("Response:", e.response.data);
    }
  })();
}