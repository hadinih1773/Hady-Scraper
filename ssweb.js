// ssweb.js
// npm install axios uuid

const axios = require("axios");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

async function ssweb(url) {
  try {
    // validasi protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    console.log("Generating screenshot...");

    const api = `https://image.thum.io/get/png/noanimate/fullpage/${url}`;

    const res = await axios({
      method: "GET",
      url: api,
      responseType: "arraybuffer",
      timeout: 60000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    const filename = `ssweb_${uuidv4()}.png`;

    fs.writeFileSync(filename, res.data);

    return {
      status: true,
      file: filename,
      size: fs.statSync(filename).size,
      api,
    };
  } catch (e) {
    return {
      status: false,
      error: e.response
        ? `HTTP ${e.response.status}`
        : e.message,
    };
  }
}

(async () => {
  const url = process.argv[2];

  if (!url) {
    return console.log(
      "Contoh:\nnode ssweb.js https://google.com"
    );
  }

  const result = await ssweb(url);

  console.log(result);
})();
