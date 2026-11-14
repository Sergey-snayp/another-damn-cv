const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Apply on LinkedIn (to the company's site) hands the job to the background, to go with
// the tab it opens; Easy Apply stays on LinkedIn and hands nothing. Synthetic page.
const extension = path.resolve(__dirname, '..');
const html = `<!doctype html><title>Jobs | LinkedIn</title><main>
  <section class="jobs-search__job-details--container" data-job-id="111">
    <header class="job-details-jobs-unified-top-card">
      <h2 class="job-details-jobs-unified-top-card__job-title"><a href="/jobs/view/111">Senior Software Engineer (Python)</a></h2>
      <div class="job-details-jobs-unified-top-card__company-name"><a href="/company/varonis">Varonis</a></div>
      <div class="job-details-jobs-unified-top-card__primary-description-container"><span class="tvm__text--low-emphasis">Vancouver, BC (On-site)</span> · 2 days ago</div>
      <a href="/company/varonis"><img width="80" height="80" alt="Varonis" data-delayed-url="https://media.licdn.com/varonis-logo.png"></a>
      <button class="jobs-apply-button" aria-label="Apply to Senior Software Engineer (Python) on company website"><span>Apply</span></button>
      <button class="jobs-apply-button" aria-label="Easy Apply to Senior Software Engineer (Python) at Varonis"><span>Easy Apply</span></button>
    </header>
    <div id="job-details"><p>Varonis is a leader in data security. Build the Secure AI Platform in Python on AWS, with a team that ships every week.</p></div>
  </section></main>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => void request.respond(request.isNavigationRequest() ? { contentType: 'text/html', body: html } : { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>' }));
    await page.evaluateOnNewDocument(() => {
      window.__messages = [];
      window.chrome = {
        runtime: { id: 'test', getURL: file => (file.endsWith('.html') ? 'data:text/html,<p>Panel</p>' : 'data:text/css,'), onMessage: { addListener() {} }, sendMessage: async message => { window.__messages.push(message); return {}; } },
        storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
      };
    });
    await page.goto('https://www.linkedin.com/jobs/search/?currentJobId=111');
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
    for (const file of manifest.content_scripts.find(entry => entry.js.includes('src/content.js')).js) await page.addScriptTag({ path: path.join(extension, file) });
    const handed = () => page.evaluate(() => window.__messages.filter(message => message.type === 'linkedin-apply'));

    await page.click('[aria-label^="Easy Apply"]');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(await handed(), [], 'Easy Apply stays on LinkedIn: nothing to hand over');

    await page.click('[aria-label^="Apply to"]');
    await new Promise(resolve => setTimeout(resolve, 200));
    const [message] = await handed();
    assert.ok(message, 'Apply to the company website hands the job over');
    assert.equal(message.job.title, 'Senior Software Engineer (Python)');
    assert.equal(message.job.company, 'Varonis');
    assert.match(message.job.location, /Vancouver, BC/);
    assert.match(message.job.description, /Secure AI Platform/);
    assert.equal(message.job.logo, 'https://media.licdn.com/varonis-logo.png');
    console.log('PASS LinkedIn Apply hands the job (title, company, location, description, logo) to the tab it opens; Easy Apply does not');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
