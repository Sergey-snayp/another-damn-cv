const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Documents: the default CV carries a "Default" badge; "Make default" on another
// moves it there (saved on the server). Synthetic data.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], writes = [];
    const at = '2026-11-13T12:00:00Z';
    let rows = [
      { id: 'master', name: 'Master CV', targetRole: null, isPrimary: true, currentSnapshotId: 's', createdAt: at, updatedAt: at, jobId: null, sourceResumeId: null, hasTailoring: false },
      { id: 'backend', name: 'Backend CV', targetRole: null, isPrimary: false, currentSnapshotId: 's', createdAt: at, updatedAt: at, jobId: null, sourceResumeId: null, hasTailoring: false },
    ];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const p = new URL(request.url()).pathname, method = request.method();
      if (!p.startsWith('/api/')) return void request.continue();
      const reply = (value, status = 200) => void request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (method !== 'GET') writes.push(`${method} ${p}`);
      if (p === '/api/auth/me') return reply({ id: 'o', name: 'Sam Lee', email: 's@e.com' });
      if (p === '/api/resumes') return reply(rows);
      const made = /^\/api\/resumes\/([^/]+)\/default$/.exec(p);
      if (made && method === 'PUT') { rows = rows.map(row => ({ ...row, isPrimary: row.id === made[1] })); return void request.respond({ status: 204 }); }
      if (p.endsWith('/theme')) return reply({ theme: null });
      return reply([]);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents`);
    await page.waitForSelector('article.documents-card');
    const badges = () => page.$$eval('article.documents-card', cards => cards.filter(card => card.querySelector('.documents-default')).map(card => card.querySelector('.documents-card-title').textContent));
    assert.deepEqual(await badges(), ['Master CV']);

    await page.click('[aria-label="More actions for Master CV"]');
    assert.equal(await page.$('.documents-popover ::-p-text(Make default)'), null, 'the default has no "Make default"');
    await page.keyboard.press('Escape');
    await page.click('[aria-label="More actions for Backend CV"]');
    await page.locator('::-p-text(Make default)').click();
    await page.waitForFunction(() => [...document.querySelectorAll('article.documents-card')].some(card => card.querySelector('.documents-default') && /Backend CV/.test(card.textContent)));
    assert.deepEqual(await badges(), ['Backend CV'], 'one default at a time');
    assert.deepEqual(writes, ['PUT /api/resumes/backend/default']);
    assert.deepEqual(errors, []);
    console.log('PASS Documents: the default CV has its badge; Make default moves it and saves it');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
