const fs = require('node:fs');
const path = require('node:path');

const extension = path.resolve(__dirname, '..');
/** The page scripts, in load order (src/page-scripts.js). */
const pageScripts = () => JSON.parse(fs.readFileSync(path.join(extension, 'src/page-scripts.js'), 'utf8').match(/PAGE_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

/**
 * The real side panel (src/sidepanel.html), reading a job page the way Chrome
 * passes its messages. `silentFor`: the page does not answer at first, as one
 * still loading. `server`: the account's job-site login ({ login, saves }).
 * `session`: what the background keeps in chrome.storage.session (a LinkedIn hand-off).
 * `frame`: a second frame { url, replies: { scan, … } }, its answers by message type.
 * `stored`: more of chrome.storage.local. `server.account`: the profile on the server
 * (`server.down`: its read fails; `server.patches`: what the panel saved to it).
 */
async function panelFixture(browser, jobPage, { silentFor = 0, profile = {}, server = { login: null, saves: [] }, offer = null, session = {}, stored = {}, frame = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  await page.exposeFunction('readJobPage', message => jobPage.evaluate(message => window.__ask(message), message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const address = new URL(request.url());
    const file = path.join(extension, address.pathname);
    // A real extension may call the app across sites; this page needs CORS for it.
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE' };
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
      // A site's own login (a password changed there only) when the page asks for its host.
      const host = address.searchParams.get('host'), own = server.own ?? {};
      json({ login: host && own[host] ? { ...own[host], site: host } : server.login, sites: server.sites ?? [], ownLogins: Object.keys(own) });
    } else if (address.origin === 'http://localhost:3001' && /^\/api\/extension\/site-login\/sites\/[^/]+\/login$/.test(address.pathname) && request.method() === 'DELETE') {
      const host = decodeURIComponent(address.pathname.split('/')[5]);
      if (server.own) delete server.own[host];
      json({ ownLogins: Object.keys(server.own ?? {}) });
    } else if (address.origin === 'http://localhost:3001' && address.pathname === '/api/jobs/lookup') {
      // `server.lookup(url)`: the saved job the server finds for a page address, or null.
      (server.requests ??= []).push(`lookup ${address.searchParams.get('url')}`);
      json({ job: server.lookup?.(address.searchParams.get('url')) ?? null });
    } else if (address.origin === 'http://localhost:3001' && /^\/api\/extension\/jobs\/[^/]+$/.test(address.pathname) && request.method() === 'GET') {
      // `server.jobs[id]`: one saved job with its description.
      const id = decodeURIComponent(address.pathname.split('/').pop());
      (server.requests ??= []).push(`job ${id}`);
      if (server.jobs?.[id]) json(server.jobs[id]); else void request.respond({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
    } else if (address.origin === 'http://localhost:3001' && address.pathname === '/api/profile/sync') {
      (server.requests ??= []).push('profile');
      if (server.down) void request.respond({ status: 500, headers: cors, contentType: 'application/json', body: '{}' }); else json(server.account ?? {});
    } else if (address.origin === 'http://localhost:3001' && address.pathname === '/api/extension/profile' && request.method() === 'PATCH') {
      const values = JSON.parse(request.postData());
      (server.patches ??= []).push(values);
      json(Object.assign(server.account ??= {}, values));
    } else if (address.origin === 'http://localhost:3001') json([]);
    else void request.respond({ status: 404, body: '' });
  });
  await page.evaluateOnNewDocument(({ url, silentFor, profile, offer, session, stored, frame }) => {
    window.__frameAsked = [];
    // The background's side: an "Update your job-site password?" offer, and what the panel answered.
    window.__offer = offer; window.__answers = [];
    const background = message => {
      if (message.type === 'panel-tab') return { tabId: 1 };
      if (message.type === 'site-login-offer?') return window.__offer;
      if (message.type === 'site-login-offer-accept') { window.__answers.push(`accept ${message.scope}`); window.__offer = null; return { result: 'saved', scope: message.scope }; }
      if (message.type === 'site-login-offer-dismiss') { window.__answers.push('dismiss'); window.__offer = null; return { ok: true }; }
      return {};
    };
    // A page still loading: its scripts do not answer for a moment, as Chrome says it.
    const answersFrom = Date.now() + silentFor;
    // Every view the panel shows, to prove it never flashed a wrong one.
    window.__views = [];
    new MutationObserver(() => {
      const host = document.getElementById('panel-autofill');
      const view = host?.querySelector('.skeleton') ? 'placeholder' : /Reload this page/.test(host?.textContent) ? 'reload' : host?.querySelector('#open-form') ? 'start' : host?.querySelector('#account-fill') ? 'account' : host?.textContent.trim().slice(0, 40);
      if (view && window.__views.at(-1) !== view) window.__views.push(view);
      // Where the placeholder was just before the real view replaced it (its styles loaded by then).
      if (view === 'placeholder') window.__placeholder = [host.querySelector('.job-context').getBoundingClientRect().top, host.querySelector('.fill-block').getBoundingClientRect().top];
    }).observe(document, { subtree: true, childList: true });
    window.__deliver = message => { for (const listener of window.__panelListeners ?? []) listener(message, { tab: { id: 1 }, frameId: 0 }, () => {}); };
    const store = window.__store = { auth: { syncToken: 'fixture', user: { name: 'Sam Lee', email: 'sam@example.com' } }, profile, chosenResumeId: 'cv1', ...stored };
    const event = { addListener() {}, removeListener() {} };
    window.chrome = {
      // Messages from the page reach the panel through window.__deliver(message), as Chrome passes them.
      runtime: { id: 'test', getURL: file => `http://extension.test/${file}`, getManifest: () => ({ version: 'test' }), onMessage: { addListener: listener => (window.__panelListeners ??= []).push(listener), removeListener() {} }, sendMessage: async message => background(message) },
      storage: { local: { get: async keys => Object.fromEntries([].concat(keys ?? Object.keys(store)).filter(key => key in store).map(key => [key, store[key]])), set: async value => Object.assign(store, value), remove: async keys => { for (const key of [].concat(keys)) delete store[key]; } }, session: { get: async key => (key in session ? { [key]: session[key] } : {}), set: async value => Object.assign(session, value) }, onChanged: event },
      tabs: { query: async () => [{ id: 1, url }], get: async () => ({ id: 1, url }), sendMessage: async (_, message, options) => { if (options?.frameId) { window.__frameAsked.push(message.type); return frame?.replies?.[message.type] ?? { ok: true }; } if (Date.now() < answersFrom) throw new Error('Could not establish connection. Receiving end does not exist.'); return window.readJobPage(message); }, onUpdated: event, onActivated: event, create: async () => ({}) },
      webNavigation: { getAllFrames: async () => [{ frameId: 0, url }, ...(frame ? [{ frameId: 5, url: frame.url }] : [])] },
      scripting: { executeScript: async () => [] },
      permissions: { request: async () => true, contains: async () => true },
      identity: { getRedirectURL: () => 'https://fixture.chromiumapp.org/' },
      windows: { getCurrent: async () => ({ width: 1400, height: 900 }), onRemoved: event },
    };
  }, { url: jobPage.url(), silentFor, profile, offer, session, stored, frame });
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
      // What the page scripts tell the extension, kept for the test to read.
      // The background's reply to "was a sign-in sent here?": window.__loginPending, set by page.open's setup.
      runtime: { id: 'test', getURL: file => (file.endsWith('.html') ? 'data:text/html,<p>Panel</p>' : 'data:text/css,'), onMessage: { addListener: listener => window.__listeners.push(listener) }, sendMessage: async message => { (window.__sent ??= []).push(message); return message.type === 'site-login-check' ? { pending: Boolean(window.__loginPending) } : {}; } },
      // Animation off unless a test turns it on (window.__settings): most tests check what fills, not how it moves.
      storage: { local: { get: async () => ({ animateFill: false, ...(window.__settings ?? {}) }), set: async () => {} }, onChanged: { addListener() {} } },
    };
    window.__ask = message => new Promise(resolve => { for (const listener of window.__listeners) listener(message, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, resolve); });
  });
  const scripts = pageScripts();
  page.open = async (url, setup) => {
    await page.goto(url);
    if (setup) await page.evaluate(setup);
    for (const file of scripts) await page.addScriptTag({ path: path.join(extension, file) });
  };
  return page;
}

module.exports = { panelFixture, pageWithScripts, pageScripts };
