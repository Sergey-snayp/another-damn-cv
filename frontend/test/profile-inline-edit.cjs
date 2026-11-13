const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A job's description and technologies, and the skills, edited in place with
// the bullets' hover toolbar. Isolated browser and synthetic API data.
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
    let state = { revision: 1, data: {
      summary: { value: 'Backend engineer.', source, importedAt },
      experiences: { value: [{ title: 'Engineer', company: 'Paymorrow', client: '', location: 'Remote', from: '2021-01', to: '', current: true,
        description: 'Payments platform for German retailers.', bullets: ['Built a certificate service.'], techStack: 'Node.js, AWS' }], source, importedAt },
      educations: { value: [], source, importedAt },
      skills: { value: ['Node.js'], source, importedAt },
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
        writes.push(input.sections);
        state = { revision: state.revision + 1, data: { ...state.data } };
        for (const [key, value] of Object.entries(input.sections)) state.data[key] = { value, source: { kind: 'profile' }, importedAt };
        return reply(state);
      }
      return reply({ message: `Unexpected ${request.method()} ${pathname}` }, 500);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.inline-edit');
    const button = name => page.locator(`::-p-aria(${name})`);
    const toolbarShown = label => page.$eval(`[aria-label="Edit ${label}"]`, node => getComputedStyle(node.closest('.ach-tools')).opacity);
    const waitWrites = async count => { for (let i = 0; i < 100 && writes.length < count; i++) await new Promise(r => setTimeout(r, 50)); assert.equal(writes.length, count); };

    // Description: hover shows the bullets' toolbar; Edit, change, ⌘+Enter saves.
    assert.equal(await toolbarShown('description'), '0', 'the toolbar is hidden until pointed at');
    await page.hover('.inline-edit .profile-body');
    await new Promise(r => setTimeout(r, 250));
    assert.equal(await toolbarShown('description'), '1', 'pointing at the description shows its toolbar');
    // NN/g timing: it stays while the pointer is away for under 0.5 s, then goes.
    await page.mouse.move(5, 5);
    await new Promise(r => setTimeout(r, 300));
    assert.equal(await toolbarShown('description'), '1', 'still there 0.3 s after the pointer leaves');
    await new Promise(r => setTimeout(r, 700));
    assert.equal(await toolbarShown('description'), '0', 'gone once the pointer has been away for over 0.5 s');
    await page.hover('.inline-edit .profile-body');
    await new Promise(r => setTimeout(r, 250));
    assert.ok(await page.$('[aria-label="Delete description"]'), 'with Delete');
    await button('Edit description').click();
    await page.waitForSelector('[aria-label="Edit description"][contenteditable]');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('[aria-label="Edit description"][contenteditable]'), null, 'Escape closes the editor');
    assert.equal(writes.length, 0, 'Escape saves nothing');
    await page.click('.inline-edit .profile-body');
    await page.waitForSelector('[aria-label="Edit description"][contenteditable]');
    await page.keyboard.down('Meta'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Meta');
    await page.keyboard.press('End');
    await page.keyboard.type(' I owned its certificates.');
    await button('Save').click();
    await waitWrites(1);
    assert.equal(writes[0].experiences[0].description, 'Payments platform for German retailers. I owned its certificates.');
    assert.deepEqual(writes[0].experiences[0].bullets, ['Built a certificate service.'], 'the rest of the job is kept');
    await page.waitForFunction(() => document.body.textContent.includes('I owned its certificates.'));

    // Technologies: chips, never a text box. "+ Add technology" types new ones: Enter adds and
    // stays open; a pasted list adds them all, skipping what is there; Escape finishes.
    const chips = scope => page.$$eval(`${scope} .tag-chip span`, nodes => nodes.map(node => node.textContent));
    assert.deepEqual(await chips('.profile-entry'), ['Node.js', 'AWS']);
    assert.equal(await page.$('[aria-label="Edit technologies"]'), null, 'no text editing of the list');
    await page.click('.profile-entry .tag-add');
    await page.waitForSelector('.profile-entry .tag-add-input');
    await page.keyboard.type('PostgreSQL');
    await page.keyboard.press('Enter');
    await waitWrites(2);
    assert.equal(writes[1].experiences[0].techStack, 'Node.js, AWS, PostgreSQL');
    await page.waitForFunction(() => document.activeElement?.classList.contains('tag-add-input') && !document.activeElement.disabled);
    await page.keyboard.type('Kafka, aws, Redis');
    await page.keyboard.press('Enter');
    await waitWrites(3);
    assert.equal(writes[2].experiences[0].techStack, 'Node.js, AWS, PostgreSQL, Kafka, Redis', 'a list adds them all, once');
    assert.match(await page.$eval('.profile-entry .tag-hint', node => node.textContent), /Already there: aws/);
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.profile-entry .tag-add-input'), null, 'Escape finishes');
    // Pointing at a chip shows its ×; it removes at once, with Undo.
    const x = '[aria-label="Remove technology: AWS"]';
    assert.equal(await page.$eval(x, node => getComputedStyle(node).opacity), '0', 'hidden until pointed at');
    await page.hover('.profile-entry .tag-chip:nth-child(2)');
    await new Promise(r => setTimeout(r, 250));
    assert.equal(await page.$eval(x, node => getComputedStyle(node).opacity), '1');
    await page.click(x);
    await waitWrites(4);
    assert.equal(writes[3].experiences[0].techStack, 'Node.js, PostgreSQL, Kafka, Redis');
    await page.waitForSelector('.profile-entry .tag-undo');
    assert.match(await page.$eval('.profile-entry .tag-undo', node => node.textContent), /Removed “AWS”/);
    await page.click('.profile-entry .tag-undo button');
    await waitWrites(5);
    assert.equal(writes[4].experiences[0].techStack, 'Node.js, AWS, PostgreSQL, Kafka, Redis', 'Undo puts it back where it was');

    // Skills: the same chips; no pencil or text box.
    assert.equal(await page.$('[aria-label="Edit profile skills"]'), null);
    await page.click('[aria-labelledby="profile-skills-heading"] .tag-add');
    await page.keyboard.type('TypeScript');
    await page.keyboard.press('Enter');
    await waitWrites(6);
    assert.deepEqual(writes[5].skills, ['Node.js', 'TypeScript']);
    await page.keyboard.press('Escape');

    // Delete asks first, then saves the description empty.
    await page.hover('.inline-edit .profile-body');
    await button('Delete description').click();
    await page.waitForSelector('.confirm-dialog');
    assert.match(await page.$eval('.confirm-dialog', node => node.textContent), /delete this description/);
    await button('Delete description').click();
    await waitWrites(7);
    assert.equal(writes[6].experiences[0].description, '');
    await page.waitForFunction(() => !document.body.textContent.includes('Payments platform for German retailers.'));

    assert.deepEqual(errors, []);
    console.log('PASS description in place; technologies and skills as chips: add with Enter or a list, no repeats, hover ×, Undo; Delete asks first');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
