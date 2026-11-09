const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<form>
      <div data-testid="field"><label for="place">Location</label><input id="place" data-testid="location"></div>
      <div data-testid="field"><label for="auth">Are you authorized to work in Canada?</label><select id="auth"><option>Yes</option><option>No</option></select></div>
      <label>City<input id="city" autocomplete="section-home address-level2"></label>
      <label>State / province<input id="state" autocomplete="address-level1"></label>
      <label>Postal code<input id="postal" autocomplete="postal-code"></label>
      <label>Where are you currently located?<input id="where"></label>
      <label>Street address<input id="street" autocomplete="street-address"></label>
      <label>Will you relocate to Poland?<select id="relocate"><option>Yes</option><option>No</option></select></label>
    </form>`);
    await page.evaluate(() => { window.chrome = { storage: { local: { get: async () => ({ animateFill: false }) }, onChanged: { addListener() {} } } }; });
    for (const file of ['site-fields.js', 'sites.js', 'fields.js', 'filler.js']) await page.addScriptTag({ path: path.resolve(__dirname, '../src', file) });
    const result = await page.evaluate(async () => {
      const F = window.CVAutofillFields, S = window.CVAutofillSites;
      const mapped = Object.fromEntries([...document.querySelectorAll('input, select')].map(element => [element.id, S.siteKeyFor(element, 'ats.rippling.com')]));
      const found = F.detectFields().found;
      const fields = Object.fromEntries(found.map(field => [field.element.id, field.key]));
      const profile = { city: 'Vancouver', state: 'British Columbia', country: 'Canada', postalCode: 'V5K 0A1', addressLine: '123 Main St' };
      const location = found.find(field => field.element.id === 'where');
      await window.CVAutofillFiller.fillOne(location, profile);
      return { mapped, fields, location: document.getElementById('where').value, values: Object.fromEntries(found.filter(field => ['city', 'state', 'postal', 'street'].includes(field.element.id)).map(field => [field.element.id, window.CVAutofillFiller.valueFor(field, profile)])) };
    });
    assert.equal(result.mapped.place, 'location', 'a generic field wrapper never turns Location into sponsorship');
    assert.equal(result.mapped.auth, null, 'generic wrappers defer to the actual question');
    assert.deepEqual(result.fields, { place: 'location', auth: 'workAuthorization', city: 'city', state: 'state', postal: 'postalCode', where: 'location', street: 'addressLine', relocate: 'willingToRelocate' });
    assert.equal(result.location, 'Vancouver, British Columbia, Canada', 'Location fills from saved city, province and country if the combined value is absent');
    assert.deepEqual(result.values, { city: 'Vancouver', state: 'British Columbia', postal: 'V5K 0A1', street: '123 Main St' });
    console.log('PASS Location: Rippling wrappers, standard address autocomplete, location wording, profile fallback and relocation separation');
    await page.close();
  } finally { browser.process()?.stdout?.destroy(); browser.process()?.stderr?.destroy(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
