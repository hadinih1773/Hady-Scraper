const axios = require("axios");
const https = require("https");

const API_URL = "https://parsevideoapi.videosolo.com/spotify-api/";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function getSpotifyData(spotifyUrl) {
  try {
    const res = await axios.post(
      API_URL,
      {
        url: spotifyUrl
      },
      {
        httpsAgent,
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/json",
          "Origin": "https://spotidown.online",
          "Referer": "https://spotidown.online/",
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
        }
      }
    );

    return res.data;
  } catch (err) {
    console.error("Gagal mengambil data:");
    console.error(err.response?.data || err.message);
    return null;
  }
}

const spotifyLink =
  "https://open.spotify.com/track/3P0hS9hD74Mm3F9e8jAJKd";

(async () => {
  const data = await getSpotifyData(spotifyLink);
  console.log(JSON.stringify(data, null, 2));

  // ambil meta data memeg nya
  if (data?.data?.metadata) {
    console.log("Judul   :", data.data.metadata.name);
    console.log("Artist  :", data.data.metadata.artist);
    console.log("Album   :", data.data.metadata.album);
    console.log("Durasi  :", data.data.metadata.duration);
    console.log("MP3 URL :", data.data.metadata.download);
  }
})();