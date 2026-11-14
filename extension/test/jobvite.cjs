const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Varonis on Jobvite (saved copies): the apply page's "Save job" details are the
// job's own, as Simplify reads them: title from the jv-header, location from the
// line under it, company from the header logo, and the description from the job
// page, which is also the job's address.
const extension = path.resolve(__dirname, '..');
const fixture = name => `<!doctype html>${fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')}`;
const JOB = 'https://jobs.jobvite.com/careers/varonis/job/oitNzfwR';

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url().split('?')[0];
      if (url === `${JOB}/apply`) return void request.respond({ contentType: 'text/html', body: fixture('jobvite-varonis-apply.html') });
      if (url === JOB) return void request.respond({ contentType: 'text/html', body: fixture('jobvite-varonis-job.html') });
      return void request.respond({ status: 404, body: '' });
    });
    await page.evaluateOnNewDocument(() => {
      window.__listeners = [];
      window.chrome = {
        runtime: { id: 'test', getURL: file => (file.endsWith('.html') ? 'data:text/html,<p>Panel</p>' : 'data:text/css,'), onMessage: { addListener: listener => window.__listeners.push(listener) }, sendMessage: async () => ({}) },
        storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
      };
      window.__ask = message => new Promise(resolve => { for (const listener of window.__listeners) if (listener(message, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, resolve) === false) {} });
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
    const scripts = manifest.content_scripts.find(entry => entry.js.includes('src/content.js')).js;
    const open = async url => {
      await page.goto(url);
      for (const file of scripts) await page.addScriptTag({ path: path.join(extension, file) });
      return page.evaluate(() => window.__ask({ type: 'job-details' }));
    };

    const apply = await open(`${JOB}/apply?jvs=LinkedInLimited&jvk=Apply&jvi=oitNzfwR,Apply&j=oitNzfwR&__jvst=Job%20Board`);
    assert.equal(apply.title, 'Senior Software Engineer (Python)', 'not the tab title "Varonis Careers - Apply for …"');
    assert.equal(apply.company, 'Varonis');
    assert.equal(apply.location, 'Vancouver, Canada', 'not the department ("R&D")');
    assert.equal(apply.url, JOB, 'the apply page saves as its job page');
    assert.match(apply.description, /Secure AI Platform/, 'the description, read from the job page');
    assert.doesNotMatch(apply.description, /Thank you for considering/, 'not the form\'s welcome text');

    const badge = 'https://app.jobvite.com/logo/VaronisBadge150dpiBlack_1709482410534.png';
    const scanned = await page.evaluate(() => new Promise(resolve => { for (const listener of window.__listeners) if (listener({ type: 'scan' }, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, resolve) === false) {} }));
    assert.equal(scanned.context.logo, badge, "the apply page's logo: Jobvite's badge for Varonis, from the job page");
    assert.equal(scanned.context.company, 'Varonis');
    // The header's own logo is white for Varonis's dark header: on a dark background a logo is never taken.
    const onDark = await page.evaluate(() => {
      document.querySelector('.jv-page-header').style.background = 'rgb(18, 4, 52)';
      return window.CVAutofillLogo.find('Varonis').logo;
    });
    assert.equal(onDark, null, 'a logo on a dark header is drawn light: it would not show on the white card');

    const job = await open(JOB);
    assert.deepEqual([job.title, job.company, job.location, job.url], ['Senior Software Engineer (Python)', 'Varonis', 'Vancouver, Canada', JOB]);
    assert.match(job.description, /Secure AI Platform/);
    const jobScan = await page.evaluate(() => new Promise(resolve => { for (const listener of window.__listeners) if (listener({ type: 'scan' }, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, resolve) === false) {} }));
    assert.equal(jobScan.context.logo, badge, 'the job page: its own badge');
    console.log('PASS Jobvite (Varonis): title, company, location, description and logo (the badge, never the white header logo), on the apply page and the job page');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
