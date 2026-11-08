const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Quick tailoring in a window inside the job page, with the real extension loaded
// in Chrome and the app from the local dev server (http://localhost:5173). Every
// API answer is synthetic: nothing signs in to a real account or saves anything.
const extension = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const TAILOR = '/popup/jobs/job-1/quick-tailor?from=source';

const resume = {
  snapshot: 1, contact: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
  summaries: { default: 'Backend engineer.' },
  experiences: [{ lineageId: 'role-1', company: 'Acme Labs', title: 'Backend Engineer', from: '2020', current: true,
    achievements: [{ lineageId: 'b-1', experienceLineageId: 'role-1', bullet: 'Built payment APIs.' }] }],
  educations: [], skills: [{ lineageId: 's-1', name: 'Node.js', category: 'Backend' }], projects: [], certifications: [], customSections: [],
};

async function main() {
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><title>Backend Engineer at Acme</title><body style="height:3000px;font:16px system-ui"><h1>Backend Engineer</h1><p>Build Node.js services.</p></body>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const jobUrl = `http://127.0.0.1:${server.address().port}/jobs/1`;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, pipe: true, enableExtensions: [extension],
  });
  try {
    const worker = await (await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://') && target.url().endsWith('/src/background.js'), { timeout: 15000 })).worker();
    const signIn = (signedIn) => worker.evaluate(on => (on
      ? chrome.storage.local.set({ auth: { syncToken: 'test-sync-token', user: { id: 'u-1', name: 'Sam Lee', email: 'sam@example.com' } } })
      : chrome.storage.local.remove('auth')), signedIn);
    // The worker's extension APIs appear a moment after it starts.
    for (let i = 0; i < 50 && !(await worker.evaluate(() => typeof chrome !== 'undefined' && Boolean(chrome.storage)).catch(() => false)); i++) await pause(100);
    await signIn(true);

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const calls = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const reply = (body, status = 200) => request.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname.startsWith('/api/')) calls.push({ origin: url.origin, path: url.pathname, auth: request.headers().authorization ?? '', body: request.postData() });
      if (url.origin === 'http://localhost:3001' && url.pathname === '/api/auth/embed-ticket') {
        if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-allow-methods': 'POST' } });
        return request.headers().authorization === 'Bearer test-sync-token' ? reply({ ticket: `ticket-${calls.length}` }) : reply({ message: 'Invalid sync token.' }, 401);
      }
      if (url.origin !== 'http://localhost:5173' || !url.pathname.startsWith('/api/')) return request.continue();
      if (url.pathname === '/api/auth/embed-session') {
        const { ticket } = JSON.parse(request.postData() || '{}');
        return /^ticket-\d+$/.test(ticket) ? reply({ token: `embed-for-${ticket}` }) : reply({ message: 'expired' }, 401);
      }
      if (!/^Embed embed-for-ticket-\d+$/.test(request.headers().authorization ?? '')) return reply({ message: 'Not signed in.' }, 401);
      if (url.pathname === '/api/auth/me') return reply({ id: 'u-1', name: 'Sam Lee', email: 'sam@example.com', avatarUrl: null });
      if (url.pathname === '/api/jobs/job-1/quick-tailor') return reply({ resumeId: null, sourceResumeId: 'source', name: 'Sam_Lee_CV_Acme', document: resume, theme: null });
      if (url.pathname === '/api/jobs/job-1') return reply({ id: 'job-1', title: 'Backend Engineer', company: 'Acme', description: 'Build Node.js services.' });
      if (url.pathname.endsWith('/job-assessment')) return reply({ message: 'off' }, 503);
      if (url.pathname.endsWith('/score')) return reply({ score: null, keywords: null, issues: [] });
      if (url.pathname === '/api/jobs') return reply([]);
      return reply({});
    });
    await page.goto(jobUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(document.querySelector('#adcv-autofill-panel') || window.top === window), { timeout: 5000 });
    await pause(800); // Content scripts run at document_idle.

    const open = (tailorPath = TAILOR) => worker.evaluate(async (url, tailorPath) => {
      const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === url);
      return chrome.tabs.sendMessage(tab.id, { type: 'tailor-open', path: tailorPath }, { frameId: 0 });
    }, jobUrl, tailorPath);
    const appFrame = async () => {
      for (let i = 0; i < 100; i++) {
        const frame = page.frames().find(candidate => candidate.url().startsWith('http://localhost:5173/'));
        if (frame) return frame;
        await pause(100);
      }
      throw new Error('the app frame never loaded');
    };
    const tailorOpen = () => page.evaluate(() => Boolean(document.getElementById('adcv-tailor')?.isConnected));

    // 1) Opens over the job page, the popup's size, signed in through the one-time ticket.
    assert.deepEqual(await open(), { ok: true });
    assert.equal(await tailorOpen(), true);
    const app = await appFrame();
    await app.waitForSelector('.studio.qt', { timeout: 20000 });
    await app.waitForSelector('[data-section="summary"]', { timeout: 20000 });
    assert.match(app.url(), /\/popup\/jobs\/job-1\/quick-tailor\?from=source&embed=1$/);
    const outer = page.frames().find(frame => frame.url().startsWith('chrome-extension://'));
    const box = await (await outer.frameElement()).boundingBox();
    assert.deepEqual([Math.round(box.width), Math.round(box.height)], [1180, 840], 'the size the popup window had');
    assert.deepEqual([Math.round(box.x), Math.round(box.y)], [110, 30], 'centered over the page');
    assert.equal(await outer.$eval('#wait', element => element.hidden), true, 'the waiting note goes once the app is drawn');
    const ticketCall = calls.find(call => call.path === '/api/auth/embed-ticket');
    assert.equal(ticketCall.auth, 'Bearer test-sync-token', 'the extension asks for the ticket with its sync token');
    const session = calls.find(call => call.path === '/api/auth/embed-session');
    assert.equal(session.auth, '', 'the ticket is traded without any other credential');
    const appCalls = calls.filter(call => call.origin === 'http://localhost:5173' && call.path !== '/api/auth/embed-session');
    assert.ok(appCalls.length >= 3, 'the app loaded its data');
    for (const call of appCalls) assert.match(call.auth, /^Embed embed-for-ticket-\d+$/, `${call.path} carries the embed session`);
    await app.evaluate(() => document.fonts.ready.then(() => undefined));
    assert.match(await app.$eval('[data-section="summary"]', element => element.textContent), /Backend engineer\./, 'the CV is drawn');
    await page.screenshot({ path: '/private/tmp/tailor-window-open.png' });

    // 2) The page behind does not scroll under the window.
    const scrolled = await page.evaluate(() => scrollY);
    await page.mouse.move(40, 450);
    await page.mouse.wheel({ deltaY: 600 });
    await pause(300);
    assert.equal(await page.evaluate(() => scrollY), scrolled);

    // 3) What the app tells the extension (the CV to use) reaches it from the window too.
    await app.evaluate(() => window.parent.postMessage({ type: 'CV_PLATFORM_USE_RESUME', resumeId: 'copy-1' }, location.ancestorOrigins[0]));
    await pause(300);
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('chosenResumeId')).chosenResumeId), 'copy-1');

    // 4) Close with no changes closes at once.
    const closeButton = () => app.evaluateHandle(() => [...document.querySelectorAll('.studio-actions button')].find(button => button.textContent === 'Close'));
    await (await closeButton()).click();
    await page.waitForFunction(() => !document.getElementById('adcv-tailor')?.isConnected, { timeout: 3000 });

    // 5) With unsaved changes Close asks first, in the app's own header.
    await open();
    const again = await appFrame();
    await again.waitForSelector('[data-section="summary"] [contenteditable="true"]', { timeout: 20000 });
    await again.click('[data-section="summary"] [contenteditable="true"]');
    await again.evaluate(() => document.execCommand('insertText', false, ' Edited.'));
    await again.evaluate(() => document.activeElement.blur());
    await pause(200);
    await (await again.evaluateHandle(() => [...document.querySelectorAll('.studio-actions button')].find(button => button.textContent === 'Close'))).click();
    await again.waitForSelector('.qt-close-confirm');
    assert.equal(await tailorOpen(), true, 'nothing is lost without asking');
    await (await again.evaluateHandle(() => [...document.querySelectorAll('.qt-close-confirm button')].find(button => button.textContent === 'Keep editing'))).click();
    assert.equal(await again.$('.qt-close-confirm'), null);
    await (await again.evaluateHandle(() => [...document.querySelectorAll('.studio-actions button')].find(button => button.textContent === 'Close'))).click();
    await (await again.evaluateHandle(() => [...document.querySelectorAll('.qt-close-confirm button')].find(button => button.textContent === 'Close anyway'))).click();
    await page.waitForFunction(() => !document.getElementById('adcv-tailor')?.isConnected, { timeout: 3000 });

    // 6) Only Quick tailoring links open; signed out, it says what to do.
    assert.deepEqual(await open('/documents/source'), { ok: false });
    assert.equal(await tailorOpen(), false);
    await signIn(false);
    await open();
    const signedOut = await appFrame();
    await signedOut.waitForFunction(() => /Sign in to CV Autofill first/.test(document.body.textContent), { timeout: 10000 });
    await page.screenshot({ path: '/private/tmp/tailor-window-signed-out.png' });
    await (await signedOut.evaluateHandle(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Close'))).click();
    await page.waitForFunction(() => !document.getElementById('adcv-tailor')?.isConnected, { timeout: 3000 });

    console.log('PASS Quick tailoring opens inside the job page, signs in with a one-time ticket, and closes safely');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
