const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts, panelFixture } = require('./panel-fixture.cjs');

// The panel reads the account when it is about to use it (opened, shown again,
// Autofill), with no timer, and the Profile's diversity answers fill the form.
// Synthetic form and server.
const FORM = 'https://jobs.lever.co/acme/9/apply';
const select = (id, label, options) => `<label for="${id}">${label}</label><select id="${id}"><option value=""></option>${options.map(option => `<option>${option}</option>`).join('')}</select>`;
const pages = {
  [FORM]: `<!doctype html><h1>Apply</h1><form onsubmit="return false">
    <label for="first">First name</label><input id="first">
    <label for="last">Last name</label><input id="last">
    <label for="email">Email</label><input id="email" type="email">
    <label for="phone">Phone</label><input id="phone">
    ${select('gender', 'Gender', ['Male', 'Female', 'Decline to self-identify'])}
    ${select('hispanic', 'Are you Hispanic or Latino?', ['Yes', 'No', 'Decline to self-identify'])}
    ${select('veteran', 'Veteran status', ['I am not a protected veteran', 'I identify as a protected veteran', 'I do not wish to answer'])}
    ${select('lgbtq', 'Do you identify as LGBTQ+?', ['Yes', 'No'])}
  </form>`,
};
const SIX_SECONDS_LATER = () => { const now = Date.now; Date.now = () => now() + 6000; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const tab = await pageWithScripts(browser, pages);
    await tab.open(FORM);
    const form = () => tab.evaluate(() => Object.fromEntries(['phone', 'gender', 'hispanic', 'veteran', 'lgbtq'].map(id => [id, document.getElementById(id).value])));
    const clearForm = () => tab.evaluate(() => { for (const element of document.querySelectorAll('input, select')) element.value = ''; });
    const pulls = server => server.requests.filter(request => request === 'profile').length;
    const server = {
      login: null, saves: [],
      account: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '111', eeoGender: '', eeoHispanic: 'No', eeoVeteran: 'Yes', eeoLgbtq: 'Yes' },
    };
    const panel = await panelFixture(browser, tab, {
      server,
      profile: { firstName: 'Sam', phone: 'old', middleName: 'Kept' },
      stored: { autofillGroups: { diversity: true }, diversityAnswers: { eeoGender: 'Woman', eeoHispanic: 'Yes' } },
    });
    const autofill = async () => {
      await panel.waitForSelector('#fill:not([disabled])', { timeout: 10000 });
      await panel.click('#fill');
      await panel.waitForFunction(() => document.getElementById('fill')?.disabled === false && /fill/i.test(document.getElementById('fill').textContent) && !/Filling/.test(document.getElementById('fill-status')?.textContent ?? ''), { timeout: 15000 });
    };

    await panel.waitForFunction(() => window.__store.profile.phone === '111', { timeout: 5000 });
    assert.equal(await panel.evaluate(() => window.__store.profile.middleName), 'Kept', 'a detail only this browser has stays');

    // Shown again at once: the read from a moment ago is reused. Later: read again.
    const showPanel = () => panel.evaluate(() => window.postMessage({ type: 'adcv-panel-visible', visible: true }, '*'));
    const first = pulls(server);
    await showPanel();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(pulls(server), first, 'no second read within a few seconds');
    server.account.phone = '222';
    await panel.evaluate(SIX_SECONDS_LATER);
    await showPanel();
    await panel.waitForFunction(() => window.__store.profile.phone === '222', { timeout: 5000 });

    // Autofill reads the account first, and the Profile's diversity answers win.
    server.account.phone = '333';
    await panel.evaluate(SIX_SECONDS_LATER);
    await autofill();
    assert.deepEqual(await form(), { phone: '333', gender: 'Female', hispanic: 'No', veteran: 'I identify as a protected veteran', lgbtq: '' },
      'newest phone; Profile answers first, an old browser answer only where the Profile has none; LGBTQ+ never filled');

    // The server fails: the saved copy still fills.
    server.down = true; server.account.phone = '444';
    await clearForm();
    await panel.evaluate(SIX_SECONDS_LATER);
    await autofill();
    assert.equal((await form()).phone, '333', 'the saved copy is used when the server fails');
    server.down = false;

    // The panel's dialog saves to the Profile and drops the browser's old copy.
    await panel.evaluate(() => document.getElementById('settings').click());
    await panel.waitForSelector('#edit-diversity', { timeout: 5000 });
    await panel.evaluate(() => document.getElementById('edit-diversity').click());
    assert.equal(await panel.$eval('select[name="eeoVeteran"]', element => element.value), 'Yes', 'the dialog shows the Profile answer');
    await panel.select('select[name="eeoGender"]', 'Non-binary');
    await panel.evaluate(() => document.getElementById('save-diversity').click());
    await panel.waitForFunction(() => /Saved to your Profile/.test(document.getElementById('diversity-status').textContent), { timeout: 5000 });
    assert.deepEqual(server.patches, [{ eeoGender: 'Non-binary', eeoHispanic: 'No', eeoRace: 'Prefer not to answer', eeoVeteran: 'Yes', eeoDisability: 'Prefer not to answer' }]);
    assert.equal(await panel.evaluate(() => 'diversityAnswers' in window.__store), false, 'nothing left only in this browser');
    await panel.close();

    // A field's icon reads and saves the Profile's answer too; older wording reads as the new one.
    await clearForm();
    await tab.evaluate(() => {
      window.__settings = { profile: { eeoVeteran: 'I am not a protected veteran' }, diversityAnswers: { eeoHispanic: 'Yes' } };
      const send = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async message => (message.type === 'default-save' ? (await send(message), { ok: true }) : send(message));
    });
    const icon = await tab.evaluate(async () => {
      const open = async id => {
        window.CVAutofillMarks.close();
        await window.CVAutofillMarks.open(document.getElementById(id));
        for (let i = 0; i < 40 && !window.CVAutofillMarks.popoverState().spec; i++) await new Promise(resolve => setTimeout(resolve, 50));
        return window.CVAutofillMarks.popoverState().spec;
      };
      const veteran = await open('veteran');
      const current = veteran.current;
      const reset = await veteran.reset();
      const hispanic = await open('hispanic');
      return { current, reset, oldAnswer: hispanic.current, saved: window.__sent.filter(message => message.type === 'default-save').map(({ target, value }) => [target.type, target.key, value]) };
    });
    assert.equal(icon.current, 'No');
    assert.equal(icon.oldAnswer, 'Yes', 'an answer only in this browser still counts');
    assert.equal(icon.reset.ok, true);
    assert.deepEqual(icon.saved, [['profile', 'eeoVeteran', 'Prefer not to answer']]);
    console.log('PASS the panel reads the account when opened, shown again and on Autofill, reuses a read for a few seconds, falls back to the saved copy, and fills and saves the Profile’s diversity answers');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error('FAIL', error); process.exit(1); });
