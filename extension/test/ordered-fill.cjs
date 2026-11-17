const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Animated Autofill (the default): the page glides from field to field strictly
// top to bottom, never back up. A field that scrolls the page by itself is put
// back; a field that cannot be filled is passed and the next one filled.
// Synthetic form.
const URL = 'https://jobs.lever.co/acme/789/apply';
const row = (name, label, extra = '') => `<p style="margin: 0 0 220px"><label for="${name}">${label}</label><input id="${name}" name="${name}" ${extra}></p>`;
const page = `<!doctype html><title>Apply</title><form style="padding: 40px">
  ${row('first_name', 'First name')}${row('last_name', 'Last name')}${row('email', 'Email', 'type="email"')}
  ${row('phone', 'Phone')}${row('city', 'City')}
  <p style="margin: 0 0 220px"><label for="country">Country</label><select id="country" name="country"><option value="">Select</option><option>Atlantis</option></select></p>
  ${row('linkedin', 'LinkedIn profile')}${row('github', 'GitHub profile')}${row('website', 'Website')}
  <button type="submit">Submit application</button></form>
  <script>
    // A site that jumps to a field when it gets a value: Autofill must not follow it back up.
    document.getElementById('linkedin').addEventListener('input', () => setTimeout(() => scrollTo(0, 0), 0));
  </script>`;
const profile = { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '+1 604 555 0100', city: 'Vancouver', country: 'Canada', linkedin: 'https://www.linkedin.com/in/sam', github: 'https://github.com/sam', website: 'https://sam.dev' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.setViewport({ width: 1200, height: 700 });
    await tab.open(URL, () => { window.__settings = { animateFill: true }; });
    const run = await tab.evaluate(async (profile) => {
      const order = [], tops = [];
      document.addEventListener('input', (event) => { if (event.target.id && order.at(-1) !== event.target.id) order.push(event.target.id); }, true);
      // Where the page is on every frame drawn: what a person sees, including a jump put back late.
      let watching = true;
      const watch = () => { if (tops.at(-1) !== Math.round(scrollY)) tops.push(Math.round(scrollY)); if (watching) requestAnimationFrame(watch); };
      requestAnimationFrame(watch);
      await window.__ask({ type: 'fill', profile, answers: [] });
      watching = false;
      const fields = [...document.querySelectorAll('input, select')].map((element) => element.id);
      return { order, tops, fields, website: document.getElementById('website').value, country: document.getElementById('country').value };
    }, profile);
    assert.equal(run.website, 'https://sam.dev', 'the last field filled');
    assert.equal(run.country, '', 'the country it cannot choose is left, and filling went on past it');
    const positions = run.order.map((id) => run.fields.indexOf(id));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `fields filled top to bottom: ${run.order.join(' → ')}`);
    const backUp = run.tops.findIndex((top, index) => index && top < run.tops[index - 1] - 2);
    assert.equal(backUp, -1, `the page only moved down while filling (${run.tops.join(', ')})`);
    assert.ok(run.tops.length && Math.max(...run.tops) > 1000, 'it glided down the form');
    console.log(`PASS animated fill: top to bottom (${run.order.length} fields), the page only going down, a site's own jump put back, a field it cannot fill passed`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
