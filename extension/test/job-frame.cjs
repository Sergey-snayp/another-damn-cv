const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts, panelFixture } = require('./panel-fixture.cjs');

// A job shown in a frame, as on iCIMS: the top page is only its wrapper, so the
// panel takes the job and its Apply button from the frame. Synthetic page.
const URL = 'https://careers.acme.example/jobs/2597';
const scan = { url: 'https://acme.icims.com/jobs/2597/job?in_iframe=1', host: 'acme.icims.com', site: 'icims', context: { title: 'Software Engineer', company: 'Acme', logo: null }, fields: [], canOpenForm: true, jobPage: false };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const tab = await pageWithScripts(browser, { [URL]: '<!doctype html><title>Explore careers</title><h1>Explore Acme careers.</h1>' });
    await tab.open(URL);
    const panel = await panelFixture(browser, tab, { frame: { url: scan.url, replies: { scan, 'open-form': { ok: true } } } });
    await panel.waitForFunction(() => /Software Engineer/.test(document.getElementById('job-card')?.textContent ?? ''), { timeout: 10000 });
    await panel.waitForSelector('#open-form');
    await panel.evaluate(() => document.getElementById('open-form').click());
    await panel.waitForFunction(() => window.__frameAsked.includes('open-form'), { timeout: 5000 });
    console.log('PASS a job in a frame: its title and its Apply button');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
