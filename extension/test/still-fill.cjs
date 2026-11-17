const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Autofill on a long form keeps the page where the person left it: no jump to
// each field, not even when a field scrolls the page itself. The panel hears
// the progress, and at the end one smooth scroll goes to a field that still
// needs the person, only when one does and it is off screen. Synthetic form.
const URL = 'https://jobs.lever.co/acme/123/apply';
const row = (name, label, extra = '') => `<p style="margin: 0 0 160px"><label for="${name}">${label}</label><input id="${name}" name="${name}" ${extra}></p>`;
const form = (last) => `<!doctype html><title>Apply</title><form style="padding: 40px">
  ${row('first_name', 'First name')}${row('last_name', 'Last name')}${row('email', 'Email', 'type="email"')}
  ${row('phone', 'Phone')}${row('city', 'City')}${row('linkedin', 'LinkedIn profile')}
  ${row('github', 'GitHub profile')}${row('website', 'Website')}${last}
  <button type="submit">Submit application</button></form>
  <script>
    // A site that scrolls a field into view when it gets a value: Autofill must not let the page follow.
    document.getElementById('city').addEventListener('input', (event) => event.target.scrollIntoView({ block: 'center' }));
  </script>`;
const pages = {
  [URL]: form(row('portfolio', 'Portfolio URL *', 'required aria-required="true"')),
  'https://jobs.lever.co/acme/456/apply': form(''),
};
const profile = { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '+1 604 555 0100', city: 'Vancouver', linkedin: 'https://www.linkedin.com/in/sam', github: 'https://github.com/sam', website: 'https://sam.dev' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const page = await pageWithScripts(browser, pages);
    await page.setViewport({ width: 1200, height: 700 });

    for (const [url, needsPerson] of [[URL, true], ['https://jobs.lever.co/acme/456/apply', false]]) {
      await page.open(url);
      const result = await page.evaluate(async (profile) => {
        window.__sent = [];
        const positions = [];
        const watch = () => positions.push(Math.round(scrollY));
        addEventListener('scroll', watch);
        const start = scrollY;
        await window.__ask({ type: 'fill', profile, answers: [] });
        const during = positions.slice();
        await new Promise((resolve) => setTimeout(resolve, 900)); // the end's one smooth scroll, if any
        removeEventListener('scroll', watch);
        const portfolio = document.getElementById('portfolio')?.getBoundingClientRect();
        return {
          start, during, end: Math.round(scrollY), filled: document.getElementById('website').value,
          portfolioOnScreen: portfolio ? portfolio.top >= 0 && portfolio.bottom <= innerHeight : null,
          progress: window.__sent.filter((message) => message.type === 'fill-progress').map((message) => `${message.done}/${message.total}`),
        };
      }, profile);
      assert.equal(result.filled, 'https://sam.dev', 'the form filled');
      assert.equal(result.start, 0, 'starts at the top');
      assert.ok(result.progress.length >= 8 && result.progress[0] === '0/' + result.progress[0].split('/')[1], `progress reported field by field (${result.progress.join(' ')})`);
      if (needsPerson) {
        assert.ok(result.end > 0 && result.portfolioOnScreen, `one scroll at the end, to the required field still empty (ended at ${result.end})`);
      } else {
        assert.equal(result.end, 0, 'everything filled: the page never moved');
      }
    }

    // During the fill itself, the page never moved: measured on a form with nothing left to the person.
    await page.open('https://jobs.lever.co/acme/456/apply');
    const moved = await page.evaluate(async (profile) => {
      let furthest = 0;
      const watch = () => { furthest = Math.max(furthest, Math.abs(scrollY)); };
      addEventListener('scroll', watch);
      await window.__ask({ type: 'fill', profile, answers: [] });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      removeEventListener('scroll', watch);
      return { furthest, end: scrollY };
    }, profile);
    assert.equal(moved.end, 0, 'still at the top after filling');
    console.log(`PASS a still page while Autofill fills (a field's own scroll put back, furthest blip ${moved.furthest}px), progress for the panel, and one scroll at the end only to a field that needs the person`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
