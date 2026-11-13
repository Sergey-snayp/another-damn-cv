const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// From my CVs: the button says what is waiting and hides when nothing is; each
// job links to what the CVs add to it; new lines start ticked; a line like one
// you have is shown next to yours (Keep mine / Use this one / Keep both).
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
      { title: 'Senior Software Engineer', company: 'Ciklum', client: 'Verifone', location: '', from: '2024-10', to: '', current: true, description: '', techStack: 'Node.js, TypeScript',
        bullets: ['Built REST APIs for card tokenization.', 'Reduced p99 latency by 30%.'], starred: ['Built REST APIs for card tokenization.'] },
    ], source, importedAt } } };
    const epam = { title: 'Software Engineer', company: 'EPAM', client: '', location: '', from: '2021', to: '2024', current: false, description: 'Bank AML platform.', techStack: '', bullets: [] };
    // What the CVs say, as the server compares it with the Profile: only what is still missing.
    const cv = {
      fresh: ['Cut deploy time from 40 to 8 minutes with GitHub Actions.', 'Wrote the on-call runbook.'],
      similar: [
        { line: 'Built REST APIs for card tokenization and 3-D Secure payments.', mine: 'Built REST APIs for card tokenization.' },
        { line: 'Reduced p99 latency by 30% with Redis caching.', mine: 'Reduced p99 latency by 30%.' },
      ],
      tools: ['Kafka', 'Redis'],
    };
    const collect = () => {
      const roles = state.data.experiences.value;
      const ciklum = roles.find(role => role.company === 'Ciklum');
      const stack = ciklum.techStack.split(',').map(tool => tool.trim());
      const jobs = [];
      const entry = {
        index: 0, company: 'Ciklum', title: 'Senior Software Engineer', job: null, from: ['Backend CV', 'Fintech CV'],
        bullets: cv.fresh.filter(line => !ciklum.bullets.includes(line)),
        similar: cv.similar.filter(item => ciklum.bullets.includes(item.mine) && !ciklum.bullets.includes(item.line)),
        tools: cv.tools.filter(tool => !stack.includes(tool)),
      };
      if (entry.bullets.length || entry.similar.length || entry.tools.length) jobs.push(entry);
      if (!roles.some(role => role.company === 'EPAM'))
        jobs.push({ index: null, company: 'EPAM', title: 'Software Engineer', job: epam, from: ['Backend CV'], bullets: ['Built the AML alert pipeline.'], similar: [], tools: ['Java'] });
      return jobs;
    };
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
          return reply({ revision: state.revision, jobs: collect() });
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
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.profile-entry');
    const submit = () => page.$eval('.collect-cvs button[type=submit]', element => element.textContent);
    const cta = () => page.$eval('.collect-cta', element => element.textContent).catch(() => null);
    const jobLink = () => page.$eval('.collect-job-link', element => element.textContent).catch(() => null);
    const choose = (mine, label) => page.evaluate((m, l) => {
      const group = [...document.querySelectorAll('.collect-similar')].find(node => node.textContent.includes(m));
      [...group.querySelectorAll('.collect-choice label')].find(node => node.textContent === l).querySelector('input').click();
    }, mine, label);

    // 1. Before clicking: what is waiting, on the button and under the job.
    await page.waitForSelector('.collect-cta');
    assert.equal(await cta(), '1 new job · 3 new bullets · 2 similar bullets in your CVs');
    assert.equal(await jobLink(), '2 more bullets from your CVs ', 'the job says what the CVs add to it');

    // 2. One job: new lines ticked, similar ones next to yours, kept as yours unless chosen.
    await page.click('.collect-job-link');
    await page.waitForSelector('.collect-job');
    assert.equal(await page.$$eval('.collect-job', items => items.length), 1, 'only this job');
    assert.match(await page.$eval('.collect-cvs .career-editor-subtitle', node => node.textContent), /Senior Software Engineer at Ciklum/);
    assert.doesNotMatch(await page.$eval('.collect-cvs', node => node.textContent), /EPAM|New job/);
    assert.equal(await page.$$eval('.collect-similar', items => items.length), 2);
    assert.deepEqual(await page.$$eval('.collect-choice label.is-on', items => items.map(item => item.textContent)), ['Keep mine', 'Keep mine'], 'similar lines stay yours by default');
    assert.equal(await submit(), 'Add 2 to Profile', 'the two new lines, ticked');
    await choose('Built REST APIs for card tokenization.', 'Use this one');
    await choose('Reduced p99 latency by 30%.', 'Keep both');
    await page.evaluate(() => {
      [...document.querySelectorAll('.collect-line')].find(item => item.textContent.includes('runbook')).querySelector('input').click();
      [...document.querySelectorAll('.collect-tools label')].find(item => item.textContent.includes('Redis')).querySelector('input').click();
    });
    assert.equal(await submit(), 'Add 3 to Profile');
    await page.click('.collect-cvs button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('.collect-cvs'));
    const [ciklum] = saves[0].sections.experiences;
    assert.deepEqual(ciklum.bullets, [
      'Built REST APIs for card tokenization and 3-D Secure payments.',
      'Reduced p99 latency by 30%.',
      'Cut deploy time from 40 to 8 minutes with GitHub Actions.',
      'Reduced p99 latency by 30% with Redis caching.',
    ], '"Use this one" takes your line\'s place; "Keep both" adds it');
    assert.deepEqual(ciklum.starred, ['Built REST APIs for card tokenization and 3-D Secure payments.'], 'the star moves with it');
    assert.equal(ciklum.techStack, 'Node.js, TypeScript, Kafka');
    assert.equal(saves[0].sections.experiences.length, 1, 'the other job was not part of this');
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Added 3 achievements from your CVs/);

    // 3. The counts follow the Profile: what is left.
    await page.waitForFunction(() => document.querySelector('.collect-cta')?.textContent === '1 new job · 2 new bullets in your CVs');
    assert.equal(await jobLink(), '1 more bullet from your CVs ');

    // 4. Everything at once; then nothing is left, and the button and link go.
    await page.click('.collect-cta');
    await page.waitForSelector('.collect-job');
    assert.equal(await page.$$eval('.collect-job', items => items.length), 2);
    assert.equal(await submit(), 'Add 2 to Profile');
    await page.click('.collect-cvs button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('.collect-cvs'));
    const [after, added] = saves[1].sections.experiences;
    assert.ok(after.bullets.includes('Wrote the on-call runbook.'));
    assert.equal(after.techStack, 'Node.js, TypeScript, Kafka, Redis');
    assert.equal(added.company, 'EPAM');
    assert.deepEqual(added.bullets, ['Built the AML alert pipeline.']);
    assert.equal(added.techStack, 'Java');
    await page.waitForFunction(() => !document.querySelector('.collect-cta') && !document.querySelector('.collect-job-link'));
    assert.equal(await page.$$eval('.profile-entry', items => items.length), 2);
    assert.deepEqual(errors, []);
    console.log('PASS From my CVs: counts on the button and per job, one job or all, new lines ticked, similar ones compared (Keep mine / Use this one / Keep both), hidden when nothing is left');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
