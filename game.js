const axios = require("axios");
const fs = require("fs");
const path = require("path");

const LOCAL_DB = path.join(__dirname, "database/games");

const GAMES = {
  family100: {
    file: "family100.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban.join(", ") };
    }
  },
  susunkata: {
    file: "susunkata.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: `Susun kata: ${item.soal}\nTipe: ${item.tipe}`, jawaban: item.jawaban };
    }
  },
  tebakbendera: {
    file: "tebakbendera2.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: `Bendera: ${item.img.replace("http://", "https://")}`, jawaban: item.name };
    }
  },
  tebakgambar: {
    file: "tebakgambar.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: `Gambar: ${item.img.replace("http://", "https://")}`, jawaban: item.jawaban };
    }
  },
  tebakkata: {
    file: "tebakkata.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  },
  tebaktebakan: {
    file: "tebaktebakan.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  },
  tekateki: {
    file: "tekateki.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  },
  siapakahaku: {
    file: "siapakahaku.json",
    pick: (data) => {
      const item = data[Math.floor(Math.random() * data.length)];
      return { soal: item.soal, jawaban: item.jawaban };
    }
  }
};

// Additional games from local DB
const EXTRA_GAMES = {
  asahotak: { file: "asahotak.json", fields: ["soal", "jawaban"] },
  caklontong: { file: "caklontong.json", fields: ["soal", "jawaban"] },
  tebakkalimat: { file: "tebakkalimat.json", fields: ["soal", "jawaban"] },
  tebakkimia: { file: "tebakkimia.json", fields: ["unsur", "lambang"] },
  tebaklirik: { file: "tebaklirik.json", fields: ["soal", "jawaban"] },
  tebakkabupaten: { file: "tebakkabupaten.json", fields: ["title", "url"] }
};

function loadLocalGame(filename) {
  const filepath = path.join(LOCAL_DB, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

async function playGame(gameName) {
  const game = GAMES[gameName];
  if (!game) {
    // Check extra games
    const extra = EXTRA_GAMES[gameName];
    if (extra) {
      const data = loadLocalGame(extra.file);
      if (!data) return console.log(JSON.stringify({ error: true, message: "File not found" }, null, 2));
      const item = data[Math.floor(Math.random() * data.length)];
      return console.log(JSON.stringify({
        game: gameName,
        soal: item[extra.fields[0]],
        jawaban: item[extra.fields[1]],
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    
    return console.log(JSON.stringify({
      error: true,
      message: "Game tidak ditemukan",
      available: [...Object.keys(GAMES), ...Object.keys(EXTRA_GAMES)]
    }, null, 2));
  }

  try {
    const data = loadLocalGame(game.file);
    if (!data) throw new Error(`File ${game.file} not found`);
    
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