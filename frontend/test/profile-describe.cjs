const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Add a note → Turn into bullets → review → saved to the job.
// Isolated browser and synthetic API data: no account or real document is changed.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], saves = [], drafts = [], deepens = [];
    let failSave = false;
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
        if (pathname === '/api/profile/career/achievements/deepen') {
          const input = JSON.parse(request.postData());
          deepens.push(input);
          await pause(200);
          return reply({ text: `${input.text.replace(/\.$/, '')} — renewals had been ${input.answers[0].answer}, and the service is still in production.`, asks: [], changed: true });
        }
        if (pathname === '/api/profile/career/achievements') {
          drafts.push(JSON.parse(request.postData()));
          await pause(400);
          return reply({
            achievements: [
              { text: 'Built an automated TLS certificate service from scratch with ACME, Route53 and Step Functions.', asks: ['How long did renewals take before?', 'Is it still in use?'], duplicateOf: null },
              { text: 'Ran payment APIs handling ~20,000 transactions a day.', asks: [], duplicateOf: null },
              { text: 'Developed Node.js microservices and REST APIs for card tokenization.', asks: [], duplicateOf: 'Developed Node.js microservices and REST APIs for card tokenization.' },
              { text: 'Added Slack alerts for production.', asks: ['How much faster were incidents caught?'], duplicateOf: null },
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
          if (failSave) { failSave = false; return reply({message: 'Could not save notes. Try again.'}, 503); }
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
    await button('Add a note to Senior Software Engineer at Ciklum').click();
    await page.waitForSelector('#describe-notes');
    assert.equal(await page.$eval('#describe-title', element => element.textContent), 'Add a note');
    await page.type('#describe-notes', 'built the TLS cert service from scratch, ACME + route53 + step functions. ~20k transactions a day.');
    await button('What changed because of it?').click();
    await pause(100);
    assert.match(await page.$eval('#describe-notes', box => box.value), /a day\.\nWhat changed because of it\? $/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'describe-notes', 'the idea leaves the cursor in the notes');
    await page.keyboard.type('renewals became automatic');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    await button('Add a note to Senior Software Engineer at Ciklum').click();
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
    assert.match(await page.$eval('.describe-item.has-ask', row => row.textContent), /How long did renewals take before\?.*Is it still in use\?/s);
    assert.match(await page.$eval('.describe-item.has-ask', row => row.textContent), /A recruiter may not know ACME/, 'an unknown acronym is pointed out');
    assert.match(await page.$eval('.describe-review', element => element.textContent), /1 more left out/);
    await page.screenshot({ path: '/private/tmp/job-agent-describe-review.png' });
    // Answer its questions: the line is rewritten with them, and the answers are kept with the notes.
    await page.type('.describe-asks input', 'a manual half-day task');
    await button('✦ Rewrite with my answers').click();
    await page.waitForFunction(() => /still in production/.test(document.querySelector('[aria-label="Achievement 1"]').value));
    assert.equal(deepens[0].answers.length, 1, 'only answered questions are sent');
    assert.deepEqual(deepens[0].answers[0], { question: 'How long did renewals take before?', answer: 'a manual half-day task' });
    assert.equal(await page.$$eval('.describe-item:first-child .describe-asks', rows => rows.length), 0, 'no questions left');
    // Edit one, drop one, leave a tool out.
    const first = '[aria-label="Achievement 1"]';
    await page.click(first, { clickCount: 3 });
    await page.keyboard.type('Built an automated TLS certificate service, cutting renewals from a manual task to an automatic flow.');
    await page.evaluate(() => document.querySelectorAll('.describe-item')[3].querySelector('.describe-actions button').click());
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
    assert.match(saved[0].notes[1].text, /renewals became automatic\nHow long did renewals take before\? a manual half-day task$/, 'answers are kept with the notes');
    assert.deepEqual(saved[1], state.data.experiences.value[1], 'the other job is untouched');
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Added 2 achievements to Ciklum/);
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Ran payment APIs handling ~20,000 transactions a day/);

    // Save notes only: kept with the job, no achievements, and the box starts empty next time.
    await button('Add a note to Software Engineer at EPAM').click();
    await page.waitForSelector('#describe-notes');
    assert.equal(await page.$eval('#describe-notes', box => box.value), '');
    await page.type('#describe-notes', 'migrated the AML rules engine to Kafka');
    await button('Save notes only').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    assert.deepEqual(saves.at(-1).sections.experiences[1].bullets, ['Built REST APIs.']);
    assert.equal(saves.at(-1).sections.experiences[1].notes[0].text, 'migrated the AML rules engine to Kafka');
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Notes saved/);
    await button('Add a note to Senior Software Engineer at Ciklum').click();
    await page.waitForSelector('#describe-notes');
    assert.equal(await page.$eval('#describe-notes', box => box.value), '', 'saved notes leave the box empty');
    assert.match(await page.$eval('.describe-earlier summary', element => element.textContent), /Earlier notes \(2\)/);

    // Removing a saved note is visible, can be undone, and stays pending until Save.
    await page.click('.describe-earlier summary');
    const beforeRemoval = structuredClone(state.data.experiences.value);
    const savesBefore = saves.length;
    await button('Remove saved note 1').hover();
    await pause(160);
    assert.notEqual(await page.$eval('.describe-saved-note', note => getComputedStyle(note).borderLeftColor), await page.$eval('.describe-earlier', list => getComputedStyle(list).borderTopColor), 'hover marks the exact note to remove');
    await button('Remove saved note 1').click();
    assert.equal(saves.length, savesBefore, 'removal waits for Save');
    assert.equal(await page.$$eval('.describe-saved-note.is-removed', notes => notes.length), 1);
    await page.screenshot({path: '/private/tmp/job-agent-profile-note-removal.png'});
    assert.match(await page.$eval('.describe-removal-status', text => text.textContent), /1 note will be removed when you save/);
    await button('Undo removal of saved note 1').click();
    assert.equal(await page.$$eval('.describe-saved-note.is-removed', notes => notes.length), 0);
    await button('Remove saved note 1').click();

    // A removed note is excluded from generation even before saving the deletion.
    await button('✦ Turn into bullets').click();
    await page.waitForSelector('.describe-review');
    assert.doesNotMatch(drafts.at(-1).notes, /first notes from last week/);
    assert.match(drafts.at(-1).notes, /renewals became automatic/);
    await button('← Back to notes').click();
    failSave = true;
    await button('Save changes').click();
    await page.waitForSelector('.profile-import-status[role="alert"]');
    assert.match(await page.$eval('.profile-import-status', box => box.textContent), /Could not save notes/);
    assert.deepEqual(state.data.experiences.value, beforeRemoval, 'a failed save keeps the stored notes');
    assert.ok(await page.$('.describe-saved-note.is-removed'), 'the removal remains ready to retry');
    await button('Save changes').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    assert.deepEqual(state.data.experiences.value[0].notes, [beforeRemoval[0].notes[1]]);
    assert.deepEqual(state.data.experiences.value[0].bullets, beforeRemoval[0].bullets);
    assert.deepEqual(state.data.experiences.value[1], beforeRemoval[1]);
    await visit();
    await button('Add a note to Senior Software Engineer at Ciklum').click();
    await page.waitForSelector('.describe-earlier');
    await page.click('.describe-earlier summary');
    assert.equal(await page.$$eval('.describe-saved-note', notes => notes.length), 1);
    assert.doesNotMatch(await page.$eval('.describe-earlier', list => list.textContent), /first notes from last week/);
    await button('Remove saved note 1').click();
    await button('Save changes').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    assert.deepEqual(state.data.experiences.value[0].notes, [], 'the final note can be cleared');
    await visit();
    await button('Add a note to Senior Software Engineer at Ciklum').click();
    await page.waitForSelector('#describe-notes');
    assert.equal(await page.$('.describe-earlier'), null, 'deleted notes stay gone after reloading');
    await button('Close').click();

    // Remove all, then cancel: unsaved removals leave the stored notes intact.
    state.data.experiences.value[0].notes = structuredClone(beforeRemoval[0].notes);
    await visit();
    await button('Add a note to Senior Software Engineer at Ciklum').click();
    await page.waitForSelector('.describe-earlier');
    await page.click('.describe-earlier summary');
    await button('Remove all notes').click();
    assert.equal(await page.$$eval('.describe-saved-note.is-removed', notes => notes.length), 2);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.career-confirm');
    await page.evaluate(() => [...document.querySelectorAll('.career-confirm button')].find(button => button.textContent === 'Close').click());
    assert.equal(state.data.experiences.value[0].notes.length, 2);
    await button('Add a note to Senior Software Engineer at Ciklum').click();
    await page.waitForSelector('.describe-earlier');
    await page.click('.describe-earlier summary');
    await button('Remove all notes').click();
    const concurrentNote = {text: 'A new note saved in another window.', at: '2026-11-09T12:00:00Z'};
    state.data.experiences.value[0].notes.push(concurrentNote);
    state.revision++;
    await button('Save changes').click();
    await page.waitForFunction(() => !document.querySelector('.describe-job'));
    assert.deepEqual(state.data.experiences.value[0].notes, [concurrentNote], 'only reviewed notes are removed; concurrent additions survive');
    assert.deepEqual(errors, []);
    console.log('PASS Profile notes: draft, review, save, individual removal, Undo, Remove all, save retry, cancel and reload');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
