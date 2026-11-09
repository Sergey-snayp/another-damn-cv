const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Collect from my CVs → untick what you don't want → added to the Profile.
// Isolated browser and synthetic API data: no account or real document is changed.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], saves = [];
    const source = { kind: 'profile' }, importedAt = '2026-11-08T12:00:00Z';
    let state = { revision: 3, data: { experiences: { value: [
      { title: 'Senior Software Engineer', company: 'Ciklum', client: 'Verifone', location: '', from: '2024-10', to: '', current: true, description: '', techStack: 'Node.js, TypeScript', bullets: ['Built REST APIs for card tokenization.'] },
    ], source, importedAt } } };
    const epam = { title: 'Software Engineer', company: 'EPAM', client: '', location: '', from: '2021', to: '2024', current: false, description: 'Bank AML platform.', techStack: '', bullets: [] };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      void (async () => {
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/api/')) return request.continue();
        const reply = (value, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
        if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: 'sam@example.com' });
        if (pathname === '/api/profile') return reply({ firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '1', location: 'Vancouver', linkedin: 'x', workArrangements: '' });
        if (pathname === '/api/resumes' || pathname === '/api/answers' || pathname === '/api/defaults') return reply([]);
        if (pathname === '/api/profile/career/collect') {
          assert.equal(request.method(), 'POST');
          return reply({ revision: state.revision, jobs: [
            { index: 0, company: 'Ciklum', title: 'Senior Software Engineer', job: null, from: ['Backend CV', 'Fintech CV'],
              bullets: ['Cut deploy time from 40 to 8 minutes with GitHub Actions.', 'Wrote the on-call runbook.'], tools: ['Kafka', 'Redis'] },
            { index: null, company: 'EPAM', title: 'Software Engineer', job: epam, from: ['Backend CV'], bullets: ['Built the AML alert pipeline.'], tools: ['Java'] },
          ] });
        }
        if (pathname === '/api/profile/career') {
          if (request.method() === 'GET') return reply(state);
          const input = JSON.parse(request.postData());
          saves.push(input);
          assert.equal(input.expectedRevision, state.revision);
          state = { revision: state.revision + 1, data: { ...state.data, experiences: { value: input.sections.experiences, source, importedAt } } };
          return reply(state);
        }
        return reply({});
      })().catch(error => { errors.push(error.stack); void request.abort().catch(() => {}); });
    });
    const button = name => page.locator(`::-p-aria(${name})`);
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.profile-entry');

    await button('Collect from my CVs').click();
    await page.waitForSelector('.collect-job');
    const text = await page.$eval('.collect-cvs', element => element.textContent);
    assert.match(text, /From Backend CV, Fintech CV/);
    assert.match(text, /New job/);
    assert.equal(await page.$eval('.collect-cvs button[type=submit]', element => element.textContent), 'Add 3 to Profile');

    // Untick one achievement and one tool.
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('.collect-line')].find(item => item.textContent.includes('runbook'));
      label.querySelector('input').click();
      const tool = [...document.querySelectorAll('.collect-tools label')].find(item => item.textContent.includes('Redis'));
      tool.querySelector('input').click();
    });
    assert.equal(await page.$eval('.collect-cvs button[type=submit]', element => element.textContent), 'Add 2 to Profile');
    await page.click('.collect-cvs button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('.collect-cvs'));

    assert.equal(saves.length, 1);
    const [ciklum, added] = saves[0].sections.experiences;
    assert.deepEqual(ciklum.bullets, ['Built REST APIs for card tokenization.', 'Cut deploy time from 40 to 8 minutes with GitHub Actions.']);
    assert.equal(ciklum.techStack, 'Node.js, TypeScript, Kafka');
    assert.equal(added.company, 'EPAM');
    assert.deepEqual(added.bullets, ['Built the AML alert pipeline.']);
    assert.equal(added.techStack, 'Java');
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Added 2 achievements from your CVs/);
    assert.equal(await page.$$eval('.profile-entry', items => items.length), 2);
    assert.deepEqual(errors, []);
    console.log('PASS Collect from my CVs: review, untick, add to existing and new jobs');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
