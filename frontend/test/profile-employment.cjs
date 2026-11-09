const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1100 });
    const errors = [], writes = [];
    let fail = true, profile = { firstName: 'Sam', lastName: 'Lee', fullName: 'Sam Lee', email: 'sam@example.com', phone: '', location: 'Vancouver', city: 'Vancouver', country: 'Canada', workArrangements: '', requiresSponsorship: '', eeoRace: '', eeoGender: '', eeoDisability: '', eeoVeteran: '', eeoLgbtq: '' };
    let defaults = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => { void (async () => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return request.continue();
      const reply = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: profile.email });
      if (pathname === '/api/profile') {
        if (request.method() === 'PUT') { if (fail) return reply({ message: 'Temporary save failure' }, 503); const body = JSON.parse(request.postData()); writes.push(body); profile = { ...profile, ...body }; }
        return reply(profile);
      }
      if (pathname === '/api/profile/career') return reply({ revision: 0, data: {} });
      if (['/api/resumes', '/api/answers'].includes(pathname)) return reply([]);
      if (pathname === '/api/defaults') {
        if (request.method() === 'POST') for (const item of JSON.parse(request.postData()).defaults) {
          defaults = defaults.filter(row => row.kind !== item.kind || row.scope !== item.scope);
          defaults.push({ ...item, id: `row-${item.scope}`, updatedAt: '2026-11-08' });
        }
        return reply(defaults);
      }
      if (pathname.startsWith('/api/defaults/') && request.method() === 'DELETE') {
        defaults = defaults.filter(row => row.id !== decodeURIComponent(pathname.split('/').at(-1)));
        return request.respond({ status: 204 });
      }
      errors.push(`Unexpected ${request.method()} ${pathname}`); return reply({ message: 'Unexpected request' }, 500);
    })().catch(error => errors.push(error.stack)); });
    const open = async () => { await page.goto(`${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/profile`); await page.locator('::-p-aria(Edit details)').click(); await page.waitForSelector('.employment-information button:not([disabled])'); };
    const edit = () => page.locator('::-p-aria(Edit employment information)').click();
    const select = async (question, value) => { const handle = await page.$(`.employment-information ::-p-aria([name="${question}"][role="combobox"])`); assert.ok(handle, question); await handle.select(value); };
    await open();
    assert.equal(writes.length, 0);
    assert.equal(await page.$$eval('.employment-item > span', rows => rows.every(row => row.textContent === '—')), true, 'no personal values are guessed from the reference screenshot');
    await edit();
    await select('Are you authorized to work in the US?', 'No');
    await select('Are you authorized to work in Canada?', 'Yes');
    await select('Are you authorized to work in the United Kingdom?', 'No');
    await select('Will you now or in the future require sponsorship for employment visa status?', 'Yes');
    await select('Do you have a disability?', 'No');
    await select('Do you identify as LGBTQ+?', 'No');
    await select('What is your gender?', 'Man');
    await select('Are you a veteran?', 'No');
    await page.locator('::-p-aria(Save employment information)').click();
    await page.waitForSelector('.employment-information [role="alert"]');
    assert.ok(await page.$('.employment-information select'), 'failed save preserves the draft for retry');
    fail = false;
    await page.locator('::-p-aria(Save employment information)').click();
    await page.waitForFunction(() => !document.querySelector('.employment-information select'));
    assert.equal(profile.eeoGender, 'Man'); assert.equal(profile.eeoRace, '');
    assert.deepEqual(Object.fromEntries(defaults.map(row => [row.scope, row.value])), { 'United States': 'No', Canada: 'Yes', 'United Kingdom': 'No' });
    await open();
    await page.$eval('.employment-information', element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: '/private/tmp/job-agent-employment-information.png' });
    assert.match(await page.$eval('.employment-information', element => element.textContent), /Male/);
    await edit(); await select('What is your gender?', 'Woman'); await page.locator('.employment-information ::-p-aria(Cancel)').click();
    assert.equal(profile.eeoGender, 'Man', 'Cancel never saves an edit');
    assert.deepEqual(errors, []);
    console.log('PASS Employment Information: blank defaults, separate country authorization, explicit choices, save/retry, persistence and Cancel');
  } finally { browser.process()?.stdout?.destroy(); browser.process()?.stderr?.destroy(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
