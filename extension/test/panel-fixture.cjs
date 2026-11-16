const fs = require('node:fs');
const path = require('node:path');

const extension = path.resolve(__dirname, '..');

/**
 * The real side panel (src/sidepanel.html), reading a job page the way Chrome
 * passes its messages. `silentFor`: the page does not answer at first, as one
 * still loading. `server`: the account's job-site login ({ login, saves }).
 */
async function panelFixture(browser, jobPage, { silentFor = 0, profile = {}, server = { login: null, saves: [] } } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  await page.exposeFunction('readJobPage', message => jobPage.evaluate(message => window.__ask(message), message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const address = new URL(request.url());
    const file = path.join(extension, address.pathname);
    // A real extension may call the app across sites; this page needs CORS for it.
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE' };
    const json = body => void request.respond({ contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (address.origin === 'http://localhost:3001' && request.method() === 'OPTIONS') return void request.respond({ status: 204, headers: cors, body: '' });
    if (request.url().startsWith('http://extension.test/') && fs.existsSync(file)) {
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'image/png';
      void request.respond({ contentType, body: fs.readFileSync(file) });
    } else if (address.origin === 'http://localhost:3001' && address.pathname === '/api/extension/site-login') {
      if (request.method() === 'PUT') {
        server.login = { ...JSON.parse(request.postData()), updatedAt: '2026-11-16T10:00:00.000Z' };
        server.saves.push(server.login);
      }
      json({ login: server.login });
    } else if (address.origin === 'http://localhost:3001') json([]);
    else void request.respond({ status: 404, body: '' });
  });
  await page.evaluateOnNewDocument(({ url, silentFor, profile }) => {
    // A page still loading: its scripts do not answer for a moment, as Chrome says it.
    const answersFrom = Date.now() + silentFor;
    // Every view the panel shows, to prove it never flashed a wrong one.
    window.__views = [];
    new MutationObserver(() => {
      const host = document.getElementById('panel-autofill');
      const view = host?.querySelector('.skeleton') ? 'placeholder' : /Reload this page/.test(host?.textContent) ? 'reload' : host?.querySelector('#open-form') ? 'start' : host?.querySelector('#account-fill') ? 'account' : host?.textContent.trim().slice(0, 40);
      if (view && window.__views.at(-1) !== view) window.__views.push(view);
      if (view === 'placeholder') window.__placeholder ??= [host.querySelector('.job-context').getBoundingClientRect().top, host.querySelector('.fill-block').getBoundingClientRect().top];
    }).observe(document, { subtree: true, childList: true });
    const store = { auth: { syncToken: 'fixture', user: { name: 'Sam Lee', email: 'sam@example.com' } }, profile, chosenResumeId: 'cv1' };
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
  }, { url: jobPage.url(), silentFor, profile });
  await page.goto('http://extension.test/src/sidepanel.html');
  return page;
}

/** A job page with the content scripts, as Chrome injects them, and a way to ask them as the panel does. */
async function pageWithScripts(browser, pages) {
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
  const scripts = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'))).content_scripts.find(entry => entry.js.includes('src/content.js')).js;
  page.open = async url => {
    await page.goto(url);
    for (const file of scripts) await page.addScriptTag({ path: path.join(extension, file) });
  };
  return page;
}

module.exports = { panelFixture, pageWithScripts };
