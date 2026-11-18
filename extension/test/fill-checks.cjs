const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Two checks on every fill. One answer, one field: a contact value goes into
// the first field of a form asking for it, a "confirm" box too, never a second
// field of the same kind. And each filled field is read back, as Jobright checks
// a value stuck: one the site cleared or calls invalid gets a yellow icon.
const URL = 'https://jobs.lever.co/acme/5678/apply';
const page = `<!doctype html>
<form id="login"><label for="login-email">Email</label><input id="login-email" type="email"></form>
<form id="apply">
  <label for="email">Email</label><input id="email" type="email">
  <label for="email2">Personal email</label><input id="email2" type="email">
  <label for="confirm">Confirm email</label><input id="confirm" type="email">
  <label for="phone">Phone</label><input id="phone" aria-describedby="phone-error"><span id="phone-error" class="error"></span>
  <label for="zip">Postal code</label><input id="zip">
</form><script>
  // The site checks: a phone with letters or a "+" is invalid; it clears the postal code it does not accept.
  document.getElementById('phone').addEventListener('input', (event) => {
    const bad = /[^0-9 ()-]/.test(event.target.value);
    event.target.setAttribute('aria-invalid', String(bad));
    document.getElementById('phone-error').textContent = bad ? 'Please enter a valid phone number' : '';
  });
  document.getElementById('zip').addEventListener('change', (event) => setTimeout(() => { event.target.value = ''; }, 50));
</script>`;
const profile = { firstName: 'Sergey', lastName: 'Proniuk', email: 'sergey@example.com', phone: '+1 672 888 0334', postalCode: 'V5K 1A1' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(URL);
    await tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);
    const values = await tab.evaluate(() => Object.fromEntries(['login-email', 'email', 'email2', 'confirm'].map((id) => [id, document.getElementById(id).value])));
    assert.deepEqual(values, { 'login-email': 'sergey@example.com', email: 'sergey@example.com', email2: '', confirm: 'sergey@example.com' }, 'each form once, a confirm box too, never a second email field');
    const marks = await tab.evaluate(() => ['phone', 'zip'].map((id) => [window.CVAutofillMarks.statusOf(document.getElementById(id)), window.CVAutofillMarks.reasonOf(document.getElementById(id))]));
    assert.equal(marks[0][0], 'check'); assert.match(marks[0][1], /Please enter a valid phone number/, 'in the site words');
    assert.equal(marks[1][0], 'check'); assert.match(marks[1][1], /cleared this/);
    console.log('PASS fill checks: one email per form (a confirm box too), and fields the site rejects or clears marked yellow with its reason');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
