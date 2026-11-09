const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Describe in your own words → Turn into bullets → review → saved to the job.
// Isolated browser and synthetic API data: no account or real document is changed.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], saves = [], drafts = [];
    const source = { kind: 'profile' }, importedAt = '2026-11-08T12:00:00Z';
    let state = { revision: 1, data: {
      experiences: { value: [
        { title: 'Senior Software Engineer', company: 'Ciklum', client: 'Verifone', location: '', from: '2024-10', to: '', current: true, description: '', techStack: 'Node.js, TypeScript',
          bullets: ['Developed Node.js microservices and REST APIs for card tokenization.'], notes: [{ text: 'first notes from last week', at: '2026-11-01T10:00:00Z' }] },
        { title: 'Software Engineer', company: 'EPAM', client: '', location: '', from: '2021', to: '2024', current: false, description: 'Bank AML platform.', techStack: '', bullets: ['Built REST APIs.'] },
      ], source, importedAt },
    } };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      void (async () => {
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/api/')) return request.continue();
        const reply = (value, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
        if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: 'sam@example.com' });
        if (pathname === '/api/profile') return reply({ firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '1', location: 'Vancouver', linkedin: 'x', workArrangements: '' });
        if (pathname === '/api/resumes') return reply([]);
        if (pathname === '/api/answers' || pathname === '/api/defaults') return reply([]);
        if (pathname === '/api/profile/career/achievements') {
          drafts.push(JSON.parse(request.postData()));
          await pause(400);
          return reply({
            achievements: [
              { text: 'Built an automated TLS certificate service from scratch with ACME, Route53 and Step Functions.', ask: 'How long did renewals take before?', duplicateOf: null },
              { text: 'Ran payment APIs handling ~20,000 transactions a day.', ask: null, duplicateOf: null },
              { text: 'Developed Node.js microservices and REST APIs for card tokenization.', ask: null, duplicateOf: 'Developed Node.js microservices and REST APIs for card tokenization.' },
              { text: 'Added Slack alerts for production.', ask: 'How much faster were incidents caught?', duplicateOf: null },
            ],
            techStack: ['ACME', 'Route53', 'Step Functions'],
            description: 'Payment platform for Verifone: card tokenization and secure transactions.',
            dropped: 1,
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
    const visit = async () => {
      await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
      await page.waitForSelector('.profile-describe-button');
    };
    await visit();
    assert.match(await page.$eval('.profile-entry-more', element => element.textContent), /1 note · last/);

    // Write: notes, an idea, and the text kept when the box closes.
    await button('Describe Senior Software Engineer at Ciklum in your own words').click();
    await page.waitForSelector('#describe-notes');
    assert.equal(await page.$eval('#describe-title', element => element.textContent), 'Describe your work');
    await page.type('#describe-notes', 'built the TLS cert service from scratch, ACME + route53 + step functions. ~20k transactions a day.');
    await button('What changed because of it?').click();
    await pause(100);
    assert.match(await page.$eval('#describe-notes', box => box.value), /a day\.\nWhat changed because of it\? $/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'describe-notes', 'the idea leaves the cursor in the notes');
    await page.keyboard.type('renewals became automatic');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    await button('Describe Senior Software Engineer at Ciklum in your own words').click();
    await page.waitForSelector('#describe-notes');
    assert.match(await page.$eval('#describe-notes', box => box.value), /renewals became automatic$/, 'closing keeps what you typed');

    // Turn into bullets: the earlier and new notes go to the AI with the job.
    await button('✦ Turn into bullets').click();
    await page.waitForSelector('.describe-working');
    await page.waitForSelector('.describe-review');
    assert.equal(drafts.length, 1);
    assert.match(drafts[0].notes, /^first notes from last week\n\nbuilt the TLS cert service/);
    assert.equal(drafts[0].company, 'Ciklum');
    assert.deepEqual(drafts[0].bullets, ['Developed Node.js microservices and REST APIs for card tokenization.']);
    assert.equal(await page.$eval('#describe-title', element => element.textContent), 'Review 4 achievements');
    assert.equal(await page.$$eval('.describe-item.is-dropped', rows => rows.length), 1, 'a repeat starts dropped');
    assert.match(await page.$eval('.describe-item.is-duplicate', row => row.textContent), /Already in this job/);
    assert.match(await page.$eval('.describe-item.has-ask', row => row.textContent), /How long did renewals take before\?/);
    assert.match(await page.$eval('.describe-review', element => element.textContent), /1 more left out/);
    await page.screenshot({ path: '/private/tmp/job-agent-describe-review.png' });
    // Edit one, drop one, leave a tool out.
    const first = '[aria-label="Achievement 1"]';
    await page.click(first, { clickCount: 3 });
    await page.keyboard.type('Built an automated TLS certificate service, cutting renewals from a manual task to an automatic flow.');
    await page.evaluate(() => document.querySelectorAll('.describe-item')[3].querySelector('button').click());
    await page.evaluate(() => [...document.querySelectorAll('.describe-tools label')].find(label => label.textContent.includes('ACME')).click());
    assert.equal(await page.$eval('button[type="submit"]', button => button.textContent), 'Save 2 to Profile');
    // Escape with a review not saved asks first.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.career-confirm');
    await button('Keep reviewing').click();
    await button('Save 2 to Profile').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    const saved = saves.at(-1).sections.experiences;
    assert.deepEqual(saved[0].bullets, [
      'Developed Node.js microservices and REST APIs for card tokenization.',
      'Built an automated TLS certificate service, cutting renewals from a manual task to an automatic flow.',
      'Ran payment APIs handling ~20,000 transactions a day.',
    ]);
    assert.equal(saved[0].techStack, 'Node.js, TypeScript, Route53, Step Functions');
    assert.equal(saved[0].description, 'Payment platform for Verifone: card tokenization and secure transactions.');
    assert.equal(saved[0].notes.length, 2, 'the new notes are kept with the job');
    assert.match(saved[0].notes[1].text, /renewals became automatic$/);
    assert.deepEqual(saved[1], state.data.experiences.value[1], 'the other job is untouched');
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Added 2 achievements to Ciklum/);
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Ran payment APIs handling ~20,000 transactions a day/);

    // Save notes only: kept with the job, no achievements, and the box starts empty next time.
    await button('Describe Software Engineer at EPAM in your own words').click();
    await page.waitForSelector('#describe-notes');
    assert.equal(await page.$eval('#describe-notes', box => box.value), '');
    await page.type('#describe-notes', 'migrated the AML rules engine to Kafka');
    await button('Save notes only').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    assert.deepEqual(saves.at(-1).sections.experiences[1].bullets, ['Built REST APIs.']);
    assert.equal(saves.at(-1).sections.experiences[1].notes[0].text, 'migrated the AML rules engine to Kafka');
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Notes saved/);
    await button('Describe Senior Software Engineer at Ciklum in your own words').click();
    await page.waitForSelector('#describe-notes');
    assert.equal(await page.$eval('#describe-notes', box => box.value), '', 'saved notes leave the box empty');
    assert.match(await page.$eval('.describe-earlier summary', element => element.textContent), /Earlier notes \(2\)/);
    assert.deepEqual(errors, []);
    console.log('PASS Describe in your own words: notes kept, Turn into bullets, review (edit, drop, repeats, questions, tools, description), Save, Save notes only');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
