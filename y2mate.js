const https = require('https');
const dns = require('dns');
const querystring = require('querystring');
const readline = require('readline');

// Set DNS servers to Google public DNS and Cloudflare DNS to bypass local ISP censorship
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Output configuration flags (JSON is the default response now)
let onlyUrl = false;

// Custom log helper to write info messages to stderr to keep stdout clean for JSON/URL output.
function logInfo(msg) {
  process.stderr.write(msg + '\n');
}

// Custom DNS Resolver for https requests
function customLookup(hostname, opts, callback) {
  dns.resolve4(hostname, (err, addresses) => {
    if (err || !addresses || addresses.length === 0) {
      // Fallback to default system resolver
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

// Promise wrapper for HTTPS requests using the custom DNS resolver
function makeRequest(urlStr, method, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      lookup: customLookup,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
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

// Extract YouTube 11-character video ID from various link formats
function extractVideoId(url) {
  if (url.length === 11 && /^[\w-]+$/.test(url)) return url;
  const match = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// Fetch YouTube video metadata via public oEmbed endpoint
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

// Interactive prompt helper using readline
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

function showHelp() {
  console.log(`
YouTube Downloader CLI (via y2mate backend API)
Bypasses local ISP censorship (Internet Baik / Internet Positif) using Google/Cloudflare DNS.
Returns structured JSON data by default.

Usage (Interactive Mode):
  node y2mate.js <youtube_url>

Usage (Direct Mode):
  node y2mate.js <youtube_url> [format] [quality] [options]

Arguments:
  <youtube_url>   The full YouTube video URL or 11-char video ID.
  [format]        Format to request: 'mp3' or 'mp4'.
  [quality]       Quality/Bitrate:
                    - For 'mp3': 320, 256, 128
                    - For 'mp4': 1080, 720, 360, 240, 144

Options:
  --url  | -u     Output ONLY the raw download link string instead of JSON.

Examples:
  node y2mate.js "https://youtu.be/337-Aroj1Ew"
  node y2mate.js "https://youtu.be/337-Aroj1Ew" mp4 1080
  node y2mate.js "https://youtu.be/337-Aroj1Ew" mp3 320 --url
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // Parse onlyUrl flag
  onlyUrl = args.includes('--url') || args.includes('-u') || args.includes('--link') || args.includes('-l');

  // Filter out flags to correctly parse positional arguments
  const cleanedArgs = args.filter(arg => !['--url', '-u', '--link', '-l'].includes(arg));

  const urlInput = cleanedArgs[0];
  const videoId = extractVideoId(urlInput);
  if (!videoId) {
    console.error('Error: Invalid YouTube URL or Video ID');
    process.exit(1);
  }

  let format;
  let quality;

  if (cleanedArgs.length >= 2) {
    // Non-interactive mode
    format = cleanedArgs[1].toLowerCase();
    const qualityStr = cleanedArgs[2];

    if (format !== 'mp3' && format !== 'mp4') {
      console.error('Error: Format must be either "mp3" or "mp4"');
      process.exit(1);
    }

    if (format === 'mp3') {
      quality = qualityStr ? parseInt(qualityStr, 10) : 320;
      if (![320, 256, 128].includes(quality)) {
        console.error('Error: MP3 quality must be one of: 320, 256, 128');
        process.exit(1);
      }
    } else {
      quality = qualityStr ? parseInt(qualityStr, 10) : 1080;
      if (![1080, 720, 360, 240, 144].includes(quality)) {
        console.error('Error: MP4 quality must be one of: 1080, 720, 360, 240, 144');
        process.exit(1);
      }
    }
  } else {
    // Interactive mode
    console.log('\n======================================');
    console.log('   Y2MATE INTERACTIVE DOWNLOADER CLI  ');
    console.log('======================================');
    console.log('Pilih format unduhan:');
    console.log(' 1. MP4 (Video dengan Suara)');
    console.log(' 2. MP3 (Audio Saja)');
    
    let formatChoice = '';
    while (formatChoice !== '1' && formatChoice !== '2') {
      formatChoice = (await askQuestion('Pilihan Anda (1-2): ')).trim();
      if (formatChoice !== '1' && formatChoice !== '2') {
        console.log('Pilihan tidak valid. Ketik 1 atau 2.');
      }
    }

    if (formatChoice === '1') {
      format = 'mp4';
      console.log('\nPilih kualitas video:');
      console.log(' 1. 1080p (Full HD - Direkomendasikan)');
      console.log(' 2. 720p (HD)');
      console.log(' 3. 360p (Kualitas Sedang)');
      console.log(' 4. 240p (Kualitas Rendah)');
      console.log(' 5. 144p (Hemat Data)');
      
      let qualChoice = '';
      const choices = { '1': 1080, '2': 720, '3': 360, '4': 240, '5': 144 };
      while (!choices[qualChoice]) {
        qualChoice = (await askQuestion('Pilihan Kualitas (1-5) [Default 1]: ')).trim();
        if (qualChoice === '') {
          qualChoice = '1';
        }
        if (!choices[qualChoice]) {
          console.log('Pilihan tidak valid. Silakan pilih 1 sampai 5.');
        }
      }
      quality = choices[qualChoice];
    } else {
      format = 'mp3';
      console.log('\nPilih kualitas audio (Bitrate):');
      console.log(' 1. 320kbps (Suara Sangat Jernih)');
      console.log(' 2. 256kbps (Suara Jernih)');
      console.log(' 3. 128kbps (Kualitas Standar/Hemat)');
      
      let qualChoice = '';
      const choices = { '1': 320, '2': 256, '3': 128 };
      while (!choices[qualChoice]) {
        qualChoice = (await askQuestion('Pilihan Bitrate (1-3) [Default 1]: ')).trim();
        if (qualChoice === '') {
          qualChoice = '1';
        }
        if (!choices[qualChoice]) {
          console.log('Pilihan tidak valid. Silakan pilih 1 sampai 3.');
        }
      }
      quality = choices[qualChoice];
    }
    console.log(); // Newline
  }

  logInfo(`Video ID: ${videoId}`);
  logInfo(`Format  : ${format.toUpperCase()}`);
  logInfo(`Quality : ${format === 'mp3' ? quality + 'kbps' : quality + 'p'}`);

  try {
    logInfo('\nStep 1: Fetching video metadata...');
    const meta = await fetchMetadata(videoId);
    logInfo(`Video Title: ${meta.title || 'Untitled Video'}`);

    logInfo('\nStep 2: Fetching API session key...');
    const keyHeaders = {
      'Content-Type': 'application/json',
      'Origin': 'https://frame.y2meta-uk.com',
      'Referer': `https://frame.y2meta-uk.com/wwwindex.php?videoId=${videoId}`
    };
    const keyRes = await makeRequest(`https://cnv.cx/v2/sanity/key?id=${videoId}`, 'GET', keyHeaders);
    
    if (keyRes.statusCode !== 200) {
      throw new Error(`Sanity key API returned HTTP status ${keyRes.statusCode}: ${keyRes.body}`);
    }

    const keyData = JSON.parse(keyRes.body);
    const sanityKey = keyData.key;
    if (!sanityKey) {
      throw new Error('Key not found in sanity check response');
    }
    logInfo('Session key fetched successfully.');

    logInfo('Step 3: Requesting conversion from converter server...');
    const audioBitrate = format === 'mp4' ? 128 : quality;
    const videoQuality = format === 'mp3' ? 720 : quality;

    const convertBody = querystring.stringify({
      link: 'https://youtu.be/' + videoId,
      format: format,
      audioBitrate: audioBitrate,
      videoQuality: videoQuality,
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
      throw new Error(`Converter API returned HTTP status ${convertRes.statusCode}: ${convertRes.body}`);
    }

    const convertData = JSON.parse(convertRes.body);
    if (!convertData || !convertData.url) {
      logInfo('Warning: cnv.cx direct URL not found. Using fallback conversion link.');
      convertData.url = 'https://conv.mp3youtube.cc/download/' + videoId;
      convertData.filename = `${videoId}.${format}`;
    }

    const downloadUrl = convertData.url;
    const rawFilename = convertData.filename || `${videoId}.${format}`;

    logInfo('Conversion succeeded!');

    if (onlyUrl) {
      // Print ONLY the URL string to stdout
      console.log(downloadUrl);
    } else {
      // Return the structured JSON to stdout by default
      const jsonResponse = {
        status: 'success',
        title: meta.title || rawFilename.replace(/\.[^/.]+$/, ""),
        thumbnail: meta.thumbnail,
        download: downloadUrl
      };
      console.log(JSON.stringify(jsonResponse, null, 2));
    }

  } catch (err) {
    if (onlyUrl) {
      console.error(err.message || err);
    } else {
      // Output json error
      console.log(JSON.stringify({
        status: 'failed',
        error: err.message || err
      }, null, 2));
    }
    process.exit(1);
  }
}

main();
