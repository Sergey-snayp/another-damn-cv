const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// "Complete Profile", as Jobright's: five steps filled from the Profile, the
// missing answers shown on Finish, work authorization per country (the
// extension's earlier answers carried over), then the extension to install.
// The API is faked; nothing real is saved.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    const errors = [], profileWrites = [], defaultWrites = [];
    let profile = { firstName: 'Sam', lastName: 'Lee', fullName: 'Sam Lee', preferredName: '', email: 'sam@example.com', phone: '+1 604 555 0100', location: 'Vancouver, BC, Canada', addressLine: '', city: 'Vancouver', state: 'BC', country: 'Canada', postalCode: '', linkedin: '', github: '', portfolio: '', website: '', telegram: '', workArrangements: '', workAuthorization: '', requiresSponsorship: '', eeoRace: '', eeoGender: '', eeoDisability: '', eeoVeteran: '', eeoLgbtq: '' };
    // Answered earlier from the extension: allowed to work in Canada, no sponsorship; Poland is not one of Jobright's countries.
    let defaults = [
      { id: 'd1', kind: 'workAuthorization', scope: 'Canada', value: 'Yes', updatedAt: '2026-11-08' },
      { id: 'd2', kind: 'requiresSponsorship', scope: 'Canada', value: 'No', updatedAt: '2026-11-08' },
      { id: 'd3', kind: 'requiresSponsorship', scope: 'Poland', value: 'No', updatedAt: '2026-11-08' },
    ];
    const career = { revision: 3, data: {
      educations: { value: [{ institution: 'DIIT Institute', degree: "Bachelor's", field: 'Computer and Information Systems Security', from: '2012', to: '2016' }] },
      experiences: { value: [{ company: 'Ciklum', title: 'Senior Software Engineer', client: '', location: 'Vancouver', from: '2024-10', to: '', current: true, description: '', bullets: [], techStack: '' }] },
      skills: { value: ['TypeScript', 'Node.js'] },
    } };
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', (request) => { void (async () => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return request.continue();
      const reply = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: profile.email });
      if (pathname === '/api/profile') {
        if (request.method() === 'PUT') { const body = JSON.parse(request.postData()); profileWrites.push(body); profile = { ...profile, ...body }; }
        return reply(profile);
      }
      if (pathname === '/api/profile/career/collect') return reply({ revision: 3, jobs: [] });
      if (pathname === '/api/profile/career') return reply(career);
      if (['/api/resumes', '/api/answers'].includes(pathname)) return reply([]);
      if (pathname === '/api/defaults') {
        if (request.method() === 'POST') for (const item of JSON.parse(request.postData()).defaults) {
          defaultWrites.push(`${item.kind}:${item.scope}=${item.value}`);
          defaults = defaults.filter((row) => row.kind !== item.kind || row.scope !== item.scope);
          defaults.push({ ...item, id: `${item.kind}-${item.scope}`, updatedAt: '2026-11-17' });
        }
        return reply(defaults);
      }
      if (pathname.startsWith('/api/defaults/') && request.method() === 'DELETE') {
        defaults = defaults.filter((row) => row.id !== decodeURIComponent(pathname.split('/').at(-1)));
        return request.respond({ status: 204 });
      }
      errors.push(`Unexpected ${request.method()} ${pathname}`); return reply({ message: 'Unexpected request' }, 500);
    })().catch((error) => errors.push(error.stack)); });

    const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    await page.goto(`${base}/profile`);
    // The card lists what is missing and opens the window at its first step.
    await page.waitForSelector('.profile-complete-button');
    const card = await page.$eval('.profile-side-card', (node) => node.textContent);
    assert.match(card, /Complete your profile/);
    assert.match(card, /Personal details.*Work authorization.*Equal employment/s, 'the address, the citizenship and the diversity answers are missing');
    await page.click('.profile-complete-button');
    await page.waitForSelector('dialog.complete-profile[open]');
    const current = () => page.$eval('.complete-steps [aria-current="step"]', (node) => node.textContent.replace(/^\d/, ''));
    assert.equal(await current(), 'Personal');
    assert.equal(await page.$eval('dialog.complete-profile input[placeholder="First Name"]', (input) => input.value), 'Sam', 'filled from the Profile');

    // Step 1: Next with the address empty shows it; filled, it is saved.
    await page.click('.complete-next');
    await page.waitForSelector('dialog.complete-profile [data-missing] [role="alert"]');
    assert.equal(profileWrites.length, 0);
    await page.type('dialog.complete-profile input[placeholder="Enter your current address"]', '123 Main St');
    await page.click('.complete-next');
    await page.waitForFunction(() => /Education/.test(document.querySelector('.complete-steps [aria-current="step"]')?.textContent ?? ''));
    assert.deepEqual(profileWrites, [{ addressLine: '123 Main St' }], 'only what changed is saved');

    // Steps 2–4: what the Profile has.
    assert.match(await page.$eval('.complete-body', (node) => node.textContent), /DIIT Institute/);
    await page.click('.complete-next');
    assert.match(await page.$eval('.complete-body', (node) => node.textContent), /Senior Software Engineer.*Ciklum/s);
    await page.click('.complete-next');
    assert.match(await page.$eval('.complete-body', (node) => node.textContent), /TypeScript.*Node\.js/s);
    await page.click('.complete-next');

    // Step 5: Canada carried over from the extension's answers; only the citizen question is new.
    await page.waitForSelector('.work-card[aria-label="Canada"]');
    assert.deepEqual(await page.$$eval('.work-flags [aria-pressed="true"]', (flags) => flags.map((flag) => flag.getAttribute('aria-label'))), ['Canada']);
    await page.click('.complete-next');
    await page.waitForSelector('.work-card [data-missing] [role="alert"]');
    assert.equal(defaultWrites.length, 0, 'Finish with answers missing saves nothing');
    await page.click('.work-card[aria-label="Canada"] ::-p-aria(No)');
    // Not a citizen: authorized (Yes, carried over) and sponsorship (No) are shown, and the basis is asked.
    assert.deepEqual(await page.$$eval('.work-card[aria-label="Canada"] [aria-pressed="true"]', (buttons) => buttons.map((button) => button.textContent)), ['No', 'Yes', 'No']);
    await page.select('.work-card[aria-label="Canada"] select', 'PERMANENT_RESIDENT');
    for (const [question, value] of [['Do you have a disability?', 'No'], ['Are you a veteran?', 'No'], ['What is your gender?', 'Man'], ['Do you identify as LGBTQ+?', 'No'], ['How would you identify your race?', 'White']]) {
      const select = await page.$(`dialog.complete-profile ::-p-aria([name="${question}"][role="combobox"])`);
      assert.ok(select, question);
      await select.select(value);
    }
    await page.screenshot({ path: '/private/tmp/complete-profile-step5.png' });
    await page.click('.complete-next');
    await page.waitForSelector('.complete-done h2');
    assert.equal(await page.$eval('.complete-done h2', (node) => node.textContent), 'Just One Last Important Step!', 'no extension here: install it');
    assert.deepEqual(defaultWrites.sort(), ['authorizationBasis:Canada=PERMANENT_RESIDENT', 'citizenship:Canada=No', 'workCountry:Canada=Yes'], 'only what changed: authorized and sponsorship were already saved');
    assert.deepEqual(profileWrites.at(-1), { eeoDisability: 'No', eeoVeteran: 'No', eeoGender: 'Man', eeoLgbtq: 'No', eeoRace: 'White' });
    await page.screenshot({ path: '/private/tmp/complete-profile-done.png' });
    await page.click('.complete-done .complete-next');

    // The Profile shows the answers, and the card is gone.
    await page.waitForFunction(() => !document.querySelector('dialog.complete-profile'));
    await page.waitForFunction(() => !document.querySelector('.profile-complete-button'));
    await page.locator('::-p-aria(Edit details)').click();
    await page.waitForSelector('.equal-employment-list');
    const summary = await page.$eval('.equal-employment-list', (node) => node.textContent);
    assert.match(summary, /Countries where you want to work\s*Canada/);
    assert.match(summary, /Are you a citizen of Canada\?\s*No/);
    assert.match(summary, /Canada: Authorization basis\s*Permanent resident/);
    assert.equal(await page.$$eval('.equal-employment-list .is-missing', (rows) => rows.length), 0);
    assert.deepEqual(errors, []);
    console.log('PASS Complete Profile: five steps from the Profile, missing answers shown, Canada carried over and completed, saved, then the extension to install');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
