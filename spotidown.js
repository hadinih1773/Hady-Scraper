const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');


class SpotidownScraper {
  constructor() {
    this.baseUrl = 'https://spotidown.app';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * Helper to initiate session cookies and get the dynamic token field
   * @private
   */
  async _getSession() {
    const response = await axios.get(`${this.baseUrl}/en3`, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const cookies = response.headers['set-cookie'] || [];
    const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');

    const $ = cheerio.load(response.data);
    const form = $('form[name="spotifyurl"]');
    if (!form.length) {
      throw new Error('Spotify URL search form not found on homepage.');
    }

    let dynamicName = '';
    let dynamicValue = '';
    form.find('input[type="hidden"]').each((i, elem) => {
      const name = $(elem).attr('name');
      const val = $(elem).attr('value');
      if (name && name !== 'g-recaptcha-response') {
        dynamicName = name;
        dynamicValue = val;
      }
    });

    return { sessionCookie, dynamicName, dynamicValue };
  }

  /**
   * Search for songs or resolve a Spotify URL (returns track list and session cookie)
   */
  async search(queryOrUrl) {
    const { sessionCookie, dynamicName, dynamicValue } = await this._getSession();

    const payload = {
      url: queryOrUrl,
      'g-recaptcha-response': '',
    };
    if (dynamicName) {
      payload[dynamicName] = dynamicValue;
    }

    const response = await axios.post(`${this.baseUrl}/action`, qs.stringify(payload), {
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': this.baseUrl,
        'Referer': `${this.baseUrl}/en3`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': sessionCookie
      }
    });

    if (response.data.error) {
      throw new Error(response.data.message || 'Lookup failed.');
    }

    const $ = cheerio.load(response.data.data);
    const tracks = [];

    $('form[name="submitspurl"]').each((i, formElem) => {
      const form = $(formElem);
      const data = form.find('input[name="data"]').val();
      const base = form.find('input[name="base"]').val();
      const token = form.find('input[name="token"]').val();

      if (data && base && token) {
        let metadata = {};
        try {
          const decodedMeta = Buffer.from(data, 'base64').toString('utf8');
          metadata = JSON.parse(decodedMeta);
        } catch (e) {
          metadata = { error: 'Failed parsing metadata' };
        }

        tracks.push({
          metadata,
          form: { data, base, token }
        });
      }
    });

    return { tracks, sessionCookie };
  }

  /**
   * Fetch direct download links for a resolved track form token
   */
  async getDownloadLinks(form, sessionCookie) {
    const response = await axios.post(`${this.baseUrl}/action/track`, qs.stringify(form), {
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': this.baseUrl,
        'Referer': `${this.baseUrl}/en3`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': sessionCookie
      }
    });

    if (response.data.error) {
      throw new Error(response.data.message || 'Failed getting download links.');
    }

    const $ = cheerio.load(response.data.data);
    const links = {
      mp3: null,
      cover: null
    };

    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim().replace(/\s+/g, ' ');
      if (!href) return;

      if (text.toLowerCase().includes('download mp3')) {
        links.mp3 = href;
      } else if (text.toLowerCase().includes('download cover')) {
        links.cover = href;
      }
    });

    return links;
  }
}

async function runScrapeTest() {
  const alok = new SpotidownScraper();
  
  // Test Case 1: Resolve a Spotify Track Link
  const testTrackUrl = 'https://open.spotify.com/track/4RGeIxGrN9VH1TJ94ppyje';
  console.log(`[TEST 1] Resolving Track Link: ${testTrackUrl}...`);
  
  try {
    const { tracks, sessionCookie } = await alok.search(testTrackUrl);
    if (tracks.length > 0) {
      const track = tracks[0];
      const links = await alok.getDownloadLinks(track.form, sessionCookie);
      
      const formattedResponse = {
        statusCode: 200,
        creator: "@HaidarMahiru",
        status: true,
        result: {
          metadata: {
            name: track.metadata.name,
            artist: track.metadata.artist,
            album: track.metadata.album,
            cover: track.metadata.cover,
            duration: track.metadata.duration,
            date: track.metadata.date,
            tid: track.metadata.tid,
            spotifyUrl: track.metadata.tid ? `https://open.spotify.com/track/${track.metadata.tid}` : null
          },
          links: links
        }
      };

      console.log('\n-> Formatted Response:');
      console.log(JSON.stringify(formattedResponse, null, 2));
    } else {
      console.log('-> No track resolved for this URL.');
    }
  } catch (error) {
    const errorResponse = {
      statusCode: 500,
      creator: "@HaidarMahiru",
      status: false,
      message: error.message
    };
    console.error('\n-> Test 1 Failed:');
    console.log(JSON.stringify(errorResponse, null, 2));
  }

  console.log('\n--------------------------------------------------\n');

  // Test Case 2: Perform a Text Search Query
  const testQuery = 'secukupnya';
  console.log(`[TEST 2] Searching Query: "${testQuery}"...`);

  try {
    const { tracks } = await alok.search(testQuery);
    const searchResults = tracks.map((t) => ({
      name: t.metadata.name,
      artist: t.metadata.artist,
      album: t.metadata.album,
      duration: t.metadata.duration,
      spotifyUrl: t.metadata.tid ? `https://open.spotify.com/track/${t.metadata.tid}` : null
    }));

    const formattedResponse = {
      statusCode: 200,
      creator: "@HaidarMahiru",
      status: true,
      result: searchResults
    };

    console.log('\n-> Formatted Response:');
    console.log(JSON.stringify(formattedResponse, null, 2));
  } catch (error) {
    const errorResponse = {
      statusCode: 500,
      creator: "@HaidarMahiru",
      status: false,
      message: error.message
    };
    console.error('\n-> Test 2 Failed:');
    console.log(JSON.stringify(errorResponse, null, 2));
  }
}


runScrapeTest();
