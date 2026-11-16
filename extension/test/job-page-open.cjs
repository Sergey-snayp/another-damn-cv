const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A job posting opens the panel by itself, before any form is on the page, as
// Simplify's panel does (its Workday job pages). "Start Application" then
// clicks Apply and Workday's "Apply Manually". An ordinary page stays closed.
// Synthetic pages in Workday's markup.
const extension = path.resolve(__dirname, '..');
const WORKDAY = 'https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/job/UBC-Vancouver-Campus---Vancouver-BC-Canada/Programmer-Analyst-I-2_JR26638';
const PLAIN = 'https://blog.example.com/posts/hiring-tips';
const pages = {
  [WORKDAY]: `<!doctype html><title>Programmer Analyst I</title>
    <script type="application/ld+json">{"@context":"http://schema.org","@type":"JobPosting","title":"Programmer Analyst I","datePosted":"2026-11-13","description":"Flat copy without its lists.","hiringOrganization":{"@type":"Organization","name":"University of British Columbia"}}</script>
    <header><img data-automation-id="logo" src="https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/assets/logo" alt=""></header>
    <main aria-label="Job Posting Description"><h2 data-automation-id="jobPostingHeader">Programmer Analyst I</h2>
    <div data-automation-id="locations"><dl><dt>locations</dt><dd>UBC Vancouver Campus - Vancouver, BC Canada</dd></dl></div>
    <template id="apply"><a role="button" data-automation-id="adventureButton" href="#" onclick="event.preventDefault(); document.body.insertAdjacentHTML('beforeend', '<div data-automation-id=wd-popup-frame><a data-automation-id=applyManually href=# onclick=&quot;event.preventDefault(); window.manual = true&quot;>Apply Manually</a></div>'); window.applied = true">Apply</a></template>
    <script>/* Workday draws its Apply button a moment after the page loads. */ setTimeout(() => document.getElementById('apply').replaceWith(document.getElementById('apply').content), 1500);</script>
    <div data-automation-id="jobPostingDescription"><p>Build and support university systems.</p><h3>What you bring</h3><ul><li>Two years of web development</li><li>SQL and REST APIs</li></ul></div></main>`,
  [PLAIN]: '<!doctype html><title>Hiring tips</title><h1>Hiring tips</h1><p>How to read a job posting.</p>',
};

/** The real side panel, reading the job page the way Chrome would pass its messages. */
async function panelFixture(browser, jobPage, { silentFor = 0 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  await page.exposeFunction('readJobPage', message => jobPage.evaluate(message => window.__ask(message), message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const file = path.join(extension, new URL(request.url()).pathname);
    if (request.url().startsWith('http://extension.test/') && fs.existsSync(file)) {
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'image/png';
      void request.respond({ contentType, body: fs.readFileSync(file) });
    } else if (request.url().startsWith('http://localhost:3001/')) void request.respond({ contentType: 'application/json', body: '[]' });
    else void request.respond({ status: 404, body: '' });
  });
  await page.evaluateOnNewDocument(({ url, silentFor }) => {
    // A page still loading: its scripts do not answer for a moment, as Chrome says it.
    const answersFrom = Date.now() + silentFor;
    // Every view the panel shows, to prove it never flashed a wrong one.
    window.__views = [];
    new MutationObserver(() => {
      const host = document.getElementById('panel-autofill');
      const view = host?.querySelector('.skeleton') ? 'placeholder' : /Reload this page/.test(host?.textContent) ? 'reload' : host?.querySelector('#open-form') ? 'start' : host?.textContent.trim().slice(0, 40);
      if (view && window.__views.at(-1) !== view) window.__views.push(view);
      if (view === 'placeholder') window.__placeholder ??= [host.querySelector('.job-context').getBoundingClientRect().top, host.querySelector('.fill-block').getBoundingClientRect().top];
    }).observe(document, { subtree: true, childList: true });
    const store = { auth: { syncToken: 'fixture', user: { name: 'Sam Lee', email: 'sam@example.com' } }, profile: {}, chosenResumeId: 'cv1' };
    const event = { addListener() {}, removeListener() {} };
    window.chrome = {
      runtime: { id: 'test', getURL: file => `http://extension.test/${file}`, getManifest: () => ({ version: 'test' }), onMessage: event, sendMessage: async message => (message.type === 'panel-tab' ? { tabId: 1 } : {}) },
      storage: { local: { get: async keys => Object.fromEntries([].concat(keys ?? Object.keys(store)).filter(key => key in store).map(key => [key, store[key]])), set: async value => Object.assign(store, value), remove: async () => {} }, session: { get: async () => ({}), set: async () => {} }, onChanged: event },
      tabs: { query: async () => [{ id: 1, url }], get: async () => ({ id: 1, url }), sendMessage: async (_, message) => { if (Date.now() < answersFrom) throw new Error('Could not establish connection. Receiving end does not exist.'); return window.readJobPage(message); }, onUpdated: event, onActivated: event, create: async () => ({}) },
      webNavigation: { getAllFrames: async () => [{ frameId: 0, url }] },
      scripting: { executeScript: async () => [] },
      permissions: { request: async () => true, contains: async () => true },
      identity: { getRedirectURL: () => 'https://fixture.chromiumapp.org/' },
      windows: { getCurrent: async () => ({ width: 1400, height: 900 }), onRemoved: event },
    };
  }, { url: jobPage.url(), silentFor });
  await page.goto('http://extension.test/src/sidepanel.html');
  return page;
}

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
    await page.waitForSelector('[data-automation-id="adventureButton"]');
    const scan = await page.evaluate(() => window.__ask({ type: 'scan' }));
    assert.equal(scan.canOpenForm, true, 'the panel offers Start Application');
    // The job card, read as Simplify reads Workday: the employer and its logo, never the web address.
    assert.equal(scan.context.title, 'Programmer Analyst I');
    assert.equal(scan.context.company, 'University of British Columbia', "the posting's own name for the employer");
    assert.equal(scan.context.logo, 'https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/assets/logo', "Workday's header logo, though it is on Workday's site");
    const details = await page.evaluate(() => window.__ask({ type: 'job-details' }));
    assert.equal(details.location, 'UBC Vancouver Campus - Vancouver, BC Canada');
    assert.match(details.description, /Build and support university systems\.\s+What you bring\s+Two years of web development\s+SQL and REST APIs/, 'the page\'s own description, its heading and list kept, not the flat copy');
    // Without the structured data: the Workday tenant's name.
    const tenant = await page.evaluate(() => { document.querySelector('script[type="application/ld+json"]').remove(); return window.CVAutofillJobDetails.company(); });
    assert.equal(tenant, 'UBC');
    console.log('PASS Workday job card: title, employer, logo, location and the description with its lists');
    assert.equal(await page.evaluate(() => Boolean(window.applied)), false, 'opening the panel clicks nothing');
    // The real panel, as Simplify's shows a job page: the job, then Start Application. No warning.
    // Opened again: the panel meets the page before it answers, then before its Apply button is drawn.
    await open(`${WORKDAY}?source=LinkedIn`);
    const panel = await panelFixture(browser, page, { silentFor: 600 });
    await panel.waitForSelector('#open-form', { timeout: 10000 });
    assert.deepEqual(await panel.evaluate(() => window.__views), ['placeholder', 'start'], 'the placeholder, then Start Application: never "Reload this page" or "Rescan page" in between');
    const [card, button] = await panel.evaluate(() => window.__placeholder);
    const landed = await panel.evaluate(() => [document.querySelector('#panel-autofill .job-context').getBoundingClientRect().top, document.querySelector('#panel-autofill .fill-block').getBoundingClientRect().top]);
    assert.ok(Math.abs(landed[0] - card) <= 1 && Math.abs(landed[1] - button) <= 1, `the job card and Start Application land where their placeholders were: ${landed} vs ${[card, button]}`);
    await panel.evaluate(() => { window.__painted = 0; new MutationObserver(() => window.__painted++).observe(document.getElementById('panel-autofill'), { childList: true }); });
    await panel.evaluate(() => document.getElementById('reload').click());
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal(await panel.evaluate(() => window.__painted), 0, 'a rescan that finds the same page redraws nothing');
    assert.equal(await panel.$eval('#open-form', button => button.textContent.trim()), 'Start Application');
    assert.doesNotMatch(await panel.$eval('#panel-autofill', node => node.textContent), /No application fields found|Rescan/);
    await panel.screenshot({ path: '/private/tmp/job-page-start-application.png' });
    await panel.click('#open-form');
    // The job page is a background tab here: wait by timer, not by repaint.
    await page.waitForFunction(() => window.applied === true && window.manual === true, { timeout: 5000, polling: 100 });
    await panel.close();
    console.log('PASS Workday job page: the panel opens by itself, and Start Application clicks Apply, then Apply Manually');

    await open(PLAIN);
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal(await page.evaluate(() => window.CVAutofillPanel?.isOpen()), false, 'an ordinary page stays closed');
    console.log('PASS an ordinary page without a job or form: the panel stays closed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
