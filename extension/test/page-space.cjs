const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// The open panel narrows the page instead of covering it: a fixed header, a
// centered pop-up and a block wider than the room left are pulled in, and all
// of it is put back exactly when the panel closes.
const extension = path.resolve(__dirname, '..');
const html = `<!doctype html><title>Apply</title>
<style>body { margin: 0; font: 14px system-ui } header { position: fixed; top: 0; left: 0; right: 0; height: 48px; background: #eee }
main { padding: 64px 24px } #wide { width: 1300px; height: 40px; background: #ddd }
#popup { position: fixed; top: 100px; left: 50%; transform: translateX(-50%); width: 700px; height: 200px; background: #fff; border: 1px solid #000 }</style>
<header id="bar" style="color: red">Jobs</header>
<main><label for="first">First name</label><input id="first"><div id="wide"></div></main>
<div id="popup">Apply to Quo</div>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setContent(html);
    await page.evaluate(() => {
      window.chrome = { runtime: { id: 'test', getURL: () => 'data:text/html,<p>Panel</p>', sendMessage: async () => ({}), onMessage: { addListener() {} } } };
    });
    for (const file of ['src/top-layer.js', 'src/panel-host.js']) await page.addScriptTag({ path: path.join(extension, file) });
    const read = () => page.evaluate(() => {
      const right = id => Math.round(document.getElementById(id).getBoundingClientRect().right);
      return { bar: right('bar'), wide: right('wide'), popup: right('popup'), input: right('first'), barStyle: document.getElementById('bar').style.cssText, wideStyle: document.getElementById('wide').style.cssText, space: Boolean(document.getElementById('adcv-page-space')) };
    });
    const before = await read();
    assert.ok(before.bar > 1400 && before.wide > 1300);

    await page.evaluate(() => window.CVAutofillPanel.open());
    await new Promise(resolve => setTimeout(resolve, 900));
    const open = await read();
    const edge = 1440 - 400;
    assert.equal(open.space, true);
    for (const id of ['bar', 'wide', 'popup', 'input']) assert.ok(open[id] <= edge + 2, `${id} ends at ${open[id]}, left of the panel at ${edge}`);

    await page.evaluate(() => window.CVAutofillPanel.close());
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.deepEqual(await read(), before, 'closing the panel puts the page back exactly');

    // LinkedIn's job columns: items of a flex row that does not wrap keep their width and spill
    // under the panel until they may shrink (Simplify does the same).
    await page.setContent(`<!doctype html><style>body { margin: 0 } .row { display: flex; flex-wrap: nowrap }
      .list { flex: 0 0 400px } .detail { flex: 0 0 900px; height: 300px }</style>
      <div class="row" id="row"><div class="list">Jobs</div><section class="detail" id="detail">Senior Backend Engineer</section></div>`);
    await page.evaluate(() => { window.chrome = { runtime: { id: 'test', getURL: () => 'data:text/html,<p>Panel</p>', sendMessage: async () => ({}), onMessage: { addListener() {} } } }; });
    for (const file of ['src/top-layer.js', 'src/panel-host.js']) await page.addScriptTag({ path: path.join(extension, file) });
    await page.evaluate(() => window.CVAutofillPanel.open());
    await new Promise(resolve => setTimeout(resolve, 900));
    const detail = await page.evaluate(() => Math.round(document.getElementById('detail').getBoundingClientRect().right));
    assert.ok(detail <= 1440 - 400 + 2, `the job column shrinks with its row: ends at ${detail}`);
    // Something that appears later (LinkedIn's Easy Apply) is pulled in too: the panel keeps checking.
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="late" style="position:fixed;top:0;left:0;right:0;height:40px">Easy Apply</div>'));
    await new Promise(resolve => setTimeout(resolve, 2500));
    const late = await page.evaluate(() => Math.round(document.getElementById('late').getBoundingClientRect().right));
    assert.ok(late <= 1440 - 400 + 2, `a bar added later ends before the panel: ${late}`);
    console.log('PASS the open panel makes room on the page, and closing it puts everything back');

    // LinkedIn: a strict style policy blocks <style> elements a page did not ship. The page
    // still moves, because <html> is narrowed through its own style. A fixed top bar and a
    // centered column, as on LinkedIn's jobs page.
    const strict = await browser.newPage();
    await strict.setViewport({ width: 1280, height: 800 });
    await strict.setRequestInterception(true);
    strict.on('request', request => void request.respond({
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': "style-src 'self'" },
      body: `<!doctype html><title>Jobs | LinkedIn</title>
        <header id="global-nav" style="position:fixed;top:0;left:0;width:100%;height:52px">Jobs</header>
        <main id="column" style="max-width:1128px;margin:60px auto 0;height:400px">Senior Software Engineer at Conexiom</main>`,
    }));
    await strict.goto('https://www.linkedin.com/jobs/search/');
    await strict.evaluate(() => { window.chrome = { runtime: { id: 'test', getURL: () => 'data:text/html,<p>Panel</p>', sendMessage: async () => ({}), onMessage: { addListener() {} } } }; });
    for (const file of ['src/top-layer.js', 'src/panel-host.js']) await strict.addScriptTag({ path: path.join(extension, file) });
    const blocked = await strict.evaluate(() => {
      const probe = document.createElement('style');
      probe.textContent = '#column { color: rgb(1, 2, 3) }';
      document.head.append(probe);
      const applied = getComputedStyle(document.getElementById('column')).color === 'rgb(1, 2, 3)';
      probe.remove();
      return !applied;
    });
    assert.equal(blocked, true, 'the policy blocks added style sheets here, as on LinkedIn');
    await strict.evaluate(() => window.CVAutofillPanel.open());
    await new Promise(resolve => setTimeout(resolve, 900));
    const rights = await strict.evaluate(() => ['global-nav', 'column'].map(id => Math.round(document.getElementById(id).getBoundingClientRect().right)));
    assert.ok(rights.every(right => right <= 1280 - 400 + 2), `the top bar and the column end before the panel: ${rights}`);
    await strict.evaluate(() => window.CVAutofillPanel.close());
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await strict.evaluate(() => document.documentElement.getAttribute('style')), null, 'and <html> is left as it was');
    console.log('PASS under a strict style policy (LinkedIn) the page still moves aside');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
