const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Layout and interaction regression for switching document kinds. All data is synthetic.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const errors = [], writes = [];
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => void dialog.accept());
    let empty = false, failLetters = false;
    const updatedAt = '2026-11-08T12:00:00Z';
    const cvs = Array.from({ length: 12 }, (_, index) => ({ id: `cv-${index}`, name: `Resume ${index}`, updatedAt, createdAt: updatedAt, isPrimary: false, currentSnapshotId: null }));
    let letters = [
      { jobId: 'beta', job: { company: 'Beta', title: 'Engineer' }, text: 'Dear team,\n\nI built services.\n\nSam', author: { firstName: 'Sam', lastName: 'Lee' }, updatedAt: '2026-11-09T12:00:00Z' },
      { jobId: 'acme', job: { company: 'Acme', title: 'Backend Engineer' }, text: 'Dear team,\n\nI built payment APIs.\n\nSam', author: { firstName: 'Sam', lastName: 'Lee' }, updatedAt },
    ];
    await page.setRequestInterception(true);
    page.on('request', request => { void (async () => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return request.continue();
      const reply = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (request.method() !== 'GET') writes.push(`${request.method()} ${pathname}`);
      if (pathname === '/api/auth/me') return reply({ id: 'library-test', name: 'Sam Lee', email: 'sam@example.com' });
      if (pathname === '/api/profile') return reply({ firstName: 'Sam', lastName: 'Lee', fullName: 'Sam Lee', email: 'sam@example.com', phone: '', location: '', country: '', workArrangements: '' });
      // The Profile page counts what the saved CVs could add, a read that saves nothing.
      if (pathname === '/api/profile/career/collect') return reply({ revision: 0, jobs: [] });
      if (pathname === '/api/profile/career') return reply({ revision: 0, data: {} });
      if (pathname === '/api/answers' || pathname === '/api/defaults') return reply([]);
      if (pathname === '/api/resumes') { await pause(180); return reply(empty ? [] : cvs); }
      if (pathname.endsWith('/theme')) return reply({ theme: null });
      if (pathname === '/api/cover-letters') { await pause(280); return reply(failLetters ? { message: 'Test load failure' } : empty ? [] : letters, failLetters ? 503 : 200); }
      if (pathname === '/api/jobs') return reply([{ id: 'acme', title: 'Backend Engineer', company: 'Acme' }]);
      if (pathname.startsWith('/api/cover-letters/') && request.method() === 'DELETE') {
        letters = letters.filter(row => row.jobId !== pathname.split('/').at(-1)); return request.respond({ status: 204 });
      }
      errors.push(`Unexpected ${request.method()} ${pathname}`); return reply({ message: 'Unexpected request' }, 500);
    })().catch(error => errors.push(error.stack)); });
    const go = async kind => {
      await page.locator(`.documents-kind ::-p-text(${kind})`).click();
      await page.waitForSelector(`.documents-new-card[aria-label="${kind === 'Resumes' ? 'Create a new resume' : 'Create a new cover letter'}"]`);
    };
    const ready = () => page.waitForSelector('.documents-grid[aria-busy="false"]');
    const geometry = () => page.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [box.x, box.y, box.width, box.height].map(value => Math.round(value * 10) / 10);
      };
      return Object.fromEntries(['.documents-header', '.documents-toolbar', '.documents-search', '.documents-kind', '.documents-add', '.documents-filter', '.documents-new-page', '.documents-new-card .documents-card-title'].map(selector => [selector, rect(selector)]));
    });
    const same = (a, b, label) => {
      for (const key of Object.keys(a)) a[key].forEach((value, index) => assert.ok(Math.abs(value - b[key][index]) <= 1, `${label}: ${key}[${index}] moved from ${value} to ${b[key][index]}`));
    };
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents`);
      await ready();
      assert.ok(await page.$eval('.documents-toolbar', element => [...element.children].every(child => child.getBoundingClientRect().right <= window.innerWidth)), 'toolbar controls fit within the viewport');
      assert.ok(await page.$eval('.documents-toolbar', element => {
        const boxes = [...element.children].map(child => child.getBoundingClientRect());
        return boxes.every((box, index) => !index || Math.abs(box.y - boxes[index - 1].y) > 1 || boxes[index - 1].right <= box.left + 1);
      }), 'toolbar controls never overlap');
      const resumeGeometry = await geometry();
      const resumePreview = await page.$eval('.documents-card .documents-preview', element => { const box = element.getBoundingClientRect(); return [box.width, box.height]; });
      await go('Cover Letters'); await ready();
      same(resumeGeometry, await geometry(), `${width}px cover letters`);
      const letterPreview = await page.$eval('.documents-card .documents-preview', element => { const box = element.getBoundingClientRect(); return [box.width, box.height]; });
      assert.ok(letterPreview.every((value, index) => Math.abs(value - resumePreview[index]) < 1), 'letter and resume previews use the same dimensions');
      await go('Resumes'); await ready(); same(resumeGeometry, await geometry(), `${width}px return to resumes`);
      await go('Cover Letters'); await ready(); same(resumeGeometry, await geometry(), `${width}px repeated switch`);
      if (width === 390) await page.screenshot({ path: '/private/tmp/job-agent-document-library-mobile.png' });
      console.log(`PASS stable library geometry at ${width}px`);
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.locator('::-p-aria(Filter and sort documents)').click();
    await page.locator('::-p-aria(Name)').click(); await page.locator('::-p-aria(Ascending)').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.documents-card .documents-card-title')?.textContent.includes('Acme'));
    assert.match(await page.$eval('.documents-card .documents-card-title', element => element.textContent), /Acme/);
    await page.locator('::-p-aria(Pin Beta · Engineer)').click();
    await page.waitForFunction(() => document.querySelector('.documents-card .documents-card-title')?.textContent.includes('Beta'));
    assert.match(await page.$eval('.documents-card .documents-card-title', element => element.textContent), /Beta/);
    await page.locator('::-p-aria(Select Acme · Backend Engineer)').click();
    await page.locator('::-p-aria(Pin selected)').click();
    assert.equal(await page.$('.documents-selection'), null);
    await page.locator('::-p-aria(Search documents)').fill('payment APIs');
    assert.equal(await page.$$eval('article.documents-card', rows => rows.length), 1);
    await page.locator('::-p-aria(Clear search)').click();
    await page.locator('::-p-aria(Add document)').click(); await page.locator('.documents-add ::-p-text(New Cover Letter)').click();
    await page.waitForSelector('dialog[open]'); await page.locator('dialog ::-p-aria(Close)').click();
    assert.equal(await page.$('.documents-popover'), null, 'opening and closing creation dismisses the Add menu');
    assert.deepEqual(writes, [], 'switching, sorting, pinning and opening creation never create documents or PDFs');
    await page.locator('::-p-aria(Select Beta · Engineer)').click(); await page.locator('::-p-aria(Delete selected)').click();
    await page.waitForFunction(() => document.querySelectorAll('article.documents-card').length === 1);
    assert.deepEqual(writes, ['DELETE /api/cover-letters/beta']);
    failLetters = true;
    await go('Resumes'); await ready(); await go('Cover Letters');
    await page.waitForSelector('.documents-error');
    failLetters = false; await page.locator('.documents-error ::-p-text(Retry)').click();
    await page.waitForSelector('.documents-error', { hidden: true }); await ready();
    assert.equal(await page.$('.documents-error'), null);
    empty = true;
    await go('Resumes'); await ready(); const emptyGeometry = await geometry();
    await go('Cover Letters'); await ready(); same(emptyGeometry, await geometry(), 'empty libraries');
    assert.equal(await page.$('.documents-empty'), null, 'an empty library shows its new card, no panel under it');
    await page.screenshot({ path: '/private/tmp/job-agent-cover-letter-library-empty.png' });
    empty = false; await go('Resumes'); await ready(); await go('Cover Letters'); await ready();
    await page.screenshot({ path: '/private/tmp/job-agent-cover-letter-library.png' });
    const styles = (selectors) => page.evaluate(map => {
      const read = (selector, properties, pseudo = null) => {
        const style = getComputedStyle(document.querySelector(selector), pseudo);
        return Object.fromEntries(properties.map(property => [property, style[property]]));
      };
      return {
        // Spacing only: the Profile is wider, to fit its bullet check panel.
        page: read('.content', ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']),
        heading: read(map.heading, ['fontSize', 'lineHeight']),
        panel: read(map.panel, ['borderRadius', 'borderColor', 'backgroundColor', 'boxShadow']),
        button: read(map.button, ['borderRadius', 'height', 'fontSize', 'backgroundColor']),
        tab: read(map.tab, ['padding', 'fontSize', 'backgroundColor', 'borderRadius']),
        underline: read(map.tab, ['height', 'backgroundColor'], '::after'),
      };
    }, selectors);
    const documentStyle = await styles({ heading: '.documents-header h1', panel: 'article.documents-card', button: '.documents-add > button', tab: '.documents-kind-option.is-active' });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector('.profile-tabs');
    const profileStyle = await styles({ heading: '.profile-header h1', panel: '.profile-panel', button: '.profile-header-actions .profile-button:not(.is-secondary)', tab: '.profile-tabs button.is-active' });
    assert.deepEqual(documentStyle, profileStyle, 'Documents follows the existing Profile page styles');
    assert.deepEqual(errors, []);
    console.log('PASS Documents matches Profile page spacing, typography, panels, buttons and underlined tabs');
    console.log('PASS cover letter sorting, pinning, selection, search, creation dialog, deletion, Retry and empty state');
  } catch (error) {
    console.error({ url: page?.url(), errors, writes });
    if (page && !page.isClosed()) await page.screenshot({ path: '/private/tmp/job-agent-document-library-failure.png' });
    throw error;
  } finally { browser.process()?.stdout?.destroy(); browser.process()?.stderr?.destroy(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
