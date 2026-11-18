const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// What each job system's page says, read from its own places. Synthetic pages in the
// shape of real ones, checked against live postings on 2026-11-18.
const job = (title, company, more = '') => `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title, description: '<p>Build things.</p>', hiringOrganization: { name: company }, ...JSON.parse(more || '{}') })}</script>`;
const cases = [
  { name: 'UKG', url: 'https://recruiting2.ultipro.com/ACME/JobBoard/1/OpportunityDetail', html: '<title>Scientist | ACME Labs Career Opportunities</title><h1>Scientist</h1><address class="custom-address"><span>ACME Main</span><span>Salt Lake City, UT 841081221, USA</span></address><span id="JobFullTime">Full Time</span><p>Under a service contract with the state.</p><div class="job-banner-right"><ukg-button style="display:block">Apply now</ukg-button></div>',
    want: { site: 'ultipro', company: 'ACME Labs', location: 'Salt Lake City, UT, USA', type: 'Full-time', open: true } },
  { name: 'JazzHR', url: 'https://acme.applytojob.com/apply/x/Counsel', html: '<title>Counsel - The Acme Foundation - Career Page</title><div class="job-header"><h2>Counsel</h2></div><div class="job-attributes-container"><div>Washington, DC</div><div id="resumator-job-employment">Full Time</div></div>',
    want: { site: 'jazzhr', title: 'Counsel', company: 'The Acme Foundation', location: 'Washington, DC', type: 'Full-time' } },
  { name: 'Indeed', url: 'https://www.indeed.com/viewjob?jk=1', html: '<meta charset="utf-8"><title>Engineer - Indianapolis, IN - Indeed.com</title><meta property="og:image" content="https://prod.statics.indeed.com/images/logo/indeed_logo_1200x630.png"><div data-testid="company-info-metadata"><div><a>Resultant</a></div><div><span>·</span><span>2.7</span></div><div><div>Indianapolis, IN 46204</div></div></div><div><label>Job title<input name="q"></label><label>Location<input name="l"></label></div><a data-testid="viewjob-indeed-apply" href="#">Apply with Indeed</a>',
    want: { site: 'indeed', title: 'Engineer', company: 'Resultant', location: 'Indianapolis, IN 46204', logo: null, open: true } },
  { name: 'SmartRecruiters', url: 'https://jobs.smartrecruiters.com/Acme/1', html: '<title>Engineer</title><h1 hidden>Sorry, Internet Explorer 11 is no longer supported</h1><h1 class="job-title">Engineer</h1><span itemprop="addressLocality">coimbatore</span><span itemprop="addressCountry">India</span>',
    want: { title: 'Engineer', location: 'Coimbatore, India' } },
  { name: 'Rippling', url: 'https://ats.rippling.com/en-GB/utility/jobs/1', html: '<title>Engineer</title><meta property="og:site_name" content="Rippling Recruiting"><h1>Engineer</h1><button data-testid="Apply now">Apply now</button>',
    want: { site: 'rippling', company: 'Utility', open: true } },
  { name: 'Personio', url: 'https://peter-park.jobs.personio.de/job/1', html: `<title>Engineer</title>${job('Engineer', '')}<a class="action-form-toggle" href="/job/1/apply">Apply</a>`, want: { company: 'Peter Park', open: true } },
  { name: 'Recruitee: bad location data', url: 'https://acme.recruitee.com/o/x', html: `<title>Engineer</title>${job('Engineer', 'Acme', '{"jobLocation":{"address":{"addressLocality":"-","addressRegion":"30","addressCountry":"UA"}}}')}<button data-cy="apply-button">Apply</button>`, want: { location: 'UA', open: true } },
  { name: 'Teamtailor: a continent is not a place', url: 'https://acme.teamtailor.com/jobs/1', html: `<title>Engineer</title>${job('Engineer', 'Acme', '{"jobLocation":{"address":{"addressLocality":"Chicago","addressRegion":"North America","addressCountry":"US"}}}')}`, want: { location: 'Chicago, US' } },
  { name: 'Eightfold: a doubled region', url: 'https://acme.eightfold.ai/careers/job/1', html: `<title>Engineer</title>${job('Engineer', 'Acme', '{"jobLocation":{"address":{"addressLocality":"Vancouver","addressRegion":"BC,CA","addressCountry":"CA"}}}')}<div class="ot-logo"><img src="https://cdn.cookielaw.org/logos/1/acme-logo.png" alt="Acme logo" width="80" height="80"></div>`, want: { location: 'Vancouver, BC, CA', logo: null } },
  { name: 'A stated type wins over words in the text', url: 'https://jobs.lever.co/acme/1', html: `<title>Engineer</title>${job('Engineer', 'Acme', '{"employmentType":"VOLUNTEER"}')}<p>Our summer intern program and contract language.</p>`, want: { type: '' } },
  { name: 'ADP: "Company logo" names nobody', url: 'https://workforcenow.adp.com/mascsr/recruitment.html', html: '<title>Career Center | Recruitment</title><h2 class="job-description-title">Store Manager</h2><img src="https://cdn.example/x.png" alt="Company Logo" width="90" height="40"><button id="recruitment_jobDescription_apply">Apply</button>', want: { title: 'Store Manager', company: '', open: true } },
  { name: 'Workday: the counts are not places', url: 'https://acme.wd5.myworkdayjobs.com/Careers/job/X_1', html: '<title>Engineer</title><h2 data-automation-id="jobPostingHeader">Engineer</h2><div data-automation-id="locations"><dl><dd>USA, CO, Boulder</dd><dd>4 Locations</dd></dl></div>', want: { location: 'USA, CO, Boulder' } },
  { name: 'A cookie notice is not the description', url: 'https://acme.recruitee.com/o/y', html: `<title>Acme - Engineer</title><div class="cmplz-cookiebanner"><div class="description">${'We use cookies to store and access device information on this site. '.repeat(4)}</div></div><main><h1>Engineer</h1><p>${'Build the payments platform with our team every day. '.repeat(6)}</p></main>`, want: { description: /payments platform/ } },
  { name: 'A short side article is not the description', url: 'https://acme.recruitee.com/o/z', html: `<title>Acme - Engineer</title><main><h1>Engineer</h1><p>${'Build the payments platform with our team every day. '.repeat(14)}</p><article>${'Can not find a job you are looking for? Tell us about you. '.repeat(4)}</article></main>`, want: { description: /payments platform/ } },
  { name: 'A stated employment type wins', url: 'https://jobs.lever.co/acme/2', html: `<title>Engineer</title><h1>Engineer</h1><p>Employment type Volunteer</p><p>Our summer intern program.</p>`, want: { type: '' } },
  { name: 'Ashby lists every place', url: 'https://jobs.ashbyhq.com/acme/1', html: `<title>Engineer @ Acme</title>${job('Engineer', 'Acme', '{"jobLocation":{"address":{"addressLocality":"New York"}}}')}<div class="ashby-job-posting-left-pane"><h2>Location</h2><p>New York, NY (HQ); Miami, FL; Remote (US)</p></div>`, want: { location: 'New York, NY (HQ) · Miami, FL · Remote (US)' } },
  { name: 'Workable: the place and how you work', url: 'https://apply.workable.com/acme/j/1', html: `<title>Engineer - Acme</title>${job('Engineer', 'Acme')}<span data-ui="job-location">Paris, France</span><span data-ui="job-workplace">Remote</span>`, want: { location: 'Paris, France · Remote' } },
  { name: 'Pinpoint: what the page says', url: 'https://acme.pinpointhq.com/postings/1', html: `<title>Engineer</title>${job('Engineer', 'Acme', '{"jobLocation":{"address":{"addressLocality":"London","addressCountry":"GB"}}}')}<dd class="pinpoint-job-sidebar--location">Remote</dd>`, want: { location: 'Remote' } },
  { name: 'A page-wide banner is not a logo', url: 'https://acme.taleo.net/careersection/ex/jobdetail.ftl', html: '<title>Job Description - Clerk</title><header><img src="https://acme.taleo.net/banner.png" alt="Acme" width="4000" height="400"></header><h1>Clerk</h1>', want: { logo: null } },
  { name: 'One stray field does not hide Apply', url: 'https://careers.acme.example/job/1', html: '<head data-ph-id="ph-page-1"><title>Engineer</title></head><h1>Engineer</h1><label>Email<input type="email"></label><a data-ph-at-id="apply-link" href="#">Apply</a>', want: { site: 'phenompeople', open: true } },
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const pages = Object.fromEntries(cases.map(item => [item.url.split('?')[0], `<!doctype html>${item.html}`]));
    const page = await pageWithScripts(browser, pages);
    for (const item of cases) {
      await page.open(item.url);
      const got = await page.evaluate(async () => {
        const scan = await window.__ask({ type: 'scan' }), details = window.CVAutofillJobDetails.read();
        return { site: scan.site, title: scan.context.title, company: scan.context.company, logo: scan.context.logo, open: scan.canOpenForm, location: details.location, type: details.employmentType, description: details.description };
      });
      for (const [key, value] of Object.entries(item.want)) {
        if (value instanceof RegExp) assert.match(got[key], value, `${item.name}: ${key}`); else assert.equal(got[key], value, `${item.name}: ${key}`);
      }
    }
    await page.open(cases[0].url);
    const reader = text => page.evaluate(value => window.CVAutofillJobDetails.salaryInText(value), text);
    assert.deepEqual(await reader('$14.71 To $15.21 Hourly'), { salaryMin: 15, salaryMax: 15, salaryCurrency: 'USD', salaryPeriod: 'hour' });
    assert.deepEqual(await reader('HK$20,159 to HK$24,503 per month'), { salaryMin: 20159, salaryMax: 24503, salaryCurrency: 'HKD', salaryPeriod: 'month' });
    assert.deepEqual(await reader('$156,000 USD - $234,000 USD per year'), { salaryMin: 156000, salaryMax: 234000, salaryCurrency: 'USD', salaryPeriod: 'year' });
    assert.deepEqual(await reader('$32.90 USD per hour'), { salaryMin: 33, salaryMax: 33, salaryCurrency: 'USD', salaryPeriod: 'hour' });
    assert.equal(await reader('5 to 10 years of experience'), null);
    assert.deepEqual(await page.evaluate(() => ['service contract. Full-time', 'contract language', 'Contract position', 'FULL_TIME', 'CONTRACTOR', 'Summer intern', 'work with temporary workers and contractors', 'internal tools'].map(window.CVAutofillJobDetails.typeOf)), ['Full-time', '', 'Contract', 'Full-time', 'Contract', 'Internship', '', '']);
    console.log('PASS job systems: title, company, location, type, salary, logo and Apply from each one’s own places');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
