const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts, panelFixture } = require('./panel-fixture.cjs');

// Workday's "Application Questions", as UBC asks them: Yes/No menus about the
// person's status in Canada, and an expiry date that appears only when the SIN
// begins with 9 (a temporary resident's). Answered by fixed rules from the
// status saved in Profile → Equal Employment; with no status, left to the
// person. Synthetic page; no account used.
const URL = 'https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/job/x/Programmer-Analyst-I-2_JR26638/apply/applyManually';
const menu = (id, label) => `<div data-automation-id="formField-${id}"><label id="${id}-label">${label}</label><button type="button" aria-haspopup="listbox" aria-labelledby="${id}-label" aria-required="true" data-automation-id="${id}" id="${id}">Select One</button></div>`;
const page = `<!doctype html><title>Apply</title><script>
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[aria-haspopup="listbox"]');
    if (button) {
      document.querySelector('[data-automation-activepopup]')?.remove();
      document.body.insertAdjacentHTML('beforeend', '<div data-automation-activepopup="true"><ul role="listbox"><li role="option">Yes</li><li role="option">No</li></ul></div>');
      window.opened = button;
      return;
    }
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    window.opened.textContent = option.textContent;
    option.closest('[data-automation-activepopup]').remove();
    // UBC: "Yes" to the SIN question asks for the permit's expiry date, in Workday's date boxes.
    if (window.opened.id === 'sin' && option.textContent === 'Yes' && !document.getElementById('expiry-month'))
      window.opened.closest('[data-automation-id="formField-sin"]').insertAdjacentHTML('afterend', '<div data-automation-id="formField-expiry"><label id="expiry-label">Please enter expiry date</label><div role="group" aria-labelledby="expiry-label"><input id="expiry-month" aria-label="Month" data-automation-id="dateSectionMonth-input"><input id="expiry-day" aria-label="Day" data-automation-id="dateSectionDay-input"><input id="expiry-year" aria-label="Year" data-automation-id="dateSectionYear-input"></div></div>');
  });
  // Workday keeps a date part when its box loses focus.
  document.addEventListener('focusout', (event) => { if (event.target.dataset?.automationId?.startsWith('dateSection')) event.target.dataset.saved = event.target.value; });
</script><main><h2>Application Questions 1 of 2</h2>
  ${menu('citizen', 'Are you a Canadian Citizen or have Permanent Resident status?*')}
  ${menu('eligible', 'Are you legally eligible to work in Canada?*')}
  ${menu('sin', 'Do you have a Social Insurance Number (SIN) that begins with the number 9?*')}
  ${menu('contract', 'Are you interested in working on a temporary / short-contract basis?*')}</main>`;

const base = { firstName: 'Sergey', lastName: 'Proniuk', country: 'Canada', eligibility: { 'workAuthorization:Canada': 'Yes', 'requiresSponsorship:Canada': 'No' } };
const status = (canada) => ({ ...base, workStatus: canada ? { canada } : {} });

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    const answers = () => tab.$$eval('button[aria-haspopup="listbox"]', (buttons) => Object.fromEntries(buttons.map((button) => [button.id, button.textContent])));
    const fill = (profile) => tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);

    // The questions are recognised, each about Canada.
    await tab.open(URL);
    const found = await tab.evaluate(() => window.CVAutofillFields.detectFields().found.map((field) => [field.element.id, field.key, field.country ?? '']));
    assert.deepEqual(found, [['citizen', 'citizenOrResident', 'Canada'], ['eligible', 'workAuthorization', 'Canada'], ['sin', 'sinStartsWith9', 'Canada']], 'citizen or PR, eligible to work, the SIN; the contract question is not a status question');

    // A permanent resident: Yes, Yes, and No to the SIN (theirs does not begin with 9). No expiry asked.
    await fill(status({ citizenship: 'No', authorized: 'Yes', sponsorship: 'No', basis: 'PERMANENT_RESIDENT' }));
    assert.deepEqual(await answers(), { citizen: 'Yes', eligible: 'Yes', sin: 'No', contract: 'Select One' });
    assert.equal(await tab.$('#expiry-month'), null);
    console.log('PASS a permanent resident in Canada: citizen or PR Yes, eligible Yes, SIN begins with 9 No; the contract question left for them');

    // A citizen: the same, from citizenship alone.
    await tab.open(URL);
    await fill(status({ citizenship: 'Yes' }));
    assert.deepEqual(await answers(), { citizen: 'Yes', eligible: 'Yes', sin: 'No', contract: 'Select One' });

    // An open work permit: No, Yes, Yes to the SIN, and the expiry date that then appears, in Workday's boxes.
    await tab.open(URL);
    await fill(status({ citizenship: 'No', authorized: 'Yes', sponsorship: 'No', basis: 'TEMPORARY_WORK_AUTHORIZATION', permit: 'OPEN_WORK_PERMIT', expiry: '2027-03-31' }));
    assert.deepEqual(await answers(), { citizen: 'No', eligible: 'Yes', sin: 'Yes', contract: 'Select One' });
    assert.deepEqual(await tab.$$eval('[data-automation-id^="dateSection"]', (inputs) => inputs.map((input) => [input.value, input.dataset.saved])), [['3', '3'], ['31', '31'], ['2027', '2027']], 'the expiry date filled after it appeared, each part kept by Workday');
    console.log('PASS a temporary permit: citizen or PR No, SIN begins with 9 Yes, then the expiry date that appears, filled from the Profile');

    // No status saved: nothing guessed; the SIN and citizen questions are left, each saying why.
    await tab.open(URL);
    const result = await fill(status(null));
    assert.deepEqual(await answers(), { citizen: 'Select One', eligible: 'Yes', sin: 'Select One', contract: 'Select One' });
    const reasons = await tab.evaluate(() => ['citizen', 'sin'].map((id) => window.CVAutofillMarks.reasonOf(document.getElementById(id)) ?? ''));
    assert.ok(reasons.every((reason) => /work status in Canada is not complete.*Equal Employment/.test(reason)), `the citizen and SIN questions say to complete the work status (${JSON.stringify(reasons)})`);
    assert.ok(result.missing.length >= 2);
    // The panel says it in one line, with a button to complete it in the app.
    const panel = await panelFixture(browser, tab, { profile: { firstName: 'Sergey', country: 'Canada' } });
    await panel.waitForSelector('#complete-work-status', { timeout: 10000 });
    assert.match(await panel.$eval('.work-status-notice', (node) => node.textContent), /Your work info for Canada is not complete/);
    await panel.close();
    console.log('PASS no status saved: the citizen and SIN questions are never guessed, say to complete the work status in Profile, and the panel says so in one line');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
