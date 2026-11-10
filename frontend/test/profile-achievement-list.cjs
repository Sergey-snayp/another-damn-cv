const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A job's long achievement list on Profile: all shown, tag filters,
// edit in place, delete and restore, paste several. Synthetic API data only.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 1000 });
    const errors = [], saves = [];
    const source = { kind: 'profile' }, importedAt = '2026-11-08T12:00:00Z';
    const bullets = [
      'Integrated Mastercard and Visa token networks for card payments.',
      'Built a TLS certificate service with ACME and Route53.',
      'Mentored two junior engineers through code review.',
      'Set up Slack alerts and monitoring for production incidents.',
      'Stored token state in DynamoDB.',
      'Cut API latency by parallelizing database calls.',
      'Ran payment APIs handling ~20,000 transactions a day.',
      'Wrote Jest tests for the onboarding service.',
    ];
    let state = { revision: 1, data: { experiences: { value: [
      { title: 'Engineer', company: 'Ciklum', client: '', location: '', from: '2024-10', to: '', current: true, description: '', techStack: '', bullets, starred: ['Ran payment APIs handling ~20,000 transactions a day.'] },
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
        if (pathname === '/api/profile/career/achievements/split') {
          const input = JSON.parse(request.postData());
          assert.equal(input.source.company, 'Ciklum');
          return reply({ parts: ['Built the TLS certificate service from scratch, still in production.', 'Led a 3-person team on the TLS certificate service.'] });
        }
        if (pathname === '/api/profile/career') {
          if (request.method() === 'GET') return reply(state);
          const input = JSON.parse(request.postData());
          saves.push(input.sections.experiences[0]);
          assert.equal(input.expectedRevision, state.revision);
          state = { revision: state.revision + 1, data: { experiences: { value: input.sections.experiences, source, importedAt } } };
          return reply(state);
        }
        return reply({});
      })().catch(error => { errors.push(error.stack); void request.abort().catch(() => {}); });
    });
    const button = name => page.locator(`::-p-aria(${name})`);
    const texts = () => page.$$eval('.ach-text', rows => rows.map(row => row.textContent));
    const saved = async count => { await page.waitForFunction(n => window.__saves >= n, {}, count).catch(() => {}); };
    await page.exposeFunction('noop', () => {});
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.ach-text');
    const waitSaves = async n => { for (let i = 0; i < 50 && saves.length < n; i++) await pause(100); assert.equal(saves.length, n); await pause(150); };

    // Every bullet shows, in its own order (no stars); a long list has topic filters.
    let shown = await texts();
    assert.equal(shown.length, 8, 'a long list is not collapsed');
    assert.deepEqual(shown, bullets, 'in the order written, an old star changes nothing');
    assert.equal(await page.$('[aria-label^="Star: "], [aria-label^="Unstar: "], .ach-starred'), null, 'no favorite button');
    assert.equal(await page.$('.ach-more .profile-text-button'), null, 'no Show all / Show fewer');
    const chips = await page.$$eval('.ach-tags button', items => items.map(item => item.textContent));
    assert.equal(chips[0], 'All 8');
    assert.ok(chips.includes('Payments 2'), chips.join(' | '));
    await page.evaluate(() => [...document.querySelectorAll('.ach-tags button')].find(item => item.textContent.startsWith('Payments')).click());
    assert.deepEqual(await texts(), ['Integrated Mastercard and Visa token networks for card payments.', 'Ran payment APIs handling ~20,000 transactions a day.']);
    await page.evaluate(() => [...document.querySelectorAll('.ach-tags button')].find(item => item.textContent.startsWith('All')).click());
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await pause(300);
    await page.screenshot({ path: '/private/tmp/job-agent-achievement-list.png' });

    // Edit in place: Enter saves; Escape cancels.
    await page.evaluate(() => [...document.querySelectorAll('.ach-text')].find(item => item.textContent.startsWith('Built a TLS')).click());
    await page.waitForSelector('.ach-edit');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.ach-edit'), null);
    assert.equal(saves.length, 0, 'Escape saves nothing');
    await page.evaluate(() => [...document.querySelectorAll('.ach-text')].find(item => item.textContent.startsWith('Built a TLS')).click());
    await page.waitForSelector('.ach-edit');
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(', replacing manual renewals.');
    await page.keyboard.press('Enter');
    await waitSaves(1);
    assert.ok(saves[0].bullets.includes('Built a TLS certificate service with ACME and Route53, replacing manual renewals.'));

    // Delete: removed for good, nothing kept to restore.
    await page.hover('.ach-row:nth-child(3)');
    const third = (await texts())[2];
    await button(`Delete: ${third}`).click();
    await page.waitForSelector('.confirm-dialog');
    assert.match(await page.$eval('.confirm-dialog', element => element.textContent), /Are you sure you want to delete this bullet\?/);
    await button('Delete bullet').click();
    await waitSaves(2);
    assert.ok(!saves[1].bullets.includes(third));
    assert.deepEqual(saves[1].removed, [], 'nothing is kept to restore');
    assert.ok(!(await texts()).includes(third));
    assert.equal(await page.$('.ach-removed'), null);
    assert.doesNotMatch(await page.$eval('.ach', element => element.textContent), /deleted|Restore/);

    // Paste several lines: several achievements, cleaned, no repeats.
    await button('Add Bullet').click();
    await page.waitForSelector('[aria-label="New bullet"]');
    // A paste of several lines: plain text, one bullet per line.
    await page.focus('[aria-label="New bullet"]');
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', '- Led the migration to Node.js 20.\n• Added rate limiting to the public API.\nStored token state in DynamoDB.\n');
      document.querySelector('[aria-label="New bullet"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await button('Save 3').click();
    await waitSaves(3);
    assert.deepEqual(saves[2].bullets.slice(-2), ['Led the migration to Node.js 20.', 'Added rate limiting to the public API.']);
    assert.equal(saves[2].bullets.filter(item => item === 'Stored token state in DynamoDB.').length, 1, 'a repeat is not added twice');
    assert.equal(await page.$('[aria-label="New bullet"]'), null, 'the box closes after adding');
    assert.ok(await page.$('.ach-add-open'), '"+ Add Bullet" is back');

    // Longer than a CV line holds: its length shows, and Split puts the parts in its place.
    const long = `Built the TLS certificate service from scratch, still in production, ${'and covered every renewal path with tests '.repeat(6)}and led a 3-person team.`;
    state = { revision: state.revision + 1, data: { experiences: { value: [{ ...state.data.experiences.value[0], bullets: ['First line.', long, 'Last line.'], starred: [long] }], source, importedAt } } };
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.ach-long');
    assert.match(await page.$eval('.ach-long', element => element.textContent), /\d+ words: a CV line holds about 40/);
    const before = saves.length;
    await page.evaluate(() => [...document.querySelectorAll('.ach-long button')].find(button => button.textContent.includes('Split')).click());
    await waitSaves(before + 1);
    assert.deepEqual(saves.at(-1).bullets, ['First line.', 'Built the TLS certificate service from scratch, still in production.', 'Led a 3-person team on the TLS certificate service.', 'Last line.']);
    assert.deepEqual(saves.at(-1).starred, ['Built the TLS certificate service from scratch, still in production.'], 'the star stays on the first part');
    assert.equal(await page.$('.ach-long'), null);

    // The toolbar: Alt ↓ on the handle moves a bullet; Copy starts a new bullet from one.
    state = { revision: state.revision + 1, data: { experiences: { value: [{ ...state.data.experiences.value[0], bullets: ['A line.', 'B line.', 'C line.'], starred: [] }], source, importedAt } } };
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.ach-grip');
    const moves = saves.length;
    await page.focus('[aria-label="Move: A line."]');
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.up('Alt');
    await waitSaves(moves + 1);
    assert.deepEqual(saves.at(-1).bullets, ['B line.', 'A line.', 'C line.']);
    await page.evaluate(() => document.querySelector('[aria-label="Copy: C line."]').click());
    await page.waitForSelector('[aria-label="New bullet"]');
    assert.equal(await page.$eval('[aria-label="New bullet"]', box => box.textContent), 'C line.');
    assert.deepEqual(errors, []);
    console.log('PASS achievement list: all shown, no stars, tag filters, edit in place, delete for good, paste several, split a long one, move, copy');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
