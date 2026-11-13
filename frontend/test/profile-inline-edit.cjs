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

    // Technologies: one line, Enter saves.
    await page.hover('.profile-stack');
    await button('Edit technologies').click();
    await page.waitForSelector('textarea[aria-label="Edit technologies"]');
    await page.keyboard.press('End');
    await page.keyboard.type(', PostgreSQL');
    await page.keyboard.press('Enter');
    await waitWrites(2);
    assert.equal(writes[1].experiences[0].techStack, 'Node.js, AWS, PostgreSQL');

    // Skills: the list as comma-separated text; repeats and blanks dropped.
    await page.hover('.profile-chips');
    await button('Edit skills').click();
    await page.waitForSelector('textarea[aria-label="Edit skills"]');
    await page.keyboard.press('End');
    await page.keyboard.type(', TypeScript, node.js , , Node.js');
    await button('Save').click();
    await waitWrites(3);
    assert.deepEqual(writes[2].skills, ['Node.js', 'TypeScript', 'node.js']);
    await page.waitForFunction(() => [...document.querySelectorAll('.profile-chips li')].map(li => li.textContent).join('|') === 'Node.js|TypeScript|node.js');

    // Delete asks first, then saves the description empty.
    await page.hover('.inline-edit .profile-body');
    await button('Delete description').click();
    await page.waitForSelector('.confirm-dialog');
    assert.match(await page.$eval('.confirm-dialog', node => node.textContent), /delete this description/);
    await button('Delete description').click();
    await waitWrites(4);
    assert.equal(writes[3].experiences[0].description, '');
    await page.waitForFunction(() => !document.body.textContent.includes('Payments platform for German retailers.'));

    assert.deepEqual(errors, []);
    console.log('PASS description, technologies and skills: hover toolbar, edit in place, Escape, Enter / Save, and Delete');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
