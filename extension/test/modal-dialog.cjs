const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A page that opens its application form in a modal <dialog>, as LinkedIn's
// Easy Apply does. Chrome makes everything outside such a dialog unclickable,
// so the panel, the D! button and the field icons must move inside it.
const extension = path.resolve(__dirname, '..');
const frame = '<script>parent.postMessage(\'panel-loaded\', \'*\')</script><button style="width:100%;height:100vh" onclick="parent.postMessage(\'panel-clicked\', \'*\')">Autofill</button>';
const html = `<!doctype html><title>Apply</title>
<style>body { margin: 0; height: 2000px; font: 14px system-ui } dialog { width: 520px; } dialog::backdrop { background: rgba(0,0,0,.6) }</style>
<button id="easy-apply">Easy Apply</button>
<dialog id="apply"><label for="first">First name</label><input id="first"><button id="next">Next</button></dialog>
<div id="sheet" popover="manual" style="width:70vw;height:80vh;background:#fff"><label for="last">Last name</label><input id="last"></div>
<div id="menu" popover="manual" style="width:120px;height:60px">Menu</div>`;

const chromeStub = () => {
  const clicks = [];
  window.__clicks = clicks;
  window.__loads = 0;
  addEventListener('message', event => {
    if (event.data === 'panel-clicked') clicks.push(Date.now());
    if (event.data === 'panel-loaded') window.__loads++;
  });
  window.chrome = {
    runtime: {
      id: 'test',
      getURL: () => window.__frameUrl,
      sendMessage: async () => ({}),
      onMessage: { addListener() {} },
    },
    storage: { local: { get: async () => ({ fillMarks: true }) }, onChanged: { addListener() {} } },
  };
};

async function setup(browser, withHelper) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setContent(html);
  await page.evaluate(chromeStub);
  await page.evaluate(url => { window.__frameUrl = url; }, `data:text/html,${encodeURIComponent(frame)}`);
  const files = ['src/sites.js', 'src/fields.js', 'src/filler.js', 'src/marks.js', 'src/panel-host.js'];
  for (const file of withHelper ? ['src/top-layer.js', ...files] : files) await page.addScriptTag({ path: path.join(extension, file) });
  return page;
}

const clickPanel = async page => {
  const before = await page.evaluate(() => window.__clicks.length);
  await page.mouse.click(1300, 450);
  await new Promise(resolve => setTimeout(resolve, 150));
  return (await page.evaluate(() => window.__clicks.length)) > before;
};
const hostParent = page => page.evaluate(() => document.getElementById('adcv-autofill-panel')?.parentElement?.id || document.getElementById('adcv-autofill-panel')?.parentElement?.tagName);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    // Without the helper, the bug: the open dialog blocks every click on the panel.
    const old = await setup(browser, false);
    await old.evaluate(() => window.CVAutofillPanel.open());
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await clickPanel(old), true, 'the panel is clickable before the dialog opens');
    await old.evaluate(() => document.getElementById('apply').showModal());
    assert.equal(await clickPanel(old), false, 'without the fix the modal dialog blocks the panel');
    await old.close();
    console.log('PASS without the fix, a modal dialog blocks the panel (the reported bug)');

    const page = await setup(browser, true);
    await page.evaluate(() => window.CVAutofillPanel.open());
    await new Promise(resolve => setTimeout(resolve, 300));
    const loads = () => page.evaluate(() => window.__loads);
    assert.equal(await hostParent(page), 'HTML');
    assert.equal(await loads(), 1);
    await page.evaluate(() => document.getElementById('apply').showModal());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await hostParent(page), 'apply', 'the panel moves inside the open dialog');
    assert.equal(await clickPanel(page), true, 'the panel can be clicked while the dialog is open');
    assert.equal(await loads(), 1, 'moving keeps the panel loaded: no tabs or drafts are lost');
    let next = 0;
    await page.exposeFunction('nextClicked', () => { next++; });
    await page.evaluate(() => document.getElementById('next').addEventListener('click', () => window.nextClicked()));
    await page.click('#next');
    assert.equal(next, 1, "the dialog's own buttons still work");

    // The field icons sit beside the dialog's fields, above the backdrop.
    await page.evaluate(() => window.CVAutofillMarks.show([{ element: document.getElementById('first'), status: 'ok', reason: 'From your profile' }]));
    await new Promise(resolve => setTimeout(resolve, 200));
    const marks = await page.evaluate(() => {
      const host = document.getElementById('adcv-fill-marks');
      return { parent: host?.parentElement?.id, count: window.CVAutofillMarks.count() };
    });
    assert.deepEqual(marks, { parent: 'apply', count: 1 }, 'the icons move inside the dialog too');
    await page.screenshot({ path: '/private/tmp/job-agent-modal-dialog.png' });

    // Closing the dialog puts everything back on the page, and the panel still works.
    await page.evaluate(() => document.getElementById('apply').close());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await hostParent(page), 'HTML', 'the panel goes back to the page when the dialog closes');
    assert.equal(await page.evaluate(() => document.getElementById('adcv-fill-marks')?.parentElement?.tagName), 'HTML');
    assert.equal(await clickPanel(page), true, 'the panel is clickable after the dialog closes');

    // A popover window (another way pages draw over everything) works the same; a small menu does not move anything.
    await page.evaluate(() => document.getElementById('menu').showPopover());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await hostParent(page), 'HTML', 'a small popover such as a menu is left alone');
    await page.evaluate(() => { document.getElementById('menu').hidePopover(); document.getElementById('sheet').showPopover(); });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await hostParent(page), 'sheet', 'the panel moves into a page-sized popover');
    assert.equal(await clickPanel(page), true, 'the panel can be clicked over the popover');
    await page.evaluate(() => document.getElementById('sheet').hidePopover());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await hostParent(page), 'HTML', 'and goes back when it closes');
    assert.equal(await page.evaluate(() => window.__loads), 1, 'the panel never reloaded');

    // A closed panel is not dragged into a later dialog's way: it stays hidden.
    await page.evaluate(() => window.CVAutofillPanel.close());
    await new Promise(resolve => setTimeout(resolve, 300));
    await page.evaluate(() => document.getElementById('apply').showModal());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await clickPanel(page), false, 'a closed panel catches no clicks');
    console.log('PASS the panel and field icons move into a modal dialog and back, and stay clickable');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
