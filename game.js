const axios = require("axios");

const BASE_URL = "https://raw.githubusercontent.com/hadinih1773/game/main/games";

const GAMES = {
  family100: {
    url: `${BASE_URL}/family100.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban.join(", ") };
    }
  },
  susunkata: {
    url: `${BASE_URL}/susunkata.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: `Susun kata: ${item.soal}\nTipe: ${item.tipe}`, jawaban: item.jawaban };
    }
  },
  tebakbendera: {
    url: `${BASE_URL}/tebakbendera2.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: `Bendera: ${item.img.replace("http://", "https://")}`, jawaban: item.name };
    }
  },
  tebakgambar: {
    url: `${BASE_URL}/tebakgambar.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: `Gambar: ${item.img.replace("http://", "https://")}`, jawaban: item.jawaban };
    }
  },
  tebakkata: {
    url: `${BASE_URL}/tebakkata.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  },
  tebaktebakan: {
    url: `${BASE_URL}/tebaktebakan.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  },
  tekateki: {
    url: `${BASE_URL}/tekateki.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  },
  siapakahaku: {
    url: `${BASE_URL}/siapakahaku.json`,
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  }
};

// Additional games from GitHub
const EXTRA_GAMES = {
  asahotak: { url: `${BASE_URL}/asahotak.json`, fields: ["soal", "jawaban"] },
  caklontong: { url: `${BASE_URL}/caklontong.json`, fields: ["soal", "jawaban"] },
  tebakkalimat: { url: `${BASE_URL}/tebakkalimat.json`, fields: ["soal", "jawaban"] },
  tebakkimia: { url: `${BASE_URL}/tebakkimia.json`, fields: ["unsur", "lambang"] },
  tebaklirik: { url: `${BASE_URL}/tebaklirik.json`, fields: ["soal", "jawaban"] },
  tebakkabupaten: { url: `${BASE_URL}/tebakkabupaten.json`, fields: ["title", "url"] }
};

async function fetchGameData(url) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    return res.data;
  } catch (err) {
    throw new Error(`Gagal fetch ${url}: ${err.message}`);
  }
}

async function playGame(gameName) {
  const game = GAMES[gameName];
  if (!game) {
    // Check extra games
    const extra = EXTRA_GAMES[gameName];
    if (extra) {
      try {
        const data = await fetchGameData(extra.url);
        const item = data[Math.floor(Math.random() * data.length)];
        return console.log(JSON.stringify({
          game: gameName,
          soal: item[extra.fields[0]],
          jawaban: item[extra.fields[1]],
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (err) {
        return console.log(JSON.stringify({ error: true, message: err.message }, null, 2));
      }
    }
    
    return console.log(JSON.stringify({
      error: true,
      message: "Game tidak ditemukan",
      available: [...Object.keys(GAMES), ...Object.keys(EXTRA_GAMES)]
    }, null, 2));
  }

  try {
    const data = await fetchGameData(game.url);
    const { soal, jawaban } = game.pick(data);
    
    console.log(JSON.stringify({
      game: gameName,
      soal,
      jawaban,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    console.log(JSON.stringify({
      error: true,
      game: gameName,
      message: err.message
    }, null, 2));
    process.exit(1);
  }
}

// CLI entry point
if (require.main === module) {
  const gameName = process.argv[2];
  if (!gameName) {
    console.log(JSON.stringify({
      error: true,
      message: "Game name required",
      usage: "node game.js <game_name>",
      available: [...Object.keys(GAMES), ...Object.keys(EXTRA_GAMES)]
    }, null, 2));
    process.exit(1);
  }
  playGame(gameName.toLowerCase());
}

module.exports = { GAMES, EXTRA_GAMES, playGame };