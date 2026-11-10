const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Write with AI / Improve with AI on Profile bullets: Automatic, Keywords, Coach Me, Custom Prompt,
// 3 versions, keywords underlined, placeholders to fill before Save. Synthetic API data only.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1500, height: 1000 });
    const errors = [], saves = [], asks = [];
    let suggestionCalls = 0;
    const source = { kind: 'profile' }, importedAt = '2026-11-08T12:00:00Z';
    let state = { revision: 1, data: { experiences: { value: [
      { title: 'Senior Software Engineer', company: 'Ciklum', client: 'Verifone', location: '', from: '2024-10', to: '', current: true, description: 'Card payments platform.', techStack: 'Node.js, AWS Lambda', bullets: ['Built REST APIs for card tokenization.'] },
    ], source, importedAt } } };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      void (async () => {
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/api/')) return request.continue();
        const reply = (value, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
        if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: 'sam@example.com' });
        if (pathname === '/api/profile') return reply({ firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '1', location: 'Vancouver', linkedin: 'x' });
        if (pathname === '/api/profile/career/achievements/suggestions') {
          suggestionCalls++;
          return reply({ keywords: ['Payment Processing', 'AWS Lambda', 'Production Support', 'Tokenization'], tasks: ['Card payment processing', 'Live production support'] });
        }
        if (pathname === '/api/profile/career/achievements/assist') {
          const input = JSON.parse(request.postData());
          asks.push(input);
          await pause(150);
          const kw = input.keywords;
          return reply({ options: [
            { angle: 'Result first', text: `Cut card tokenization latency by [X]% with REST APIs${kw.length ? ` for ${kw.join(' and ')}` : ''}.`, keywords: kw, placeholders: ['[X]'] },
            { angle: 'Technical', text: `Built Node.js REST APIs for card tokenization${kw.length ? ` covering ${kw.join(', ')}` : ''}.`, keywords: kw, placeholders: [] },
            { angle: 'Concise', text: 'Built card tokenization REST APIs.', keywords: [], placeholders: [] },
          ] });
        }
        if (pathname === '/api/profile/career') {
          if (request.method() === 'GET') return reply(state);
          const input = JSON.parse(request.postData());
          saves.push(input.sections.experiences[0]);
          state = { revision: state.revision + 1, data: { experiences: { value: input.sections.experiences, source, importedAt } } };
          return reply(state);
        }
        return reply([]);
      })().catch(error => { errors.push(error.stack); void request.abort().catch(() => {}); });
    });
    const button = name => page.locator(`::-p-aria(${name})`);
    const clickText = (selector, text) => page.evaluate((selector, text) => [...document.querySelectorAll(selector)].find(item => item.textContent.trim() === text).click(), selector, text);
    const options = () => page.$$eval('.ai-option', rows => rows.map(row => row.textContent));
    const setEditor = (label, text) => page.evaluate((label, text) => {
      const box = document.querySelector(`[aria-label="${label}"]`);
      box.innerHTML = `<div>${text}</div>`;
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, label, text);
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.ach-text');

    // The wand: the bullet opens and 3 stronger versions come at once.
    await page.evaluate(() => document.querySelector('[aria-label^="Improve with AI: "]').click());
    await page.waitForSelector('.ai-option');
    assert.equal(asks[0].mode, 'improve');
    assert.equal(asks[0].text, 'Built REST APIs for card tokenization.');
    assert.equal((await options()).length, 3);
    assert.match(await page.$eval('.ai-option', row => row.innerHTML), /<mark class="ai-placeholder">\[X\]<\/mark>/);
    assert.match(await page.$eval('.ai-pane', element => element.textContent), /Replace \[X\] with your own numbers/);
    assert.equal(await page.$('[aria-label="Edit achievement"]'), null, 'the wand opens the box under the bullet as it is');
    assert.ok(await page.$('.ach-row-ai .ai-box'));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.ai-actions button')].some(button => button.textContent === 'Cancel')), 'after Automatic: Cancel');
    // Use it: into the editor, and the placeholder must be filled before Save.
    await button('Use Bullet').click();
    await page.waitForFunction(() => !document.querySelector('.ai-box'));
    assert.match(await page.$eval('[aria-label="Edit achievement"]', box => box.textContent), /by \[X\]% with REST APIs/);
    assert.equal(await page.$eval('.ach-editor-actions .ach-save', save => save.disabled), true, 'no Save with a placeholder');
    assert.match(await page.$eval('.ach-placeholder-note', note => note.textContent), /Replace \[X\] and \[N\] with your own numbers/);
    await setEditor('Edit achievement', 'Cut card tokenization latency by 30% with REST APIs.');
    await page.waitForFunction(() => !document.querySelector('.ach-editor-actions .ach-save').disabled);
    await page.click('.ach-editor-actions .ach-save');
    for (let i = 0; i < 40 && !saves.length; i++) await pause(100);
    assert.deepEqual(saves[0].bullets, ['Cut card tokenization latency by 30% with REST APIs.']);

    // A new bullet: Write with AI, Keywords (up to 3, own ones too), underlined, Back, Regenerate.
    await page.click('.ach-add-open');
    await page.waitForSelector('[aria-label="New bullet"]');
    assert.equal(await page.$eval('[aria-label="New bullet"]', box => box.dataset.placeholder), 'Type a bullet or use AI to write a draft for you.');
    await page.click('.ach-ai-button');
    await page.waitForSelector('.ai-option');
    assert.equal(asks.at(-1).mode, 'write');
    await clickText('.ai-tabs button', 'Keywords');
    await page.waitForSelector('.ai-chip');
    assert.equal(suggestionCalls, 1, 'keywords and tasks are asked for once per job');
    await clickText('.ai-chip', 'AWS Lambda');
    await clickText('.ai-chip', 'Production Support');
    await page.type('[aria-label="Add a keyword"]', 'PCI DSS');
    await page.keyboard.press('Enter');
    assert.equal(await page.$$eval('.ai-chip.is-on', chips => chips.length), 3);
    assert.equal(await page.$eval('[aria-label="Add a keyword"]', input => input.value), '');
    assert.ok(await page.$eval('.ai-chip:not(.is-on) input', input => input.disabled), 'no more than 3');
    await button('Generate Bullets').click();
    await page.waitForSelector('.ai-option');
    assert.deepEqual(asks.at(-1).keywords, ['AWS Lambda', 'Production Support', 'PCI DSS']);
    assert.deepEqual(await page.$$eval('.ai-option:nth-child(2) .ai-keyword', marks => marks.map(mark => mark.textContent)), ['AWS Lambda', 'Production Support', 'PCI DSS']);
    const before = asks.length;
    await button('Regenerate').click();
    await page.waitForSelector('.ai-option');
    assert.equal(asks.length, before + 1);
    assert.deepEqual(asks.at(-1).keywords, ['AWS Lambda', 'Production Support', 'PCI DSS'], 'Regenerate asks the same again');
    await button('Back').click();
    await page.waitForSelector('.ai-chip');

    // Coach Me: a task, then what it changed.
    await clickText('.ai-tabs button', 'Coach Me');
    await clickText('.ai-task', 'Live production support');
    await button('Continue').click();
    await clickText('.ai-chip', 'More reliable');
    await page.type('.ai-fields label:first-child input', '40% fewer incidents');
    await page.type('.ai-fields label:last-child input', 'in 3 months');
    await button('Generate Bullets').click();
    await page.waitForSelector('.ai-option');
    assert.deepEqual(asks.at(-1).coach, { task: 'Live production support', impacts: ['More reliable'], amount: '40% fewer incidents', period: 'in 3 months' });

    // Custom Prompt.
    await clickText('.ai-tabs button', 'Custom Prompt');
    await page.type('[aria-label="Custom prompt"]', 'Make it concise');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.ai-option');
    assert.equal(asks.at(-1).instruction, 'Make it concise');
    await page.evaluate(() => document.querySelectorAll('.ai-option input')[2].click());
    await button('Use Bullet').click();
    await page.waitForFunction(() => !document.querySelector('.ai-box'));
    assert.equal(await page.$eval('[aria-label="New bullet"]', box => box.textContent), 'Built card tokenization REST APIs.');
    await page.click('.ach-add-actions .ach-save');
    for (let i = 0; i < 40 && saves.length < 2; i++) await pause(100);
    assert.deepEqual(saves.at(-1).bullets, ['Cut card tokenization latency by 30% with REST APIs.', 'Built card tokenization REST APIs.']);
    assert.deepEqual(errors, []);
    console.log('PASS AI bullets: wand, Automatic, Keywords (3, own, underlined, Back, Regenerate), Coach Me, Custom Prompt, placeholders block Save, Write with AI');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
