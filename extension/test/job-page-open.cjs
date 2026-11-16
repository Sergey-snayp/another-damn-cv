const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A job posting opens the panel by itself, before any form is on the page, as
// Simplify's panel does (its Workday job pages). "Open application form" then
// clicks Apply and Workday's "Apply Manually". An ordinary page stays closed.
// Synthetic pages in Workday's markup.
const extension = path.resolve(__dirname, '..');
const WORKDAY = 'https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/job/UBC-Vancouver-Campus---Vancouver-BC-Canada/Programmer-Analyst-I-2_JR26638';
const PLAIN = 'https://blog.example.com/posts/hiring-tips';
const pages = {
  [WORKDAY]: `<!doctype html><title>Programmer Analyst I</title>
    <main><h2 data-automation-id="jobPostingHeader">Programmer Analyst I</h2>
    <a role="button" data-automation-id="adventureButton" href="#" onclick="event.preventDefault(); document.body.insertAdjacentHTML('beforeend', '<div data-automation-id=wd-popup-frame><a data-automation-id=applyManually href=# onclick=&quot;event.preventDefault(); window.manual = true&quot;>Apply Manually</a></div>'); window.applied = true">Apply</a>
    <div data-automation-id="jobPostingDescription"><p>Build and support university systems.</p></div></main>`,
  [PLAIN]: '<!doctype html><title>Hiring tips</title><h1>Hiring tips</h1><p>How to read a job posting.</p>',
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const body = pages[request.url().split('?')[0]];
      return void request.respond(body ? { contentType: 'text/html', body } : { status: 404, body: '' });
    });
    await page.evaluateOnNewDocument(() => {
      window.__listeners = [];
      window.chrome = {
        runtime: { id: 'test', getURL: file => (file.endsWith('.html') ? 'data:text/html,<p>Panel</p>' : 'data:text/css,'), onMessage: { addListener: listener => window.__listeners.push(listener) }, sendMessage: async () => ({}) },
        storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
      };
      window.__ask = message => new Promise(resolve => { for (const listener of window.__listeners) listener(message, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, resolve); });
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
    const scripts = manifest.content_scripts.find(entry => entry.js.includes('src/content.js')).js;
    const open = async url => {
      await page.goto(url);
      for (const file of scripts) await page.addScriptTag({ path: path.join(extension, file) });
    };

    await open(`${WORKDAY}?source=LinkedIn`);
    await page.waitForFunction(() => window.CVAutofillPanel?.isOpen(), { timeout: 5000 });
    const scan = await page.evaluate(() => window.__ask({ type: 'scan' }));
    assert.equal(scan.canOpenForm, true, 'the panel offers "Open application form"');
    assert.equal(await page.evaluate(() => Boolean(window.applied)), false, 'opening the panel clicks nothing');
    await page.evaluate(() => window.__ask({ type: 'open-form' }));
    await page.waitForFunction(() => window.manual === true, { timeout: 5000 });
    console.log('PASS Workday job page: the panel opens by itself, and "Open application form" clicks Apply, then Apply Manually');

    await open(PLAIN);
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal(await page.evaluate(() => window.CVAutofillPanel?.isOpen()), false, 'an ordinary page stays closed');
    console.log('PASS an ordinary page without a job or form: the panel stays closed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
