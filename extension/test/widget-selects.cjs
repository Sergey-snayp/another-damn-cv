const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Dropdowns whose <select> hides behind a jQuery widget: select2 (Avature,
// iCIMS) and jQuery UI selectmenu (BrassRing). Autofill fills the select and
// the widget redraws through jQuery, as Simplify does. Synthetic page with a
// stand-in for jQuery that redraws only on its own change.
const URL = 'https://careers.lululemon.com/en_US/careers/ApplicationForm';
const page = `<!doctype html><head><meta name="avature.portal.id" content="4"></head><form>
  <label for="country">Country</label>
  <select id="country" class="select2-hidden-accessible" aria-hidden="true" tabindex="-1"><option value=""></option><option value="US">United States</option><option value="CA">Canada</option><option value="CAF">Canada (French)</option></select>
  <span class="select2 select2-container" style="display:inline-block;width:200px;height:30px"><span class="select2-selection" role="combobox"><span class="select2-selection__rendered" id="country-shown">Select</span></span></span>
  <label for="state">State/Province</label>
  <select id="state" style="display:none"><option value="">Select</option><option value="BC">British Columbia</option><option value="ON">Ontario</option></select>
  <span id="state-button" class="ui-selectmenu-button" role="combobox" style="display:inline-block;width:200px;height:30px"><span class="ui-selectmenu-text" id="state-shown">Select</span></span>
</form><script>
  // jQuery's part: select2 and selectmenu redraw on jQuery's change / refresh, not on the browser's own event.
  window.jQueryCalls = [];
  window.jQuery = (element) => ({
    trigger(type) { jQueryCalls.push(element.id + ' ' + type); if (element.id === 'country') document.getElementById('country-shown').textContent = element.selectedOptions[0].text; },
    selectmenu(action) { if (element.id !== 'state') return undefined; if (action === 'instance') return {}; if (action === 'refresh') { jQueryCalls.push('state refresh'); document.getElementById('state-shown').textContent = element.selectedOptions[0].text; } },
  });
  window.jQuery.fn = { selectmenu: true };
</script>`;
const profile = { firstName: 'Sergey', country: 'Canada', state: 'British Columbia', city: 'Vancouver' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(URL);
    await tab.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../src/page-world.js'), 'utf8') });
    const found = await tab.evaluate(() => window.CVAutofillFields.detectFields().found.map((field) => [field.element.id, field.key]));
    assert.deepEqual(found, [['country', 'country'], ['state', 'state']], 'both hidden selects found by their widgets');
    await tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);
    const state = await tab.evaluate(() => ({ country: document.getElementById('country').value, state: document.getElementById('state').value, shown: [document.getElementById('country-shown').textContent, document.getElementById('state-shown').textContent], calls: window.jQueryCalls }));
    assert.deepEqual([state.country, state.state], ['CA', 'BC'], '"Canada" exactly, never the blank option or "Canada (French)"');
    assert.deepEqual(state.shown, ['Canada', 'British Columbia'], 'each widget shows the choice');
    assert.ok(state.calls.includes('country change') && state.calls.includes('state refresh'), JSON.stringify(state.calls));
    console.log('PASS dropdowns behind jQuery widgets (select2, selectmenu): found by their widget, filled, the widget redrawn through jQuery; never a blank option');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
