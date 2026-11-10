const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Achievements have a standard size: a long one in the review shows its length and splits,
// and "Rewrite with my answers" that grows past it comes back as more lines. Synthetic data only.
const LONG = `Built the TLS certificate service from scratch as its principal author, still in production, ${'with renewal retries and cleanup of orphaned records '.repeat(5)}built with TypeScript, Node.js, DynamoDB, Route53, Kafka, Redis and Docker, and led a 3-person team.`;
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], saves = [];
    const source = { kind: 'profile' }, importedAt = '2026-11-08T12:00:00Z';
    let state = { revision: 1, data: { experiences: { value: [
      { title: 'Senior Software Engineer', company: 'Ciklum', client: '', location: '', from: '2024-10', to: '', current: true, description: 'Payments.', techStack: '', bullets: [] },
    ], source, importedAt } } };
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
        if (pathname === '/api/profile/career/achievements')
          return reply({ achievements: [{ text: LONG, asks: [], duplicateOf: null }, { text: 'Set up Slack alerts for production.', asks: ['What was it like before?'], duplicateOf: null }], techStack: [], description: '', dropped: 0, uncovered: ['Redis', 'Kafka'] });
        if (pathname === '/api/profile/career/achievements/split')
          return reply({ parts: ['Built the TLS certificate service from scratch as its principal author, still in production.', 'Added renewal retries and cleanup of orphaned records to the TLS certificate service.', 'Led a 3-person team on the TLS certificate service.'] });
        if (pathname === '/api/profile/career/achievements/deepen')
          return reply({ text: 'Set up Slack alerts for production, so the team heard of outages before customers.', more: ['Moved on-call paging for production alerts into Slack.'], asks: [], changed: true });
        if (pathname === '/api/profile/career') {
          if (request.method() === 'GET') return reply(state);
          const input = JSON.parse(request.postData());
          saves.push(input);
          state = { revision: state.revision + 1, data: { ...state.data, experiences: { value: input.sections.experiences, source, importedAt } } };
          return reply(state);
        }
        return reply({});
      })().catch(error => { errors.push(error.stack); void request.abort().catch(() => {}); });
    });
    const button = name => page.locator(`::-p-aria(${name})`);
    const lines = () => page.$$eval('.describe-item textarea', boxes => boxes.map(box => box.value));
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.profile-entry');
    await button('Add a note to Senior Software Engineer at Ciklum').click();
    await page.waitForSelector('#describe-notes');
    await page.type('#describe-notes', 'tls service, alerts');
    await button('✦ Turn into bullets').click();
    await page.waitForSelector('.describe-long');
    assert.match(await page.$eval('.describe-long', element => element.textContent), /\d+ words: a CV line holds about 40/);
    // The bullet check: length, verb, metric, time, keywords; a missing metric opens its question.
    const meter = await page.$$eval('.describe-item', rows => rows.map(row => row.querySelector('.bm')?.textContent ?? ''));
    assert.match(meter[1], /6 words.*short.*Action verb.*Metric.*\+ add.*Time.*\+ add/);
    await page.evaluate(() => [...document.querySelectorAll('.describe-item')[1].querySelectorAll('.bm-check.is-ask')].find(button => button.textContent.includes('Metric')).click());
    assert.match(await page.$$eval('.describe-item', rows => rows[1].querySelector('.describe-asks').textContent), /About how many or how much\?/);
    assert.match(await page.$eval('.describe-uncovered', element => element.textContent), /Not in any achievement yet: Redis, Kafka\. Your notes don't say what they did here/);
    assert.doesNotMatch(await page.$eval('.describe-review', element => element.textContent), /technical terms in one line/, 'the Profile keeps full technical detail');

    await page.evaluate(() => document.querySelector('.describe-long button').click());
    await page.waitForFunction(() => document.querySelectorAll('.describe-item').length === 4);
    assert.deepEqual((await lines()).slice(0, 3), [
      'Built the TLS certificate service from scratch as its principal author, still in production.',
      'Added renewal retries and cleanup of orphaned records to the TLS certificate service.',
      'Led a 3-person team on the TLS certificate service.',
    ], 'the parts take the long line\'s place, in order');
    assert.equal(await page.$('.describe-long'), null);

    await page.type('.describe-asks input', 'customers told us first');
    await button('✦ Rewrite with my answers').click();
    await page.waitForFunction(() => document.querySelectorAll('.describe-item').length === 5);
    assert.deepEqual((await lines()).slice(3), [
      'Set up Slack alerts for production, so the team heard of outages before customers.',
      'Moved on-call paging for production alerts into Slack.',
    ], 'what did not fit comes right after it');

    await button('Save 5 to Profile').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    assert.equal(saves.at(-1).sections.experiences[0].bullets.length, 5);
    assert.deepEqual(errors, []);
    console.log('PASS achievement size: long lines show their length, split in place, and a fuller rewrite comes back split');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
