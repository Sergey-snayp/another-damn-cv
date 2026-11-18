const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// The real extension in Chrome: only the small page check runs on an ordinary
// page, and the page scripts arrive where a job or a form may be, or when the
// toolbar icon is pressed. Synthetic pages on a local server.
const extension = path.resolve(__dirname, '..');
const fields = '<label for=a>First name</label><input id=a><label for=b>Last name</label><input id=b><label for=c>Email</label><input id=c type=email><label for=d>Phone</label><input id=d>';
const pages = {
  '/news': '<title>Today</title><h1>News</h1><form role=search><input type=search></form><p>Story</p>',
  '/signin': '<title>Welcome</title><form><input type=email><input type=password></form>',
  '/late': `<title>Welcome</title><main id=m></main><script>setTimeout(() => { m.innerHTML = ${JSON.stringify(`<form>${fields}</form>`)} }, 300)</script>`,
  '/jobs/1/apply': `<title>Apply: Engineer</title><h1>Application</h1><form>${fields}<button>Submit application</button></form>`,
  '/embed': '<title>Welcome</title><h1>Team</h1><iframe src="/frame-form" width=700 height=500></iframe>',
  '/frame-form': `<title>Form</title><h1>Application</h1><form>${fields}<input type=file aria-label="Resume"><button>Submit application</button></form>`,
};
const until = async (check, what, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(resolve => setTimeout(resolve, 100))) if (await check()) return;
  assert.fail(`timed out: ${what}`);
};

(async () => {
  const server = http.createServer((request, response) => { response.setHeader('content-type', 'text/html'); response.end(`<!doctype html>${pages[request.url] ?? ''}`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true, enableExtensions: [extension] });
  try {
    const worker = await (await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'), { timeout: 15000 })).worker();
    await until(() => worker.evaluate(() => Boolean(globalThis.chrome?.scripting)).catch(() => false), 'the service worker');
    // In each frame of the tab at this address: [frame path, page check there, page scripts there].
    const state = address => worker.evaluate(async url => {
      const [tab] = await chrome.tabs.query({ url });
      if (!tab) return [];
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => [location.pathname, Boolean(window.__adcvPageCheck), Boolean(window.CVAutofillFields)] });
      return results.map(result => result.result);
    }, address);
    const open = async route => { const page = await browser.newPage(); await page.goto(base + route, { waitUntil: 'load' }); return page; };
    const loaded = async route => (await state(base + route)).find(([where]) => where === route)?.[2] === true;
    const hasButton = page => page.evaluate(() => Boolean(document.getElementById('adcv-autofill-launcher')));

    for (const route of ['/news', '/signin']) {
      const page = await open(route);
      await new Promise(resolve => setTimeout(resolve, 1500));
      assert.deepEqual(await state(base + route), [[route, true, false]], `${route}: only the page check`);
      assert.equal(await hasButton(page), false);
      await page.close();
    }

    const late = await open('/late');
    await until(() => loaded('/late'), 'a form that appears later loads the page scripts');
    await late.close();

    const form = await open('/jobs/1/apply');
    await until(() => loaded('/jobs/1/apply'), 'an application form loads the page scripts');
    await until(() => form.frames().some(frame => frame.url().includes('sidepanel.html')), 'the panel opens by itself');
    await form.close();

    const embedded = await open('/embed');
    await until(async () => { const frames = await state(`${base}/embed`); return frames.length === 2 && frames.every(frame => frame[2]); }, 'a form in a frame loads the frame and the top page');
    await until(() => embedded.frames().some(frame => frame.url().includes('sidepanel.html')), 'the panel opens for a form in a frame');
    await embedded.close();

    // The toolbar icon on an ordinary page.
    const news = await open('/news');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await loaded('/news'), false);
    await worker.evaluate(async url => { const [tab] = await chrome.tabs.query({ url }); chrome.action.onClicked.dispatch(tab); }, `${base}/news`);
    await until(() => loaded('/news'), 'the toolbar icon loads the page scripts');
    await until(() => news.frames().some(frame => frame.url().includes('sidepanel.html')), 'and opens the panel');
    console.log('PASS only the page check runs on ordinary pages; forms, job pages, frames and the toolbar icon load the rest');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
