const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts, panelFixture } = require('./panel-fixture.cjs');

// After Autofill, the panel offers the form's own next button, as Simplify's
// "Continue Application" / "Submit Application": found by its words (never
// Back, Sign in, or a header button) or by the site's own rule (Avature's
// Save), and pressed only when the person presses it. Synthetic pages.
const FORM = 'https://jobs.lever.co/acme/1234/apply';
const AVATURE = 'https://careers.lululemon.com/en_US/careers/ApplicationForm/65847/more';
const pages = {
  [FORM]: `<!doctype html><header><button>Sign in</button><button>Next</button></header><main><h1>Apply</h1><form onsubmit="return false">
    <label for="first">First name</label><input id="first"><label for="email">Email</label><input id="email" type="email">
    <button type="button" onclick="window.pressed = 'back'">Back</button>
    <button type="button" onclick="window.pressed = 'continue'">Save &amp; Continue</button></form></main>`,
  [AVATURE]: `<!doctype html><head><meta name="avature.portal.id" content="4"></head><form onsubmit="window.pressed = 'save'; return false">
    <label for="first">First Name</label><input id="first"><label for="last">Last Name</label><input id="last">
    <button type="submit" name="save" class="button">Save</button><button type="button" name="cancel">Cancel</button></form>`,
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, pages);
    await tab.open(FORM);
    assert.deepEqual(await tab.evaluate(() => { const next = window.CVAutofillSites.advanceButton(); return [next.kind, next.text]; }), ['continue', 'Save & Continue'], 'the form’s own Continue, not the header’s Next or Back');
    assert.deepEqual(await tab.evaluate(() => ['Submit application', 'Next step', 'Back', 'Sign in', 'View jobs', 'Continue to payment details'].map((text) => window.CVAutofillSites.advanceKind(text))), ['submit', 'continue', null, null, null, 'continue']);

    // The panel: nothing before Autofill; after it, the button, which presses the page's.
    const panel = await panelFixture(browser, tab, { profile: { firstName: 'Sergey', email: 'sergey@example.com' } });
    await panel.waitForSelector('#fill:not([disabled])', { timeout: 10000 });
    assert.equal(await panel.$('#advance'), null, 'no Continue before Autofill');
    await panel.click('#fill');
    await panel.waitForSelector('#advance', { timeout: 15000 });
    assert.equal(await panel.$eval('#advance', (button) => button.textContent.trim()), 'Save & Continue');
    assert.equal(await tab.evaluate(() => window.pressed ?? null), null, 'never pressed by itself');
    await panel.$eval('#advance', (button) => button.click());
    await tab.waitForFunction(() => window.pressed === 'continue', { timeout: 5000 });
    await panel.close();

    // Avature: its own Save, as Simplify's Avature rule names it, a step that may send the application.
    await tab.open(AVATURE);
    assert.deepEqual(await tab.evaluate(() => { const next = window.CVAutofillSites.advanceButton(); return [next.kind, next.text]; }), ['submit', 'Save']);
    assert.deepEqual(await tab.evaluate(() => window.__ask({ type: 'advance' })), { ok: true, text: 'Save' });
    assert.equal(await tab.evaluate(() => window.pressed), 'save');
    console.log('PASS after Autofill, the form’s own Continue in the panel (never Back, Sign in or a header button), pressed only by the person; Avature’s Save by its own rule');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
