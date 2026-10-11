const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Indonesian Job Scraper
 * Scrapes multiple job sites
 */

const SOURCES = {
    jobstreet: {
        name: 'JobStreet Indonesia',
        baseUrl: 'https://id.jobstreet.com',
        searchUrl: 'https://id.jobstreet.com/id/jobs?search=',
        selector: 'article[data-automation="jobCard"], .sx2jih0, .job-card',
        titleSel: 'h3, h2, [data-automation="jobTitle"], a[data-automation="jobTitle"]',
        linkSel: 'a[data-automation="jobTitle"], h3 a, h2 a',
        companySel: '[data-automation="jobCompany"], .company-name',
        locationSel: '[data-automation="jobLocation"], .location',
        salarySel: '[data-automation="jobSalary"], .salary'
    },
    glints: {
        name: 'Glints',
        baseUrl: 'https://glints.com',
        searchUrl: 'https://glints.com/id/opportunities/jobs/explore?keyword=',
        selector: '.JobCardsc__JobCardContainer, .job-card, [data-testid="job-card"]',
        titleSel: 'h3, h2, .job-title, a',
        linkSel: 'a[href*="/job/"]',
        companySel: '.company-name, .employer-name',
        locationSel: '.location, .job-location'
    },
    linkedin: {
        name: 'LinkedIn Jobs (Public)',
        baseUrl: 'https://www.linkedin.com',
        searchUrl: 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=',
        selector: '.base-card, .job-search-card',
        titleSel: 'h3, .base-search-card__title',
        linkSel: 'a.base-card__full-link',
        companySel: 'h4, .base-search-card__subtitle',
        locationSel: '.job-search-card__location'
    }
};

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br'
};

async function fetchSource(sourceKey, query, maxResults = 10) {
    const source = SOURCES[sourceKey];
    if (!source) return { source: sourceKey, error: 'Unknown source', jobs: [] };

    try {
        const searchUrl = source.searchUrl + encodeURIComponent(query);
        const response = await axios.get(searchUrl, {
            headers: DEFAULT_HEADERS,
            timeout: 20000
        });

        const $ = cheerio.load(response.data);
        const jobs = [];

        $(source.selector).each((i, el) => {
            if (jobs.length >= maxResults) return false;

            const $el = $(el);
            let title = $el.find(source.titleSel).first().text().trim();
            let url = $el.find(source.linkSel).first().attr('href');
            let company = $el.find(source.companySel).first().text().trim();
            let location = $el.find(source.locationSel).first().text().trim();
            let salary = source.salarySel ? $el.find(source.salarySel).first().text().trim() : null;

            if (!title || !url) return;
            if (title.length < 3) return;

            // Fix relative URLs
            if (url.startsWith('/')) {
                url = source.baseUrl + url;
            }

            // Clean up
            title = title.replace(/\s+/g, ' ').trim();
            company = company.replace(/\s+/g, ' ').trim();
            location = location.replace(/\s+/g, ' ').trim();

            jobs.push({
                title: title.substring(0, 150),
                company: company || 'N/A',
                location: location || 'Indonesia',
                salary: salary || 'Negosiasi',
                url,
                source: source.name
            });
        });

        // Remove duplicates
        const unique = jobs.filter((item, index, self) => 
            index === self.findIndex(t => t.url === item.url)
        );

        return { source: sourceKey, sourceName: source.name, jobs: unique };

    } catch (error) {
        return { source: sourceKey, error: error.message, jobs: [] };
    }
}

async function searchJobs(query, options = {}) {
    const { sources = Object.keys(SOURCES), maxPerSource = 10, maxTotal = 30 } = options;
    
    console.log(`[Jobs] Searching "${query}" across ${sources.length} sources...`);
    
    const results = await Promise.all(
        sources.map(s => fetchSource(s, query, maxPerSource))
    );

    const allJobs = results.flatMap(r => r.jobs || []);
    const unique = allJobs.filter((item, index, self) => 
        index === self.findIndex(t => t.url === item.url)
    ).slice(0, maxTotal);

    const summary = results.map(r => ({
        source: r.sourceName || r.source,
        count: r.jobs?.length || 0,
        error: r.error || null
    }));

    return {
        status: true,
        query,
        total: unique.length,
        summary,
        jobs: unique
    };
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const query = args.join(' ');
    
    if (!query) {
        console.log(JSON.stringify({
            status: false,
            message: 'Usage: node jobs.js <query> [--sources=jobstreet,glints,linkedin] [--max=10]',
            example: 'node jobs.js "software engineer" --sources=jobstreet,glints --max=5'
        }, null, 2));
        process.exit(1);
    }

    const sourceArg = args.find(a => a.startsWith('--sources='));
    const maxArg = args.find(a => a.startsWith('--max='));
    
    const sources = sourceArg ? sourceArg.split('=')[1].split(',') : Object.keys(SOURCES);
    const maxPerSource = maxArg ? parseInt(maxArg.split('=')[1]) : 10;

    searchJobs(query, { sources, maxPerSource })
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error('Error:', err.message));
}

module.exports = { searchJobs, SOURCES };