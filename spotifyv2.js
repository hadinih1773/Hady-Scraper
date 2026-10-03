const axios = require("axios");
const https = require("https");

const BASE = "https://api.fabdl.com";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const headers = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  "Origin": "https://keepvid.ch",
  "Referer": "https://keepvid.ch/spotify-download-new12"
};

async function getSpotifyDownload(spotifyUrl) {

  const info = await axios.get(
    `${BASE}/spotify/get`,
    { params: { url: spotifyUrl }, headers, httpsAgent }
  );

  const track = info.data.result;
  if (!track?.id || !track?.gid) {
    throw new Error("Gagal ambil metadata Spotify");
  }


  const task = await axios.get(
    `${BASE}/spotify/mp3-convert-task/${track.gid}/${track.id}`,
    { headers, httpsAgent }
  );

  const { tid } = task.data.result;
  if (!tid) throw new Error("Gagal membuat convert task");


  let progress;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1500));

    progress = await axios.get(
      `${BASE}/spotify/mp3-convert-progress/${tid}`,
      { headers, httpsAgent }
    );

    if (progress.data.result?.status === 3) break;
  }

  const result = progress.data.result;
  if (!result?.download_url) {
    throw new Error("Convert belum selesai / gagal");
  }


  const downloadUrl = BASE + result.download_url;

  return {
    title: track.name,
    artist: track.artists,
    duration_ms: track.duration_ms,
    image: track.image,
    download: downloadUrl
  };
}


(async () => {
  try {
    const spotify =
      "https://open.spotify.com/track/2psRActEWsTlYYd7EDoyVR";

    const res = await getSpotifyDownload(spotify);
    console.log(res);
  } catch (e) {
    console.error("ERROR:", e.message);
  }
})();