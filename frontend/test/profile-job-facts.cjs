const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A job's facts under its title as pills: client, remote / hybrid / on-site,
// location and dates, each edited on its own; an empty one offers to add it.
// Isolated browser and synthetic API data.
(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1200, height: 900 });
    const errors = [], writes = [];
    const source = { kind: 'file', name: 'career.txt' }, importedAt = '2026-11-12T12:00:00Z';
    // Saved the old way: "Remote" in the location, no work type.
    let state = { revision: 1, data: {
      experiences: { value: [{ title: 'Senior Software Engineer', company: 'Ciklum', client: 'Paymorrow/Verifone', location: 'Remote', from: '2024-10', to: '', current: true,
        description: '', bullets: ['Built a certificate service.'], techStack: 'Node.js' }], source, importedAt },
      educations: { value: [], source, importedAt },
      skills: { value: [], source, importedAt },
    } };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return void request.continue();
      const reply = (value, status = 200) => void request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: 'sam@example.com' });
      if (pathname === '/api/profile') return reply({ firstName: 'Sam', lastName: 'Lee', fullName: 'Sam Lee', email: 'sam@example.com' });
      if (pathname === '/api/resumes' || pathname === '/api/answers' || pathname === '/api/defaults') return reply([]);
      if (pathname === '/api/profile/career') {
        if (request.method() === 'GET') return reply(state);
        const input = JSON.parse(request.postData());
        writes.push(input.sections.experiences[0]);
        state = { revision: state.revision + 1, data: { ...state.data } };
        for (const [key, value] of Object.entries(input.sections)) state.data[key] = { value, source: { kind: 'profile' }, importedAt };
        return reply(state);
      }
      return reply({ message: `Unexpected ${request.method()} ${pathname}` }, 500);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.job-fact');
    const pills = () => page.$$eval('.job-fact', nodes => nodes.map(node => node.textContent));
    const pill = async text => {
      // After a save the pills are disabled until the job comes back.
      await page.waitForFunction(label => [...document.querySelectorAll('.job-fact')].some(node => node.textContent === label && !node.disabled), {}, text);
      await page.evaluate(label => [...document.querySelectorAll('.job-fact')].find(node => node.textContent === label).click(), text);
      await page.waitForSelector('.job-fact-card');
    };
    const card = name => page.locator(`.job-fact-card ::-p-text(${name})`);
    const saves = async count => { for (let i = 0; i < 100 && writes.length < count; i++) await new Promise(r => setTimeout(r, 50)); assert.equal(writes.length, count); };

    // Only filled facts are pills; the round + at the end lists the missing ones.
    const missing = async () => {
      await page.waitForFunction(() => !document.querySelector('.job-fact-add')?.disabled);
      await page.click('.job-fact-add');
      await page.waitForSelector('.job-fact-menu');
      const items = await page.$$eval('.job-fact-menu [role="menuitem"]', nodes => nodes.map(node => node.textContent));
      return items;
    };
    const add = async label => {
      if (!(await page.$('.job-fact-menu'))) await missing();
      await page.locator(`.job-fact-menu ::-p-text(${label})`).click();
      await page.waitForSelector('.job-fact-card');
    };
    assert.deepEqual(await pills(), ['for Paymorrow/Verifone', 'Remote', 'Oct 2024 – Present'], 'an older save\'s "Remote" shows as the work type');
    assert.deepEqual(await missing(), ['Location'], 'the + offers what is missing');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.job-fact-menu'), null, 'Escape closes the + menu');

    // Location: a country only, alongside Remote.
    await add('Location');
    await page.waitForSelector('.job-fact-card input[name="country"]');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.job-fact-card'), null, 'Escape closes it');
    assert.equal(writes.length, 0, 'and saves nothing');
    await add('Location');
    await page.type('.job-fact-card input[name="country"]', 'Canada');
    await page.keyboard.press('Enter');
    await saves(1);
    assert.equal(writes[0].location, 'Canada');
    assert.equal(writes[0].workType, 'remote', 'the old "Remote" moves to its own field');
    await page.waitForFunction(() => [...document.querySelectorAll('.job-fact')].some(node => node.textContent === 'Canada'));
    assert.deepEqual(await pills(), ['for Paymorrow/Verifone', 'Remote', 'Canada', 'Oct 2024 – Present']);
    assert.equal(await page.$('.job-fact-add'), null, 'all filled: no +');

    // Work type: one click on another choice saves it.
    await pill('Remote');
    await card('Hybrid').click();
    await saves(2);
    assert.equal(writes[1].workType, 'hybrid');
    assert.equal(writes[1].location, 'Canada');

    // Client: Remove empties it, and the pill offers to add it again.
    await pill('for Paymorrow/Verifone');
    await card('Remove').click();
    await saves(3);
    assert.equal(writes[2].client, '');
    assert.deepEqual(await missing(), ['Client'], 'a removed fact moves to the + menu');
    await page.keyboard.press('Escape');

    // Work type removed: the location stays.
    await pill('Hybrid');
    await card('Remove').click();
    await saves(4);
    assert.equal(writes[3].workType, undefined);
    assert.equal(writes[3].location, 'Canada');
    assert.deepEqual(await missing(), ['Client', 'Remote / on-site']);
    await page.keyboard.press('Escape');

    // Dates: no longer current, with an end date.
    await pill('Oct 2024 – Present');
    await page.click('.job-fact-card .career-current input');
    await page.select('.job-fact-card [aria-label="End date month"]', '01');
    await page.select('.job-fact-card [aria-label="End date year"]', '2026');
    await card('Save').click();
    await saves(5);
    assert.deepEqual([writes[4].from, writes[4].to, writes[4].current], ['2024-10', '2026-01', false]);
    await page.waitForFunction(() => [...document.querySelectorAll('.job-fact')].some(node => node.textContent === 'Oct 2024 – Jan 2026'));
    assert.deepEqual(writes[4].bullets, ['Built a certificate service.'], 'the rest of the job is kept');

    // Pointing at a filled pill shows its ×; it asks first, and Cancel keeps the value.
    const x = '[aria-label="Remove location: Canada"]';
    assert.equal(await page.$eval(x, node => getComputedStyle(node).opacity), '0', 'hidden until pointed at');
    await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, x);
    await page.hover('.profile-pills li.has-remove:has([aria-label="Remove location: Canada"])');
    await new Promise(r => setTimeout(r, 250));
    assert.equal(await page.$eval(x, node => getComputedStyle(node).opacity), '1', 'pointing at the pill shows its ×');
    assert.equal(await page.$('[aria-label^="Remove client"]'), null, 'an empty pill has no ×');
    await page.click(x);
    await page.waitForSelector('.confirm-dialog');
    assert.match(await page.$eval('.confirm-dialog', node => node.textContent), /Are you sure you want to remove the location\?.*Canada/s);
    await page.click('.confirm-dialog .confirm-cancel');
    await page.waitForFunction(() => !document.querySelector('.confirm-dialog'));
    assert.equal(writes.length, 5, 'Cancel removes nothing');
    await page.hover('.profile-pills li.has-remove:has([aria-label="Remove location: Canada"])');
    await page.click(x);
    await page.waitForSelector('.confirm-dialog');
    await page.locator('.confirm-dialog ::-p-text(Remove)').click();
    await saves(6);
    assert.equal(writes[5].location, '');
    assert.deepEqual(await missing(), ['Client', 'Remote / on-site', 'Location']);

    assert.deepEqual(errors, []);
    console.log('PASS job facts: pills for client, remote / on-site, location and dates; missing ones under a round + at the end; edit, Remove, Escape, × with a question; older "Remote" kept');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
