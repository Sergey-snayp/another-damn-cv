const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Lululemon's Personal information page (Avature): Location and
// State/Province/City are select2 boxes that load their options as you search,
// so the hidden <select> holds none. Filled as Simplify does: open, type, press
// the match. Location lists countries, so it gets the country. Password and
// Confirm get the saved job-site login, as Jobright fills Avature's. Legal
// First and Last Name get the first and last name, as both apps fill them.
// Synthetic page with a select2 stand-in.
const URL = 'https://careers.lululemon.com/en_US/careers/ApplicationForm/65847';
const box = (id, label) => `<label class="WizardFieldLabel" for="${id}">${label}</label>
  <select id="${id}" class="select2-hidden-accessible" aria-hidden="true" tabindex="-1"><option value=""></option></select>
  <span class="select2 select2-container" style="display:inline-block;width:240px;height:30px"><span class="select2-selection" role="combobox" aria-expanded="false"><span class="select2-selection__rendered" id="${id}-shown">Select an option</span></span></span>`;
const page = `<!doctype html><head><meta name="avature.portal.id" content="4"></head><form>
  <label for="first">First name</label><input id="first">
  <label for="last">Last name</label><input id="last">
  <label for="legal-first">Legal First Name</label><input id="legal-first">
  <label for="legal-last">Legal Last Name</label><input id="legal-last">
  <label for="mail">Email</label><input id="mail" type="email">
  <label for="phone">Phone</label><input id="phone">
  <label for="addr">Address Line 1</label><input id="addr">
  <label for="town">City</label><input id="town">
  <label for="zip">Postal Code</label><input id="zip">
  ${box('location', 'Location')}
  ${box('state', 'State/Province/City')}
  <label for="pw">Password</label><input id="pw" type="password">
  <label for="pw2">Password Confirm</label><input id="pw2" type="password">
</form><script>
  // The server's lists, sent only for a search, after a moment.
  const lists = { location: ['Canada', 'United States of America', 'United Kingdom'], state: ['Alberta, Canada', 'British Columbia, Canada', 'Vancouver, British Columbia, Canada'] };
  window.searches = [];
  const close = () => { document.querySelector('.select2-container--open.select2-dropdown-holder')?.remove(); document.querySelectorAll('.select2-selection').forEach((each) => each.setAttribute('aria-expanded', 'false')); };
  document.addEventListener('mousedown', (event) => {
    const opener = event.target.closest('.select2-selection');
    if (!opener) return;
    close();
    const select = opener.closest('.select2-container').previousElementSibling;
    opener.setAttribute('aria-expanded', 'true');
    document.body.insertAdjacentHTML('beforeend', '<span class="select2-container select2-container--open select2-dropdown-holder"><input class="select2-search__field" type="search"><ul class="select2-results__options" role="listbox" aria-expanded="true" aria-hidden="false"></ul></span>');
    const search = document.querySelector('.select2-search__field');
    const results = document.querySelector('.select2-results__options');
    search.addEventListener('keydown', (key) => { if (key.key === 'Escape') close(); });
    search.addEventListener('input', () => {
      results.innerHTML = '<li class="select2-results__option" role="option" aria-disabled="true">Searching…</li>';
      const term = search.value.toLowerCase();
      searches.push(select.id + ': ' + search.value);
      setTimeout(() => {
        const found = lists[select.id].filter((name) => name.toLowerCase().includes(term));
        results.innerHTML = found.length ? found.map((name) => '<li class="select2-results__option" role="option">' + name + '</li>').join('') : '<li class="select2-results__option select2-results__message">No results found</li>';
        results.querySelectorAll('[role=option]').forEach((option) => option.addEventListener('mouseup', () => {
          select.insertAdjacentHTML('beforeend', '<option value="' + option.textContent + '">' + option.textContent + '</option>');
          select.value = option.textContent;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById(select.id + '-shown').textContent = option.textContent;
          close();
        }));
      }, 250);
    });
  });
</script>`;
const profile = { firstName: 'Sergey', lastName: 'Proniuk', email: 'sergey@example.com', country: 'Canada', state: 'British Columbia', city: 'Vancouver', location: 'Vancouver, British Columbia, Canada' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(URL);
    const scan = await tab.evaluate(() => window.__ask({ type: 'scan' }));
    assert.equal(scan.passwords, 2, 'the panel is told the form asks for a password');
    const started = Date.now();
    await tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), { ...profile, siteLogin: { email: 'sergey@example.com', password: 'Saved-Pass-123!' } });
    const took = Date.now() - started;
    const state = await tab.evaluate(() => ({ location: document.getElementById('location').value, state: document.getElementById('state').value, shown: document.getElementById('location-shown').textContent, pw: document.getElementById('pw').value, pw2: document.getElementById('pw2').value, searches: window.searches, legal: [document.getElementById('legal-first').value, document.getElementById('legal-last').value] }));
    assert.deepEqual(state.legal, ['Sergey', 'Proniuk'], 'Legal First and Last Name: the name again, not skipped as a second name field');
    assert.equal(state.location, 'Canada', `Location gets the country (${JSON.stringify(state.searches)})`);
    assert.equal(state.shown, 'Canada');
    assert.equal(state.state, 'British Columbia, Canada', 'the province: the option that starts with it, not the city one');
    assert.deepEqual([state.pw, state.pw2], ['Saved-Pass-123!', 'Saved-Pass-123!'], 'Password and Confirm, the saved job-site password');
    console.log(`PASS select2 that loads options by search: Location gets the country, State/Province/City the province, typed and pressed as Simplify does; Password and Confirm from the saved job-site login; Legal First/Last Name from the name (${took} ms)`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
