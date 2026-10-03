const { 
    EmbedBuilder, 
    PermissionsBitField, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");
const axios = require("axios");
const FormData = require("form-data");
const { load } = require("cheerio");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const dns = require("dns");
const querystring = require("querystring");
const yts = require("yt-search");

// Set DNS servers to Google public DNS and Cloudflare DNS
dns.setServers(['8.8.8.8', '1.1.1.1']);

const axiosClient = axios.create({
    timeout: 0, 
    httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: Infinity,
        maxFreeSockets: 256,
        scheduling: 'fifo',
        rejectUnauthorized: false 
    }),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
});

const CHANNEL_YOUTUBE = "1455010333738533019";
const CHANNEL_TIKTOK = "1455010223764017265";
const CHANNEL_SPOTIFY = "1455016183643504783";
const CHANNEL_BOOMBOX_RANDOM = "1455010588932702248";
const CHANNEL_TOP4TOP_LOG = "1377861948913221702";
const EMERALD_COLOR = "#50C878";
const LOADING_GIF = "https://cdn.discordapp.com/attachments/1382265549706236035/1522971776269947022/HADY_COMMUNITY_20260704_212509_0000.gif?ex=6a83c2be&is=6a82713e&hm=9a4272c776e84641d5adcec8520424617487b24737cfd9f27b6ea5620258a321&";

const dbPath = path.join(__dirname, "../database/bbchannel.json");
const boomboxDbPath = path.join(__dirname, "../database/boombox.json");
const favDbPath = path.join(__dirname, "../database/bbfav.json");

if (!fs.existsSync(path.join(__dirname, "../database"))) fs.mkdirSync(path.join(__dirname, "../database"));
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ channels: [] }));
if (!fs.existsSync(boomboxDbPath)) fs.writeFileSync(boomboxDbPath, JSON.stringify([]));
if (!fs.existsSync(favDbPath)) fs.writeFileSync(favDbPath, JSON.stringify({}));

// Helper Safe JSON Read
function safeReadJSON(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(filePath)) return fallbackValue;
        const data = fs.readFileSync(filePath, "utf8");
        return JSON.parse(data);
    } catch (e) {
        console.error(`[ERROR JSON] Gagal membaca ${filePath}:`, e.message);
        return fallbackValue;
    }
}

let ownerId = "";
try {
    const ownerData = safeReadJSON(path.join(__dirname, "../database/owner.json"), {});
    ownerId = ownerData.owner || "";
} catch (e) { console.error("[ERROR] owner.json:", e.message); }

/* ================= UTILS ================= */
function customLookup(hostname, opts, callback) {
  dns.resolve4(hostname, (err, addresses) => {
    if (err || !addresses || addresses.length === 0) {
      dns.lookup(hostname, opts, callback);
    } else {
      if (opts.all) {
        callback(null, addresses.map(ip => ({ address: ip, family: 4 })));
      } else {
        callback(null, addresses[0], 4);
      }
    }
  });
}

function makeRequest(urlStr, method, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      lookup: customLookup,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function extractVideoId(url) {
  if (url.length === 11 && /^[\w-]+$/.test(url)) return url;
  const match = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function fetchMetadata(videoId) {
  return new Promise((resolve) => {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    makeRequest(oembedUrl, 'GET')
      .then((res) => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(res.body);
            resolve({
              title: data.title || '',
              thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            });
          } catch (e) {
            resolve({
              title: '',
              thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            });
          }
        } else {
          resolve({
            title: '',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          });
        }
      })
      .catch(() => {
        resolve({
          title: '',
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        });
      });
  });
}

async function streamToBuffer(url) {
    const response = await axiosClient.get(url, { 
        responseType: 'stream',
        timeout: 0,
        headers: {
            "Referer": "https://googlevideo.com/",
            "Origin": "https://googlevideo.com/"
        }
    });
    return new Promise((resolve, reject) => {
        const chunks = [];
        response.data.on('data', (chunk) => chunks.push(chunk));
        response.data.on('end', () => resolve(Buffer.concat(chunks)));
        response.data.on('error', (err) => reject(err));
    });
}

async function uploadTop4Top(buffer, filename = 'file.mp3') {
    const form = new FormData();
    form.append('file_0_', buffer, { filename, contentType: 'audio/mpeg' });
    form.append('submitr', '[ رفع الملفات ]');
    const response = await axiosClient.post('https://top4top.io/index.php', form, { 
        timeout: 0,
        headers: { ...form.getHeaders() } 
    });
    const html = response.data;
    const $ = load(html);
    let link = $('input.all_boxes').first().val() || 
               $('input[readonly]').first().val() ||
               $('.alert-success a').attr('href') || 
               $('a[href*="top4top.io"]').attr('href') ||
               html.match(/https?:\/\/[a-z0-9]+\.top4top\.io\/[a-z0-9_]+\.(mp3|wav|ogg)/gi)?.[0] ||
               html.match(/https?:\/\/top4top\.io\/download-[^"]+/gi)?.[0];

    if (!link) throw new Error('Link Top4Top tidak ditemukan');
    return link.replace(/^https:/, 'http:');
}

/* ================= DOWNLOADERS (UPDATED) ================= */
async function getYoutubeBuffer(link) {
    const videoId = extractVideoId(link);
    if (!videoId) throw new Error("URL atau Video ID YouTube tidak valid.");

    const meta = await fetchMetadata(videoId);
    
    const keyHeaders = {
      'Content-Type': 'application/json',
      'Origin': 'https://frame.y2meta-uk.com',
      'Referer': `https://frame.y2meta-uk.com/wwwindex.php?videoId=${videoId}`
    };
    
    const keyRes = await makeRequest(`https://cnv.cx/v2/sanity/key?id=${videoId}`, 'GET', keyHeaders);
    if (keyRes.statusCode !== 200) {
      throw new Error(`Sanity key API error status ${keyRes.statusCode}`);
    }

    const keyData = JSON.parse(keyRes.body);
    const sanityKey = keyData.key;
    if (!sanityKey) throw new Error('Session key tidak ditemukan.');

    const convertBody = querystring.stringify({
      link: 'https://youtu.be/' + videoId,
      format: 'mp3',
      audioBitrate: 320,
      videoQuality: 720,
      filenameStyle: 'pretty',
      vCodec: 'h264'
    });

    const convertHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'accept': '*/*',
      'key': sanityKey,
      'Content-Length': Buffer.byteLength(convertBody),
      'Origin': 'https://frame.y2meta-uk.com',
      'Referer': `https://frame.y2meta-uk.com/wwwindex.php?videoId=${videoId}`
    };

    const convertRes = await makeRequest('https://cnv.cx/v2/converter', 'POST', convertHeaders, convertBody);
    if (convertRes.statusCode !== 200) {
      throw new Error(`Converter API error status ${convertRes.statusCode}`);
    }

    const convertData = JSON.parse(convertRes.body);
    let downloadUrl = convertData && convertData.url ? convertData.url : 'https://conv.mp3youtube.cc/download/' + videoId;

    const buffer = await streamToBuffer(downloadUrl);

    return { 
        buffer, 
        title: meta.title || "Untitled Video", 
        thumbnail: meta.thumbnail, 
        duration: "-", 
        views: "-", 
        channel: "-" 
    };
}

/* ================= TIKTOK (integrated from tikwm.js) ================= */
/**
 * tikwm.js  @~T Scraper TikTok via tikwm.com
 *
 * Pemakaian sebagai module (untuk bot):
 *   const tikwm = require('./bb2').tikwm;
 *
 *   // Semua info
 *   const info = await tikwm('https://www.tiktok.com/@user/video/123');
 *   info.music   -> URL audio/mp3
 *   info.video   -> URL video tanpa watermark
 *   info.videoHD -> URL video HD tanpa watermark
 *
 *   // Shortcut
 *   await tikwm.music('https://www.tiktok.com/@user/video/123');  // { url, title, cover, author }
 *   await tikwm.video('https://www.tiktok.com/@user/video/123');  // { url, hd, wm, title, cover }
 */

const TIKWM_API = 'https://tikwm.com/api/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// tikwm kadang balikin path relatif (mis. "/video/tos/...")
const abs = (u) => (u ? (u.startsWith('http') ? u : 'https://www.tikwm.com' + u) : null);

async function request(url, { hd = true, timeout = 60000 } = {}) {
    const { data } = await axiosClient.get(TIKWM_API, {
        params: { url, hd: hd ? 1 : 0 },
        timeout,
        headers: { 'User-Agent': UA }
    });
    if (data.code !== 0 || !data.data) {
        throw new Error(data.msg || 'Gagal mengambil data TikTok');
    }
    return data.data;
}

function normalize(d) {
    return {
        id: d.id,
        title: d.title || '-',
        duration: d.duration,
        taken_at: d.taken_at,
        video: abs(d.play),        // tanpa watermark
        videoHD: abs(d.hdplay),    // HD tanpa watermark
        videoWM: abs(d.wmplay),    // dengan watermark
        music: abs(d.music),       // audio mp3
        cover: abs(d.cover),
        originCover: abs(d.origin_cover),
        musicCover: abs(d.music_cover),
        author: {
            username: d.author?.unique_id || '-',
            nickname: d.author?.nickname || '-',
            avatar: abs(d.author?.avatar)
        },
        stats: {
            views: d.play_count || 0,
            likes: d.digg_count || 0,
            comments: d.comment_count || 0,
            shares: d.share_count || 0
        }
    };
}

/**
 * Ambil semua info dari satu video TikTok.
 * @param {string} url  Link TikTok (www.tiktok.com/.../video/... atau vt.tiktok.com/...)
 * @param {object} opts { hd: boolean, timeout: number }
 */
async function tikwm(url, opts) {
    if (!url || !/tiktok\.com/i.test(url)) {
        throw new Error('URL TikTok tidak valid');
    }
    return normalize(await request(url, opts));
}

/** Audio/mp3 saja  @~T praktis buat fitur play/lagu di bot */
tikwm.music = async function (url, opts) {
    const info = await tikwm(url, opts);
    return {
        title: info.title,
        url: info.music,
        cover: info.musicCover || info.cover,
        duration: info.duration,
        author: info.author.nickname,
        views: info.stats.views
    };
};

/** Video saja  @~T url = tanpa watermark, hd = versi HD, wm = dengan watermark */
tikwm.video = async function (url, opts) {
    const info = await tikwm(url, opts);
    return {
        title: info.title,
        url: info.video,
        hd: info.videoHD,
        wm: info.videoWM,
        cover: info.cover,
        duration: info.duration,
        author: info.author.nickname,
        stats: info.stats
    };
};

// Alias for backward compatibility
async function internalTikTokDl(url) {
    const info = await tikwm.music(url);
    return { 
        link: info.url, 
        title: info.title, 
        cover: info.cover, 
        duration: info.duration,
        views: info.views, 
        like: '-', 
        author: info.author 
    };
}

async function internalTikTokVideoDl(url) {
    return await tikwm.video(url);
}

async function internalSpotifyDl(url) {
    const { data } = await axiosClient.get(`https://api.nexray.web.id/downloader/spotify?url=${encodeURIComponent(url)}`, { timeout: 60000 });
    if (!data.status || !data.result) throw new Error("Gagal mengambil data Spotify.");
    const d = data.result;

    return { 
        link: d.url, 
        title: d.title, 
        artist: d.artist || "-", 
        duration: "-", 
        thumbnail: "-" 
    };
}

/* ================= EMBEDS & COMPONENTS ================= */
function buildResultComponents(top4topUrl) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Open Link")
                .setStyle(ButtonStyle.Link)
                .setURL(top4topUrl),
            new ButtonBuilder()
                .setCustomId("fav_add")
                .setLabel("Tambah Ke Favorit")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel("Invite Bot")
                .setStyle(ButtonStyle.Link)
                .setURL("https://discord.com/oauth2/authorize?client_id=1478220003609415691&permissions=8&integration_type=0&scope=bot"),
            new ButtonBuilder()
                .setLabel("Donasi")
                .setStyle(ButtonStyle.Link)
                .setURL("https://cdn.discordapp.com/attachments/1382265549706236035/1511279044870672424/IMG_20260411_194210.png?ex=6a83690a&is=6a82178a&hm=3cc06d9c110b6d5c5f0ab7a5d6348dfe7a874816467b7f1b064f89055e2ebf27&")
        )
    ];
}

function embedYouTube(result) {
    const embed = new EmbedBuilder()
        .setColor(EMERALD_COLOR)
        .setTitle("✅ Audio Berhasil Diproses!")
        .setDescription(`<@${result.userId}> Done Bro 😎!\n\n**🎵 Judul**\n${result.title}\n\n**🕕 Durasi**\n${result.duration}\n\n**👀 Views**\n${result.views}\n\n**👤 Channel**\n${result.channel}\n\n**🔗 Top4Top**\n${result.top4top}\n\n📢 Kalau Tidak Ada Suara Request Ulang Saja`)
        .setTimestamp();
    if (result.thumb && result.thumb.startsWith('http')) embed.setImage(result.thumb);
    return embed;
}

function embedTikTok(result) {
    const embed = new EmbedBuilder()
        .setColor(EMERALD_COLOR)
        .setTitle("✅ Audio Berhasil Diproses!")
        .setDescription(`<@${result.userId}> Done Bro 😎!\n\n**🎵 Judul**\n${result.title}\n\n**👀 Views**\n${result.views}\n\n**❤ Likes**\n${result.like}\n\n**👤 Channel**\n${result.channel}\n\n**🔗 Top4Top**\n${result.top4top}\n\n📢 Kalau Tidak Ada Suara Request Ulang Saja`)
        .setTimestamp();
    if (result.thumb && result.thumb.startsWith('http')) embed.setImage(result.thumb);
    return embed;
}

function embedSpotify(result) {
    const embed = new EmbedBuilder()
        .setColor(EMERALD_COLOR)
        .setTitle("✅ Audio Berhasil Diproses!")
        .setDescription(`<@${result.userId}> Done Bro 😎!\n\n**🎵 Judul**\n${result.title}\n\n**🕕 Durasi**\n${result.duration}\n\n**👤 Artis**\n${result.artist}\n\n**🔗 Top4Top**\n${result.top4top}\n\n📢 Kalau Tidak Ada Suara Request Ulang Saja`)
        .setTimestamp();
    if (result.thumb && result.thumb.startsWith('http')) embed.setImage(result.thumb);
    return embed;
}

/* ================= MODULE SETUP ================= */
module.exports = {
    // TikTok downloader (tikwm API)
    tikwm,
    tikwm: tikwm,

    // Definisi Slash Command Data
    data: [
        new SlashCommandBuilder()
            .setName("boombox")
            .setDescription("Pengaturan channel boombox (Hanya Owner Bot).")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Sembunyikan dari member biasa
            .addSubcommand(subcommand =>
                subcommand
                    .setName("setup")
                    .setDescription("Add Active Boombox Channel")
                    .addChannelOption(option => 
                        option.setName("channel")
                            .setDescription("Pilih channel yang ingin diset (Kosongkan jika channel saat ini)")
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName("delete")
                    .setDescription("Delete Active Boombox Channel")
                    .addChannelOption(option => 
                        option.setName("channel")
                            .setDescription("Pilih channel yang ingin dihapus (Kosongkan jika channel saat ini)")
                            .setRequired(false)
                    )
            ),
        new SlashCommandBuilder()
            .setName("bbfav")
            .setDescription("Melihat Url Favorit Top4Top"),
        new SlashCommandBuilder()
            .setName("bbplaylist")
            .setDescription("Melihat daftar lagu yang sudah diproses")
    ],

    setup(client) {
        // HANDLER UNTUK SLASH COMMANDS & BUTTON FAVORIT
        (client._interactionHandlers = client._interactionHandlers || []).push(async (interaction) => {
            // Handler untuk Button "Tambah Ke Favorit"
            if (interaction.isButton() && interaction.customId === "fav_add") {
                const messageEmbed = interaction.message.embeds[0];
                if (!messageEmbed || !messageEmbed.description) {
                    return interaction.reply({ content: "❌ Gagal mengambil data favorit.", ephemeral: true });
                }

                const desc = messageEmbed.description;
                const titleMatch = desc.match(/\*\*🎵 Judul\*\*\n([^\n]+)/);
                const top4topMatch = desc.match(/\*\*🔗 Top4Top\*\*\n([^\n]+)/);

                let originalUrl = "-";
                const boomboxDb = safeReadJSON(boomboxDbPath, []);
                if (top4topMatch) {
                    const found = boomboxDb.find(i => i.top4top === top4topMatch[1].trim());
                    if (found) originalUrl = found.originalUrl;
                }

                const favData = {
                    title: titleMatch ? titleMatch[1].trim() : "Unknown Title",
                    convertUrl: originalUrl,
                    top4topUrl: top4topMatch ? top4topMatch[1].trim() : "-"
                };

                let favDb = safeReadJSON(favDbPath, {});
                if (!favDb[interaction.user.id]) favDb[interaction.user.id] = [];

                const isExist = favDb[interaction.user.id].some(item => item.top4topUrl === favData.top4topUrl);
                if (!isExist) {
                    favDb[interaction.user.id].push(favData);
                    fs.writeFileSync(favDbPath, JSON.stringify(favDb, null, 2));
                }

                return interaction.reply({
                    content: `✅ <@${interaction.user.id}> Berhasil Menambah Ke Favorit. Gunakan Slash Command \`/bbfav\` Untuk Melihat Url Favorit`,
                    ephemeral: true
                });
            }

            if (!interaction.isChatInputCommand()) return;

            // Handler Slash Command /bbfav
            if (interaction.commandName === "bbfav") {
                const favDb = safeReadJSON(favDbPath, {});
                const userFavs = favDb[interaction.user.id] || [];

                if (userFavs.length === 0) {
                    const emptyEmbed = new EmbedBuilder()
                        .setColor("Blue")
                        .setAuthor({ 
                            name: `${interaction.user.username} | Favorit Url Top4Top`, 
                            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setDescription(`Total Favorit : 0\n\n*Belum ada favorit yang tersimpan.*`);
                    return interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
                }

                const itemsPerPage = 5;
                const totalPages = Math.ceil(userFavs.length / itemsPerPage);
                let currentPage = 0;

                const getPlatformName = (url) => {
                    if (/spotify/i.test(url)) return "Spotify";
                    if (/tiktok/i.test(url)) return "TikTok";
                    if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
                    return "Link";
                };

                const generateFavEmbed = (page) => {
                    const start = page * itemsPerPage;
                    const end = start + itemsPerPage;
                    const currentItems = userFavs.slice(start, end);

                    let listStr = "";
                    currentItems.forEach((item, index) => {
                        const platform = getPlatformName(item.convertUrl);
                        listStr += `${start + index + 1}. **${item.title}**\n🔗 Url Convert : [${platform}](${item.convertUrl})\n📼 Url Top4Top : [Top4Top](${item.top4topUrl})\n`;
                    });

                    return new EmbedBuilder()
                        .setColor("Blue")
                        .setAuthor({ 
                            name: `${interaction.user.username} | Favorit Url Top4Top`, 
                            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setDescription(`Total Favorit : ${userFavs.length}\n\n${listStr.trim()}`);
                };

                const generateButtons = (page) => {
                    return new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("fav_first").setLabel("⏮️ First").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                        new ButtonBuilder().setCustomId("fav_prev").setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                        new ButtonBuilder().setCustomId("fav_page_info").setLabel(`Page ${page + 1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                        new ButtonBuilder().setCustomId("fav_next").setLabel("➡️ Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
                        new ButtonBuilder().setCustomId("fav_last").setLabel("⏭️ Last").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
                    );
                };

                const replyMsg = await interaction.reply({
                    embeds: [generateFavEmbed(currentPage)],
                    components: [generateButtons(currentPage)],
                    ephemeral: true,
                    fetchReply: true
                });

                const collector = replyMsg.createMessageComponentCollector({
                    filter: (i) => i.user.id === interaction.user.id,
                    time: 120000
                });

                collector.on("collect", async (i) => {
                    if (i.customId === "fav_first") currentPage = 0;
                    else if (i.customId === "fav_prev") currentPage = Math.max(0, currentPage - 1);
                    else if (i.customId === "fav_next") currentPage = Math.min(totalPages - 1, currentPage + 1);
                    else if (i.customId === "fav_last") currentPage = totalPages - 1;

                    await i.update({
                        embeds: [generateFavEmbed(currentPage)],
                        components: [generateButtons(currentPage)]
                    });
                });
                return;
            }

            // Handler Slash Command /bbplaylist
            if (interaction.commandName === "bbplaylist") {
                const boomboxDb = safeReadJSON(boomboxDbPath, []);

                if (!boomboxDb || boomboxDb.length === 0) {
                    const emptyEmbed = new EmbedBuilder()
                        .setColor(EMERALD_COLOR)
                        .setTitle("🎶 Daftar Lagu Yang Sudah Diproses")
                        .setDescription(`Total Lagu : 0\n\n*Belum ada lagu yang diproses.*`);
                    return interaction.reply({ embeds: [emptyEmbed] });
                }

                const itemsPerPage = 5;
                const totalPages = Math.ceil(boomboxDb.length / itemsPerPage);
                let currentPage = 0;

                const generatePlaylistEmbed = (page) => {
                    const start = page * itemsPerPage;
                    const end = start + itemsPerPage;
                    const currentItems = boomboxDb.slice(start, end);

                    let listStr = "";
                    currentItems.forEach((item, index) => {
                        listStr += `${start + index + 1}. **${item.title}**\n🔗 [Top4Top](${item.top4top})\n`;
                    });

                    return new EmbedBuilder()
                        .setColor(EMERALD_COLOR)
                        .setTitle("🎶 Daftar Lagu Yang Sudah Diproses")
                        .setDescription(`Total Lagu : ${boomboxDb.length}\n\n${listStr.trim()}`);
                };

                const generatePlaylistButtons = (page) => {
                    return new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("pl_first").setLabel("⏮️ First").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                        new ButtonBuilder().setCustomId("pl_prev").setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                        new ButtonBuilder().setCustomId("pl_page_info").setLabel(`Page ${page + 1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                        new ButtonBuilder().setCustomId("pl_next").setLabel("➡️ Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
                        new ButtonBuilder().setCustomId("pl_last").setLabel("⏭️ Last").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
                    );
                };

                const replyMsg = await interaction.reply({
                    embeds: [generatePlaylistEmbed(currentPage)],
                    components: [generatePlaylistButtons(currentPage)],
                    fetchReply: true
                });

                const collector = replyMsg.createMessageComponentCollector({
                    filter: (i) => i.user.id === interaction.user.id,
                    time: 120000
                });

                collector.on("collect", async (i) => {
                    if (i.customId === "pl_first") currentPage = 0;
                    else if (i.customId === "pl_prev") currentPage = Math.max(0, currentPage - 1);
                    else if (i.customId === "pl_next") currentPage = Math.min(totalPages - 1, currentPage + 1);
                    else if (i.customId === "pl_last") currentPage = totalPages - 1;

                    await i.update({
                        embeds: [generatePlaylistEmbed(currentPage)],
                        components: [generatePlaylistButtons(currentPage)]
                    });
                });
                return;
            }

            // Handler Slash Command /boombox
            if (interaction.commandName !== "boombox") return;

            // Proteksi: Bisa diakses oleh Owner maupun Admin
            const isOwner = interaction.user.id === ownerId;
            const isAdmin = interaction.member && interaction.member.permissions && interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            if (!isOwner && !isAdmin) {
                return interaction.reply({ content: "❌ Hanya Owner Yang Bisa Gunakan", ephemeral: true });
            }

            const subcommand = interaction.options.getSubcommand();
            const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
            let db = safeReadJSON(dbPath, { channels: [] });

            if (subcommand === "setup") {
                if (!db.channels.includes(targetChannel.id)) {
                    db.channels.push(targetChannel.id);
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    return interaction.reply({ content: `✅ Channel ${targetChannel} berhasil di set.` });
                } else {
                    return interaction.reply({ content: `⚠️ Channel ${targetChannel} sudah terdaftar sebelumnya.`, ephemeral: true });
                }
            }

            if (subcommand === "delete") {
                if (db.channels.includes(targetChannel.id)) {
                    db.channels = db.channels.filter(id => id !== targetChannel.id);
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                    return interaction.reply({ content: `✅ Channel ${targetChannel} dihapus.` });
                } else {
                    return interaction.reply({ content: `⚠️ Channel ${targetChannel} tidak ditemukan di database.`, ephemeral: true });
                }
            }
        });

        // HANDLER UNTUK MESSAGE BASED (PREFIX COMMAND & AUTO DOWNLOAD)
        (client._msgHandlers = client._msgHandlers || []).push(async (message) => {
            if (message.author.bot || !message.guild) return;
            const content = message.content.trim();
            const args = content.split(/\s+/);
            const command = args[0].toLowerCase();
            let db = safeReadJSON(dbPath, { channels: [] });
            
            const getLoadingEmbed = () => new EmbedBuilder().setColor("Blue").setTitle("🔄 Sedang Di Proses...").setDescription("⌛ Sedang Mendownload Audio").setImage(LOADING_GIF).setFooter({ text: "Create By HC | Helper" });
            const checkDatabase = (url) => {
                const boomboxDb = safeReadJSON(boomboxDbPath, []);
                return boomboxDb.find(item => item.originalUrl === url);
            };
            const sendFromDb = async (data, msg) => {
                const embed = new EmbedBuilder()
                    .setColor("Blue")
                    .setTitle("🗂 Audio Pernah Diproses")
                    .setDescription(`> Audio ini sudah pernah diproses sebelumnya.\n> Gunakan Command \`!reconv [url]\` Untuk Mengulang Konversi Url\n\n**🎵 Judul**\n${data.title}\n\n**📎 Link Convert**\n${data.originalUrl}\n\n**🔗 Top4Top**\n${data.top4top}\n\n**👤 Diproses Oleh**\n<@${data.userId}>\n\n**📆 Tanggal**\n${data.date}`)
                    .setFooter({ text: "Create By HC | Helper!!" });
                if (data.thumb && data.thumb.startsWith('http')) embed.setImage(data.thumb);
                const comps = buildResultComponents(data.top4top);
                if (msg) return await msg.edit({ embeds: [embed], components: comps });
                return await message.reply({ embeds: [embed], components: comps });
            };

            // FITUR CONVERT FILE AUDIO / VIDEO KE TOP4TOP (TANPA MASUK BOOMBOX.JSON)
            if (message.attachments.size > 0) {
                const allowedAttachmentChannels = [
                    CHANNEL_BOOMBOX_RANDOM,
                    ...(db.channels || [])
                ];

                if (allowedAttachmentChannels.includes(message.channel.id)) {
                const mediaAttachment = message.attachments.find(att => {
                    const contentType = att.contentType || "";
                    const name = att.name ? att.name.toLowerCase() : "";
                    return contentType.startsWith("audio/") || 
                           contentType.startsWith("video/") || 
                           /\.(mp3|wav|ogg|m4a|flac|aac|mp4|mkv|mov|avi|webm)$/i.test(name);
                });

                if (mediaAttachment) {
                    const loadingMsg = await message.reply({ embeds: [getLoadingEmbed()] });
                    try {
                        const fileBuffer = await streamToBuffer(mediaAttachment.url);
                        const fileName = mediaAttachment.name || "media_file.mp3";
                        const safeTitle = fileName.replace(/[^\w\s.-]/gi, '');
                        const top4topLink = await uploadTop4Top(fileBuffer, safeTitle);

                        try {
                            const logChannel = client.channels.cache.get(CHANNEL_TOP4TOP_LOG) || await client.channels.fetch(CHANNEL_TOP4TOP_LOG).catch(() => null);
                            if (logChannel) {
                                await logChannel.send(`${fileName}\n\n${top4topLink}`);
                            }
                        } catch (e) {
                            console.error("[ERROR] Gagal mengirim log Top4Top:", e.message);
                        }

                        const resultEmbed = new EmbedBuilder()
                            .setColor(EMERALD_COLOR)
                            .setTitle("✅ Audio Berhasil Diproses!")
                            .setDescription(`<@${message.author.id}> Done Bro 😎!\n\n**🎵 Judul**\n${fileName}\n\n**🔗 Top4Top**\n${top4topLink}\n\n📢 Kalau Tidak Ada Suara Request Ulang Saja`)
                            .setTimestamp();

                        return await loadingMsg.edit({ embeds: [resultEmbed], components: buildResultComponents(top4topLink) });
                    } catch (e) {
                        return await loadingMsg.edit({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Gagal: ${e.message}`)] });
                    }
                }
                }
            }

            const processMedia = async (input, isQuery = false, originalInput, forceReconv = false, skipDbCheck = false, saveToDb = true) => {
                let finalBuffer, finalTitle, thumb, platform = "Search", targetUrl = input, extraData = {};
                const isYtCheck = /youtube\.com|youtu\.be/.test(input);
                const isSpCheck = /spotify/i.test(input);
                const isTtCheck = /tiktok/i.test(input);

                if (isSpCheck) {
                    const res = await internalSpotifyDl(input);
                    finalBuffer = await streamToBuffer(res.link);
                    finalTitle = res.title; thumb = res.thumbnail; platform = "Spotify";
                    extraData = { duration: res.duration, artist: res.artist };
                } else if (isYtCheck || isQuery) {
                    targetUrl = input;
                    const ytRes = await getYoutubeBuffer(targetUrl);
                    finalBuffer = ytRes.buffer; finalTitle = ytRes.title; thumb = ytRes.thumbnail; platform = "YouTube";
                    extraData = { duration: ytRes.duration, views: ytRes.views, channel: ytRes.channel };
                } else if (isTtCheck) {
                    const res = await internalTikTokDl(input);
                    finalBuffer = await streamToBuffer(res.link);
                    finalTitle = res.title; thumb = res.cover; platform = "TikTok";
                    extraData = { views: res.views, like: res.like, channel: res.author };
                }

                const safeTitle = (finalTitle || "audio").replace(/[^\w\s.-]/gi, '');
                const top4topLink = await uploadTop4Top(finalBuffer, `${safeTitle}.mp3`);
                const newData = { title: finalTitle, originalUrl: originalInput, top4top: top4topLink, thumb, platform, userId: message.author.id, guildId: message.guild.id, date: new Date().toLocaleString("id-ID"), ...extraData };
                
                // Kirim notifikasi judul & top4top ke channel tujuan
                try {
                    const logChannel = client.channels.cache.get(CHANNEL_TOP4TOP_LOG) || await client.channels.fetch(CHANNEL_TOP4TOP_LOG).catch(() => null);
                    if (logChannel) {
                        await logChannel.send(`${finalTitle}\n\n${top4topLink}`);
                    }
                } catch (e) {
                    console.error("[ERROR] Gagal mengirim log Top4Top:", e.message);
                }

                if (saveToDb) {
                    let boomboxDb = safeReadJSON(boomboxDbPath, []);
                    if (forceReconv) boomboxDb = boomboxDb.filter(item => !(item.originalUrl === newData.originalUrl));
                    boomboxDb.push(newData);
                    fs.writeFileSync(boomboxDbPath, JSON.stringify(boomboxDb, null, 2));
                }
                return { isCached: false, ...newData };
            };

            const buildFinalEmbed = (result) => {
                if (result.platform === "YouTube") return embedYouTube(result);
                if (result.platform === "TikTok") return embedTikTok(result);
                if (result.platform === "Spotify") return embedSpotify(result);
                const e = new EmbedBuilder().setColor(EMERALD_COLOR).setTitle("✅ Audio Berhasil Diproses!").setDescription(`<@${result.userId}> Done 😎!\n\n**🎵 Judul**\n${result.title}\n\n**🔗 Top4Top**\n${result.top4top}\n\n📢 Kalau Tidak Ada Suara Request Ulang Saja`).setTimestamp();
                if (result.thumb && result.thumb.startsWith('http')) e.setImage(result.thumb);
                return e;
            };

            if (command === "!setchannelbb" || command === "!setchannelboombox") {
                const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
                const isOwner = message.author.id === ownerId;
                if (!isOwner && !isAdmin) return;
                const targetChannel = message.mentions.channels.first() || message.channel;
                if (!db.channels.includes(targetChannel.id)) { db.channels.push(targetChannel.id); fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); return message.reply(`✅ Channel ${targetChannel} berhasil di set.`); }
            }
            if (command === "!delchannelbb" || command === "!deletechannelboombox") {
                const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
                const isOwner = message.author.id === ownerId;
                if (!isOwner && !isAdmin) return;
                const targetChannel = message.mentions.channels.first() || message.channel;
                if (db.channels.includes(targetChannel.id)) { db.channels = db.channels.filter(id => id !== targetChannel.id); fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); return message.reply(`✅ Channel ${targetChannel} dihapus.`); }
            }
            if (command === "!reconv") {
                const link = args[1]; if (!link) return message.reply("⚠️ Masukkan link!");
                const msg = await message.reply({ embeds: [getLoadingEmbed()] });
                try { 
                    const result = await processMedia(link, false, link, true, true, true); 
                    await msg.edit({ embeds: [buildFinalEmbed(result)], components: buildResultComponents(result.top4top) }); 
                }
                catch (e) { await msg.edit({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Gagal: ${e.message}`)] }); }
                return;
            }

            if (command === "!bbsearch" || command === "!bbs") {
                const query = args.slice(1).join(" ");
                if (!query) return message.reply(`❌ Format Salah : \`${command} query\``);

                const processEmbed = new EmbedBuilder()
                    .setColor("Blue")
                    .setTitle("🔎 Sedang Mencari Judul Di Database")
                    .setDescription("⏳ Mohon Tunggu Sebentar..");

                const msg = await message.reply({ embeds: [processEmbed] });

                const boomboxDb = safeReadJSON(boomboxDbPath, []);
                const filteredResults = boomboxDb.filter(item => item.title && item.title.toLowerCase().includes(query.toLowerCase()));

                if (!filteredResults || filteredResults.length === 0) {
                    await msg.delete().catch(() => {});
                    return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Tidak ditemukan lagu dengan judul "${query}" di database.`)] });
                }

                await msg.delete().catch(() => {});

                const itemsPerPage = 5;
                const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
                let currentPage = 0;

                const generateSearchEmbed = (page) => {
                    const start = page * itemsPerPage;
                    const end = start + itemsPerPage;
                    const currentItems = filteredResults.slice(start, end);

                    let listStr = "";
                    currentItems.forEach((item, index) => {
                        listStr += `${start + index + 1}. **${item.title}**\n🔗 [Top4Top](${item.top4top})\n`;
                    });

                    return new EmbedBuilder()
                        .setColor("Blue")
                        .setTitle("📦 Boombox Search Result From Database")
                        .setDescription(`Ditemukan ${filteredResults.length} Lagu Yang Berjudul ${query}\n\n${listStr.trim()}`);
                };

                const generateSearchButtons = (page) => {
                    return new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("bbs_prev").setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                        new ButtonBuilder().setCustomId("bbs_page_info").setLabel(`Page ${page + 1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                        new ButtonBuilder().setCustomId("bbs_next").setLabel("➡️ Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
                    );
                };

                const resultMsg = await message.reply({
                    embeds: [generateSearchEmbed(currentPage)],
                    components: totalPages > 1 ? [generateSearchButtons(currentPage)] : []
                });

                if (totalPages > 1) {
                    const collector = resultMsg.createMessageComponentCollector({
                        filter: (i) => i.user.id === message.author.id,
                        time: 120000
                    });

                    collector.on("collect", async (i) => {
                        if (i.customId === "bbs_prev") currentPage = Math.max(0, currentPage - 1);
                        else if (i.customId === "bbs_next") currentPage = Math.min(totalPages - 1, currentPage + 1);

                        await i.update({
                            embeds: [generateSearchEmbed(currentPage)],
                            components: [generateSearchButtons(currentPage)]
                        });
                    });
                }
                return;
            }

            if (command === "!bb" || command === "!bbowner") {
                if (command === "!bbowner" && message.author.id !== ownerId) return message.reply("❌ Hanya Owner Yang Bisa Gunakan");
                
                // Proteksi Channel untuk Member Biasa (Admin bisa di semua channel)
                if (command === "!bb" && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    const allowedChannels = [
                        CHANNEL_BOOMBOX_RANDOM,
                        ...(db.channels || [])
                    ];
                    if (!allowedChannels.includes(message.channel.id)) return;
                }

                const query = args.slice(1).join(" ");
                if (!query) return message.reply(`❌Format Salah : \`\`${command} query/url\`\``);

                // Jika input adalah URL
                if (/https?:\/\//.test(query)) {
                    const msg = await message.reply({ embeds: [getLoadingEmbed()] });
                    try {
                        const cached = checkDatabase(query);
                        if (cached) return await sendFromDb(cached, msg);
                        const result = await processMedia(query, false, query, false, false, true);
                        await msg.edit({ embeds: [buildFinalEmbed(result)], components: buildResultComponents(result.top4top) });
                    } catch (e) {
                        await msg.edit({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Gagal: ${e.message}`)] });
                    }
                    return;
                }

                // Jika input adalah Query Pencarian
                const loadingSearch = new EmbedBuilder().setColor("Yellow").setDescription("🔍 Mencari video YouTube...");
                const msg = await message.reply({ embeds: [loadingSearch] });

                try {
                    const res = await yts(query);
                    const videos = res.all.filter(v => v.type === "video").slice(0, 10);
                    
                    if (!videos.length) return msg.edit({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Video tidak ditemukan.")] });

                    let index = 0;

                    const makeEmbed = (i) => {
                        const v = videos[i];
                        return new EmbedBuilder()
                            .setColor(EMERALD_COLOR)
                            .setTitle(v.title)
                            .setURL(v.url)
                            .setDescription(`**${i + 1} / ${videos.length}**\n\n⏳ Durasi: ${v.timestamp || "0:00"}\n👀 Views: ${v.views.toLocaleString()}\n📺 Channel: ${v.author.name}\n\n🔗 ${v.url}`)
                            .setImage(`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`)
                            .setFooter({ text: "Gunakan tombol untuk memilih video" });
                    };

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("prev").setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId("convert").setLabel("📥 Convert").setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId("next").setLabel("➡️ Next").setStyle(ButtonStyle.Secondary)
                    );

                    await msg.edit({ embeds: [makeEmbed(index)], components: [row] });

                    const collector = msg.createMessageComponentCollector({
                        filter: (i) => i.user.id === message.author.id
                    });

                    collector.on("collect", async (i) => {
                        if (i.customId === "prev") {
                            index = (index - 1 + videos.length) % videos.length;
                            await i.update({ embeds: [makeEmbed(index)] });
                        } else if (i.customId === "next") {
                            index = (index + 1) % videos.length;
                            await i.update({ embeds: [makeEmbed(index)] });
                        } else if (i.customId === "convert") {
                            const selectedUrl = i.message.embeds[0].url;
                            await i.update({ embeds: [getLoadingEmbed()], components: [] });
                            
                            try {
                                const cached = checkDatabase(selectedUrl);
                                if (cached) return await sendFromDb(cached, msg);
                                
                                const result = await processMedia(selectedUrl, false, selectedUrl, false, false, true);
                                await msg.edit({ embeds: [buildFinalEmbed(result)], components: buildResultComponents(result.top4top) });
                            } catch (err) {
                                await msg.edit({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Gagal: ${err.message}`)], components: [] });
                            }
                        }
                    });
                } catch (err) {
                    return msg.edit({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Gagal: ${err.message}`)] });
                }
                return;
            }

            const isYt = /youtube\.com|youtu\.be/.test(content), isSp = /spotify/i.test(content), isTt = /tiktok/i.test(content);
            if ((isYt || isSp || isTt) && !content.startsWith("!")) {
                if (!db.channels.includes(message.channel.id) && !((isYt && message.channel.id === CHANNEL_YOUTUBE) || (isSp && message.channel.id === CHANNEL_SPOTIFY) || (isTt && message.channel.id === CHANNEL_TIKTOK))) return;
                const cached = checkDatabase(content); if (cached) return await sendFromDb(cached);
                const msg = await message.reply({ embeds: [getLoadingEmbed()] });
                try { 
                    const result = await processMedia(content, false, content, false, false, true); 
                    if (result.isCached) return await sendFromDb(result.data, msg); 
                    await msg.edit({ embeds: [buildFinalEmbed(result)], components: buildResultComponents(result.top4top) }); 
                }
                catch (e) { await msg.edit({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Gagal: ${e.message}`)] }); }
            }
        });
    }
};
