const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Workday's "My Information" step, in the markup Simplify's Workday rules name:
// Legal Name's first and last name, the phone with its own country code,
// extension and device type, and the address. Synthetic page; no account used.
const URL = 'https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/job/x/Programmer-Analyst-I-2_JR26638/apply/applyManually';
const FROM_LINKEDIN = `${URL}?source=LinkedIn`;
const text = (id, label) => `<div data-automation-id="formField-${id}"><label for="${id}">${label}</label><input type="text" id="${id}"></div>`;
const menu = (id, label) => `<div data-automation-id="formField-${id}"><label id="${id}-label">${label}</label><button type="button" aria-haspopup="listbox" aria-labelledby="${id}-label" data-automation-id="${id}">Select One</button></div>`;
// Workday's dropdowns: the button opens an active popup of options; choosing one names it on the button.
const MENUS = `<script>
  // "How did you hear" in Workday's prompt items, in groups: "Job Board" opens its own list.
  const OPTIONS = { 'addressSection_countryRegion': ['Alberta', 'British Columbia', 'Ontario'], 'phone-device-type': ['Home', 'Landline', 'Mobile', 'Work'], 'source': ['Agency', 'Job Board', 'Social Media', 'Other'] };
  const GROUPS = { 'Job Board': ['Indeed', 'LinkedIn', 'Workopolis'], 'Social Media': ['Facebook', 'X'] };
  const show = (texts, prompt) => {
    document.querySelector('[data-automation-activepopup]')?.remove();
    document.body.insertAdjacentHTML('beforeend', '<div data-automation-activepopup="true"><ul role="listbox">' + texts.map(text => prompt
      ? '<li><div data-automation-id="promptLeafNode"><div data-automation-id="promptOption" data-automation-label="' + text + '">' + text + '</div></div></li>'
      : '<li role="option">' + text + '</li>').join('') + '</ul></div>');
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[aria-haspopup="listbox"]');
    if (button) {
      button.setAttribute('aria-expanded', 'true');
      show(OPTIONS[button.dataset.automationId], button.dataset.automationId === 'source');
      window.opened = button;
      return;
    }
    const option = event.target.closest('[role="option"], [data-automation-id="promptLeafNode"]');
    if (!option) return;
    const text = option.textContent;
    if (GROUPS[text]) return show(GROUPS[text], true);
    window.opened.textContent = text; option.closest('[data-automation-activepopup]').remove();
  });
</script>`;
const page = `<!doctype html><title>Apply</title>${MENUS}<main><h2>My Information</h2>
  <section><h3>Legal Name</h3>${text('legalName--firstName', 'First Name*')}${text('legalName--lastName', 'Last Name*')}</section>
  <div data-automation-id="formField-source"><button type="button" aria-haspopup="listbox" aria-label="How Did You Hear About Us? Select One Required" data-automation-id="source">Select One</button></div>
  <section><h3>Address</h3>${text('addressLine1', 'Address Line 1')}${text('addressSection_city', 'City')}${menu('addressSection_countryRegion', 'Province or Territory')}${text('postalCode', 'Postal Code')}</section>
  <section><h3>Phone</h3>${menu('phone-device-type', 'Phone Device Type*')}
    <div data-automation-id="formField-countryPhoneCode"><label for="cpc">Country Phone Code*</label><input id="cpc" placeholder="Search" role="combobox"></div>
    ${text('phoneNumber', 'Phone Number*')}${text('phoneExtension', 'Phone Extension')}</section></main>`;
const profile = { firstName: 'Sergey', lastName: 'Proniuk', fullName: 'Sergey Proniuk', phone: '+1 (672) 888-0334', city: 'Vancouver', state: 'Canada', country: 'Canada', postalCode: 'V5K 1A1', heardAbout: 'https://anotherdamn.cv/' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(FROM_LINKEDIN);
    const found = await tab.evaluate(profile => {
      const { found } = window.CVAutofillFields.detectFields();
      return found.map(field => [field.element.id || field.element.getAttribute('data-automation-id'), field.key, String(window.CVAutofillFiller.valueFor(field, profile) ?? '')]);
    }, profile);
    const by = Object.fromEntries(found.map(([id, key, value]) => [id, [key, value]]));
    assert.deepEqual(by['legalName--firstName'], ['firstName', 'Sergey']);
    assert.deepEqual(by['legalName--lastName'], ['lastName', 'Proniuk'], 'Last Name under "Legal Name" is the last name, not the full name');
    assert.deepEqual(by.phoneNumber, ['phone', '6728880334'], 'the number without +1: the country code is its own field');
    assert.equal(by.phoneExtension, undefined, 'the extension stays empty, as Simplify leaves it');
    assert.deepEqual(by['phone-device-type'], ['phoneType', 'Mobile'], "Phone Device Type: Mobile, Simplify's first choice");
    assert.deepEqual(by['addressSection_countryRegion'], ['state', 'British Columbia'], 'the province from the postal code (V…) when the profile says only "Canada"');
    assert.deepEqual(by.postalCode, ['postalCode', 'V5K 1A1']);

    // The text fields, filled: the last name and the phone as Workday accepts them.
    await tab.evaluate(async profile => {
      const { found } = window.CVAutofillFields.detectFields();
      await window.CVAutofillFiller.fillAll(found.filter(field => ['text', 'listbox'].includes(field.kind)), profile);
    }, profile);
    const values = await tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('input[type="text"]')].map(input => [input.id, input.value])));
    assert.deepEqual([values['legalName--lastName'], values.phoneNumber, values.phoneExtension], ['Proniuk', '6728880334', '']);
    const menus = await tab.evaluate(() => [...document.querySelectorAll('button[aria-haspopup="listbox"]')].map(button => button.textContent));
    assert.deepEqual(menus, ['LinkedIn', 'British Columbia', 'Mobile'], "Workday's dropdowns: opened, the option chosen, shown on the button");
    console.log('PASS Workday My Information: first and last name apart, phone without its country code, extension empty, its dropdowns chosen (How did you hear: Job Board → LinkedIn, where the job came from; Mobile; the province from the postal code)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
