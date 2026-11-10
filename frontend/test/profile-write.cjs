const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Bullets only: "+ Add Bullet" → rough words → "✦ Write it for me" → review → added to the job.
// No notes are shown or saved. Isolated browser and synthetic API data only.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], saves = [], drafts = [], deepens = [];
    const source = { kind: 'profile' }, importedAt = '2026-11-08T12:00:00Z';
    const oldNotes = [{ text: 'old notes from last week', at: '2026-11-01T10:00:00Z' }];
    let state = { revision: 1, data: { experiences: { value: [
      { title: 'Senior Software Engineer', company: 'Ciklum', client: 'Verifone', location: '', from: '2024-10', to: '', current: true, description: '', techStack: 'Node.js, TypeScript',
        bullets: ['Developed Node.js microservices and REST APIs for card tokenization.'], notes: oldNotes },
      { title: 'Software Engineer', company: 'EPAM', client: '', location: '', from: '2021', to: '2024', current: false, description: 'Bank AML platform.', techStack: '', bullets: ['Built REST APIs.'] },
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
        if (pathname === '/api/profile/career/achievements/deepen') {
          const input = JSON.parse(request.postData());
          deepens.push(input);
          return reply({ text: `${input.text.replace(/\.$/, '')}, replacing a manual half-day task; still in production.`, more: [], asks: [], changed: true });
        }
        if (pathname === '/api/profile/career/achievements') {
          drafts.push(JSON.parse(request.postData()));
          await pause(300);
          return reply({
            achievements: [
              { text: 'Built an automated TLS certificate service from scratch with ACME, Route53 and Step Functions.', asks: ['How long did renewals take before?'], duplicateOf: null },
              { text: 'Ran payment APIs handling ~20,000 transactions a day.', asks: [], duplicateOf: null },
              { text: 'Developed Node.js microservices and REST APIs for card tokenization.', asks: [], duplicateOf: 'Developed Node.js microservices and REST APIs for card tokenization.' },
            ],
            techStack: ['ACME', 'Route53', 'Step Functions'],
            description: 'Payment platform for Verifone: card tokenization and secure transactions.',
            dropped: 0,
            uncovered: [],
          });
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
    const first = '.profile-entry:first-of-type';
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.profile-entry');
    const card = await page.$eval(first, element => element.textContent);
    assert.doesNotMatch(card, /Add a note|1 note|old notes/, 'no notes on the job');

    // The panel beside the Profile checks the bullet being written, as it is written.
    assert.match(await page.$eval('.bullet-panel', element => element.textContent), /Bullet check.*Edit a bullet, or press \+ Add Bullet/s);
    assert.match(await page.$eval('.bullet-panel', element => element.textContent), /Work experience › Bullets.*action verb \+ what you built/s);
    await page.evaluate(() => [...document.querySelectorAll('.bp-tabs button')].find(tab => tab.textContent === 'Prompts').click());
    assert.match(await page.$eval('.bullet-panel [role="tabpanel"]', element => element.textContent), /Every “yes” is a bullet.*Did you build a system, service or feature from scratch\?.*Did you lead, mentor or train anyone\?/s);
    await page.evaluate(() => [...document.querySelectorAll('.bp-tabs button')].find(tab => tab.textContent === 'Suggestions').click());
    await page.click(`${first} .ach-add-open`);
    await page.waitForSelector('[aria-label="New bullet"]');
    assert.equal(await page.$eval(`${first} .ach-write`, element => element.disabled), true);
    await page.type('[aria-label="New bullet"]', 'Built REST APIs.');
    await page.waitForFunction(() => document.querySelectorAll('.bullet-panel .bp-gauge b')[1]?.textContent === '3');
    assert.match(await page.$eval('.bullet-panel', element => element.textContent), /Fair.*Senior Software Engineer · Ciklum.*Words: 3/s);
    assert.match(await page.$eval('.bullet-panel .bp-fixes', element => element.textContent), /Length:.*Metrics:.*Time statement:/s);
    assert.match(await page.$eval(`${first} .ach-count`, element => element.textContent), /C: 16 W: 3/);
    await page.click('[aria-label="New bullet"]', { clickCount: 3 });
    await page.type('[aria-label="New bullet"]', 'built the TLS cert service from scratch, ACME + route53 + step functions. ~20k transactions a day.');
    await page.click(`${first} .ach-write`);

    // Straight to review, written from the words typed and the job.
    await page.waitForSelector('.describe-review');
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].notes, 'built the TLS cert service from scratch, ACME + route53 + step functions. ~20k transactions a day.', 'only what was typed, no old notes');
    assert.deepEqual(drafts[0].bullets, ['Developed Node.js microservices and REST APIs for card tokenization.']);
    assert.equal(await page.$eval('#describe-title', element => element.textContent), 'Review 3 bullets');
    assert.equal(await page.$$eval('.describe-item.is-dropped', rows => rows.length), 1, 'a repeat starts dropped');
    assert.equal(await page.$('[aria-label="New bullet"]'), null, 'the bullet box closed');

    // Answer a question: the line is rewritten with it.
    await page.type('.describe-asks input', 'a manual half-day task');
    await button('✦ Rewrite with my answers').click();
    await page.waitForFunction(() => /still in production/.test(document.querySelector('[aria-label="Achievement 1"]').value));
    assert.deepEqual(deepens[0].answers[0], { question: 'How long did renewals take before?', answer: 'a manual half-day task' });
    await page.evaluate(() => [...document.querySelectorAll('.describe-tools label')].find(label => label.textContent.includes('ACME')).click());
    // Back keeps what was written.
    await button('← Back to what I wrote').click();
    assert.match(await page.$eval('#describe-notes', box => box.value), /^built the TLS cert service/);
    await button('✦ Write bullets').click();
    await page.waitForSelector('.describe-review');
    assert.equal(drafts.length, 2);
    await page.evaluate(() => [...document.querySelectorAll('.describe-tools label')].find(label => label.textContent.includes('ACME')).click());
    await button('Add 2 to Profile').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));

    const saved = saves.at(-1).sections.experiences;
    assert.deepEqual(saved[0].bullets, [
      'Developed Node.js microservices and REST APIs for card tokenization.',
      'Built an automated TLS certificate service from scratch with ACME, Route53 and Step Functions.',
      'Ran payment APIs handling ~20,000 transactions a day.',
    ]);
    assert.equal(saved[0].techStack, 'Node.js, TypeScript, Route53, Step Functions');
    assert.equal(saved[0].description, 'Payment platform for Verifone: card tokenization and secure transactions.');
    assert.deepEqual(saved[0].notes, oldNotes, 'nothing is added to notes; old ones are left as stored');
    assert.deepEqual(saved[1], state.data.experiences.value[1], 'the other job is untouched');
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Added 2 bullets to Ciklum/);
    assert.match(await page.$eval('.bullet-panel', element => element.textContent), /Bullet check/, 'nothing being written: the panel is back to its guide');
    assert.deepEqual(errors, []);
    console.log('PASS Write bullets: bullet check panel, rough words to reviewed bullets, answers, Back, tools, description, no notes kept');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
