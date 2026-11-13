const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// The format toolbar: select text in a Profile editor → Bold, Italic, Underline, Link,
// List, Clear → saved as marks, shown formatted. Synthetic API data only.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1400, height: 900 });
    const errors = [], saves = [];
    const source = { kind: 'profile' }, importedAt = '2026-11-08T12:00:00Z';
    let state = { revision: 1, data: {
      summary: { value: 'Backend engineer.\nPayments and security.', source, importedAt },
      experiences: { value: [{ title: 'Engineer', company: 'Ciklum', client: '', location: '', from: '2024-10', to: '', current: true, description: '', techStack: 'Node.js', bullets: ['Built REST APIs for card payments.'] }], source, importedAt },
    } };
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => void dialog.accept('acme.dev/payments'));
    await page.setRequestInterception(true);
    page.on('request', request => {
      void (async () => {
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/api/')) return request.continue();
        const reply = (value, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
        if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: 'sam@example.com' });
        if (pathname === '/api/profile') return reply({ firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '1', location: 'Vancouver', linkedin: 'x' });
        if (pathname === '/api/profile/career') {
          if (request.method() === 'GET') return reply(state);
          const input = JSON.parse(request.postData());
          saves.push(input.sections);
          state = { revision: state.revision + 1, data: { ...state.data, ...Object.fromEntries(Object.entries(input.sections).map(([key, value]) => [key, { value, source, importedAt }])) } };
          return reply(state);
        }
        return reply([]);
      })().catch(error => { errors.push(error.stack); void request.abort().catch(() => {}); });
    });
    const select = (selector, word) => page.evaluate((selector, word) => {
      const box = document.querySelector(selector);
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent.indexOf(word);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + word.length);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      throw new Error(`"${word}" not found`);
    }, selector, word);
    const tool = async name => {
      await page.waitForSelector(`.format-toolbar [aria-label="${name}"]`);
      await page.$eval(`.format-toolbar [aria-label="${name}"]`, button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    };
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.ach-text');

    // A bullet: bold, italic, underline and a link, saved as marks.
    await page.evaluate(() => document.querySelector('[aria-label^="Edit: "]').click());
    await page.waitForSelector('[aria-label="Edit achievement"]');
    await pause(150); // The editor puts the caret at the end once it opens.
    await select('[aria-label="Edit achievement"]', 'REST');
    await page.waitForSelector('.format-toolbar');
    assert.equal(await page.$('.format-toolbar [aria-label="Bulleted list"]'), null, 'no list inside one bullet');
    await tool('Bold');
    await select('[aria-label="Edit achievement"]', 'card');
    await tool('Italic');
    await select('[aria-label="Edit achievement"]', 'payments');
    await tool('Underline');
    await select('[aria-label="Edit achievement"]', 'APIs');
    await tool('Link');
    await page.evaluate(() => [...document.querySelectorAll('.ach-save')].find(button => button.textContent === 'Save').click());
    await page.waitForFunction(() => !document.querySelector('[aria-label="Edit achievement"]'));
    assert.equal(saves.at(-1).experiences[0].bullets[0], 'Built **REST** [APIs](https://acme.dev/payments) for *card* ++payments++.');
    const shown = await page.$eval('.ach-text', element => element.innerHTML);
    assert.match(shown, /<b>REST<\/b>/);
    assert.match(shown, /<i>card<\/i>/);
    assert.match(shown, /<u>payments<\/u>/);
    assert.match(shown, /marked-link">APIs/);

    // Clear formatting takes them off again.
    await page.evaluate(() => document.querySelector('[aria-label^="Edit: "]').click());
    await page.waitForSelector('[aria-label="Edit achievement"]');
    await pause(150); // The editor puts the caret at the end once it opens.
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('[aria-label="Edit achievement"]'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await tool('Clear formatting');
    await page.evaluate(() => [...document.querySelectorAll('.ach-save')].find(button => button.textContent === 'Save').click());
    await page.waitForFunction(() => !document.querySelector('[aria-label="Edit achievement"]'));
    assert.equal(saves.at(-1).experiences[0].bullets[0], 'Built REST APIs for card payments.');

    // Closing the editor takes the toolbar with it: Escape, and Cancel, with text still selected.
    for (const close of ['Escape', 'Cancel']) {
      // After a save the bullet's buttons wait for the Profile to come back.
      await page.waitForFunction(() => !document.querySelector('[aria-label^="Edit: "]')?.disabled);
      await page.evaluate(() => document.querySelector('[aria-label^="Edit: "]').click());
      await page.waitForSelector('[aria-label="Edit achievement"]');
      await pause(150);
      await select('[aria-label="Edit achievement"]', 'REST');
      await page.waitForSelector('.format-toolbar');
      if (close === 'Escape') await page.keyboard.press('Escape');
      else await page.evaluate(() => [...document.querySelectorAll('.ach-editor-actions button')].find(button => button.textContent === 'Cancel').click());
      await page.waitForFunction(() => !document.querySelector('[aria-label="Edit achievement"]'));
      await pause(100);
      assert.equal(await page.$('.format-toolbar'), null, `${close} closes the editor and the format toolbar with it`);
    }

    // The summary may hold a list.
    await page.click('[aria-label="Edit profile summary"]');
    await page.waitForSelector('[aria-label="Professional summary"]');
    await pause(150);
    await select('[aria-label="Professional summary"]', 'Payments and security.');
    await tool('Bulleted list');
    await page.evaluate(() => [...document.querySelectorAll('.ach-save')].find(button => button.textContent === 'Save').click());
    await page.waitForFunction(() => !document.querySelector('[aria-label="Professional summary"]'));
    assert.equal(saves.at(-1).summary, 'Backend engineer.\n- Payments and security.');
    assert.match(await page.$eval('#profile-summary-heading', element => element.closest('section').innerHTML), /<ul class="marked-list"><li>Payments and security\.<\/li><\/ul>/);
    assert.deepEqual(errors, []);
    console.log('PASS format toolbar: bold, italic, underline, link, clear, list; saved as marks and shown formatted');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
