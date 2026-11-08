const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Isolated browser and synthetic API data. No account or real document is changed.
(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true,
  });
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1200, height: 900 });
    const errors = [], writes = [], unexpected = [], contactWrites = [];
    let contact = { firstName: 'Sam', lastName: 'Lee', fullName: 'Sam Lee', email: 'sam@example.com', phone: '', location: '', city: '', linkedin: '', github: '', website: '', portfolio: '', telegram: '', workArrangements: '', workAuthorization: '', requiresSponsorship: '' };
    let failSave = true;
    const source = { kind: 'file', name: 'full-career.txt' }, importedAt = '2026-11-06T12:00:00Z';
    let state = { revision: 1, data: {
      summary: { value: 'Full professional background.', source, importedAt },
      experiences: { value: [{ title: 'Engineer', company: 'Profile Only Inc', client: 'Payments Client', location: 'Remote', from: '2020-03', to: '', current: true, description: 'Detailed responsibilities, independent of any CV.', bullets: ['Remove this bullet.', 'Keep this achievement.'] }], source, importedAt },
      educations: { value: [{ institution: 'Training Provider', degree: '', field: 'Distributed systems course', from: '', to: '' }], source, importedAt },
      skills: { value: ['Node.js'], source, importedAt },
    } };
    const original = structuredClone(state);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      void (async () => {
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/api/')) return request.continue();
        const reply = (value, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
        if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: 'sam@example.com' });
        if (pathname === '/api/profile') {
          if (request.method() === 'PUT') { const body = JSON.parse(request.postData()); contactWrites.push(body); contact = { ...contact, ...body }; }
          return reply(contact);
        }
        if (pathname === '/api/resumes') return reply([{ id: 'source', name: 'Short CV', isPrimary: true, currentSnapshotId: 'snapshot-1', updatedAt: importedAt }]);
        if (pathname === '/api/answers' || pathname === '/api/defaults') return reply([]);
        if (pathname === '/api/profile/career') {
          if (request.method() === 'GET') return reply(state);
          assert.equal(request.method(), 'PUT');
          const input = JSON.parse(request.postData()); writes.push(input);
          if (failSave) return reply({ message: 'Test profile save unavailable. Your edits are still here.' }, 503);
          assert.equal(input.expectedRevision, state.revision);
          state = { revision: state.revision + 1, data: { ...state.data } };
          for (const [key, value] of Object.entries(input.sections)) state.data[key] = { value, source: { kind: 'profile' }, importedAt };
          return reply(state);
        }
        unexpected.push(`${request.method()} ${pathname}`);
        return reply({ message: 'Unexpected API request' }, 500);
      })().catch(error => { errors.push(error.stack); void request.abort().catch(() => {}); });
    });
    const visit = async () => {
      await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
      await page.waitForSelector('[aria-label="Edit profile work experience"]');
    };
    const button = name => page.locator(`::-p-aria(${name})`);
    const input = (label, prefix = '.profile-career-editor') => page.locator(`${prefix} ::-p-aria([name="${label}"][role="textbox"])`);
    const save = async () => { await button('Save to Profile').click(); await page.waitForFunction(() => !document.querySelector('.profile-career-editor')); };
    await visit();
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Detailed responsibilities/);
    assert.equal(writes.length, 0, 'reading never copies a CV to Profile');
    await button('Edit profile work experience').click();
    await input('Job title').fill('Senior Backend Engineer');
    await input('Role description').fill('Complete role details and outcomes not constrained by a CV page.');
    await button('Remove bullet 1 from experience 1').hover();
    assert.notEqual(await page.$eval('.career-edit-bullet', element => getComputedStyle(element).borderColor), 'rgba(0, 0, 0, 0)', 'the removal target is highlighted');
    await button('Remove bullet 1 from experience 1').click();
    await button('+ Add bullet').click();
    await input('Bullet 2').fill('Led Node.js services and mentored the delivery team.');
    await button('+ Add experience').click();
    const second = '.profile-career-editor [aria-label="Experience 2"]';
    await input('Job title', second).fill('Developer');
    await input('Company', second).fill('Earlier Employer');
    await page.screenshot({ path: '/private/tmp/job-agent-profile-career-editor.png', fullPage: true });
    await button('Save to Profile').click();
    await page.waitForSelector('.profile-career-editor [role="alert"]');
    assert.match(await page.$eval('.profile-career-editor [role="alert"]', element => element.textContent), /Test profile save unavailable/);
    assert.deepEqual(state, original, 'a failed save changes no saved Profile data');
    assert.equal(await page.$eval('section[aria-label="Experience 1"] input', element => element.value), 'Senior Backend Engineer', 'failed saves preserve the draft');
    failSave = false;
    await save();
    assert.deepEqual(state.data.experiences.value[0].bullets, ['Keep this achievement.', 'Led Node.js services and mentored the delivery team.']);
    assert.equal(state.data.experiences.value.length, 2);
    assert.deepEqual(state.data.educations, original.data.educations, 'editing experience preserves education');
    await visit();
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Senior Backend Engineer/);
    // A job's own edit button edits that job only; Save keeps the other jobs as they are.
    await button('Edit Developer at Earlier Employer in Profile').click();
    await page.waitForSelector('.profile-career-editor .career-edit-entry');
    assert.equal(await page.$eval('#career-editor-title', element => element.textContent), 'Experience');
    assert.deepEqual(await page.$$eval('.profile-career-editor .career-edit-entry h3', rows => rows.map(row => row.textContent)), ['Developer · Earlier Employer'], 'only the job that was clicked');
    assert.equal(await page.$$eval('.profile-career-editor button', buttons => buttons.some(item => item.textContent.includes('Add experience'))), false, 'no adding other jobs here');
    await input('Job title').fill('Backend Developer');
    await input('Tech stack (optional)').fill('Go, Redis');
    const untouched = structuredClone(state.data.experiences.value[0]);
    await save();
    assert.deepEqual(state.data.experiences.value[0], untouched, 'the other job is saved as it was');
    assert.equal(state.data.experiences.value[1].title, 'Backend Developer');
    assert.equal(state.data.experiences.value[1].techStack, 'Go, Redis', 'the tech stack is saved with the job');
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Tech stack: Go, Redis/);
    assert.equal(state.data.experiences.value.length, 2);
    // Removing it from its own editor asks for Save, and Cancel keeps it.
    await button('Edit Backend Developer at Earlier Employer in Profile').click();
    await button('Remove experience 2').click();
    assert.match(await page.$eval('.profile-career-editor', element => element.textContent), /will be removed when you save/);
    assert.equal(await page.$$eval('.profile-career-editor .career-edit-entry', rows => rows.length), 0, 'no other job takes its place');
    await button('Cancel').click();
    assert.equal(state.data.experiences.value.length, 2);
    // The same for one education entry.
    await button('Edit Training Provider in Profile').click();
    assert.equal(await page.$eval('#career-editor-title', element => element.textContent), 'Education');
    assert.equal(await page.$$eval('.profile-career-editor .career-edit-entry', rows => rows.length), 1);
    await button('Cancel').click();
    await button('Edit profile summary').click();
    await input('Professional summary').fill('Unsaved temporary summary.');
    await button('Cancel').click();
    assert.equal(state.data.summary.value, original.data.summary.value, 'Cancel discards edits');
    state = { revision: state.revision + 1, data: { ...state.data, summary: { value: 'Updated in another session.', source: { kind: 'profile' }, importedAt } } };
    await button('Edit profile skills').click();
    await input('Skills — one per line').fill('Node.js\nTypeScript\nNode.js\n');
    await save();
    assert.deepEqual(state.data.skills.value, ['Node.js', 'TypeScript']);
    assert.equal(state.data.summary.value, 'Updated in another session.', 'opening an editor reads the latest revision and preserves another session’s changes');
    await button('Edit profile education').click();
    await input('Field of study or course').fill('Advanced distributed systems');
    await save();
    assert.equal(state.data.educations.value[0].degree, '', 'training needs no degree');
    assert.equal(state.data.educations.value[0].field, 'Advanced distributed systems');
    await button('Edit profile work experience').click();
    await button('Remove experience 2').click();
    await button('Remove experience 1').click();
    await save();
    assert.deepEqual(state.data.experiences.value, []);
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /No work experience saved in Profile/);
    // The page itself: only real content, tabs, and what is still missing.
    const pageText = await page.$eval('.profile-page', element => element.textContent);
    assert.doesNotMatch(pageText, /coming soon|subscription|Profile Strength/i, 'no placeholders');
    assert.deepEqual(await page.$$eval('.profile-tabs button', tabs => tabs.map(tab => tab.textContent)), ['Career', 'Personal info', 'Job preferences', 'Autofill answers']);
    const missing = await page.$$eval('.profile-checklist button', items => items.map(item => item.textContent));
    assert.deepEqual(missing, ['Phone', 'Location', 'Work experience', 'A link (LinkedIn, GitHub…)'], 'what is missing, and only that');
    await page.screenshot({ path: '/private/tmp/job-agent-profile-page.png', fullPage: true });
    await button('Phone').click();
    assert.equal(await page.$eval('.profile-tabs .is-active', tab => tab.textContent), 'Personal info', 'each missing item opens where to fill it');
    // Job preferences: type of work and Yes/No answers, saved together with Save changes.
    await page.evaluate(() => [...document.querySelectorAll('.profile-tabs button')].find(tab => tab.textContent === 'Job preferences').click());
    await page.click('.profile-choice:first-child input');
    await page.select('select', 'Yes');
    assert.match(await page.$eval('.profile-savebar', bar => bar.textContent), /Unsaved changes/);
    assert.ok(await page.$('.profile-tabs .profile-dot'), 'the tab shows it has unsaved changes');
    assert.equal(contactWrites.length, 0, 'nothing is saved before Save changes');
    await button('Save changes').click();
    await page.waitForFunction(() => /All changes saved/.test(document.querySelector('.profile-savebar')?.textContent ?? ''));
    assert.equal(contactWrites.at(-1).workArrangements, 'remote');
    assert.equal(contactWrites.at(-1).workAuthorization, 'Yes');
    await page.evaluate(() => [...document.querySelectorAll('.profile-tabs button')].find(tab => tab.textContent === 'Autofill answers').click());
    await page.waitForSelector('#saved-answers-heading');
    // An older save kept the tech stack as a bullet: it shows, and is edited, as the job's tech stack.
    state = { revision: state.revision + 1, data: { ...state.data, experiences: { value: [{ title: 'Engineer', company: 'Old Co', client: '', location: '', from: '2019', to: '2020', current: false, description: '', bullets: ['Shipped things.', 'Tech stack: Kafka, Go'] }], source, importedAt } } };
    await visit();
    assert.equal(await page.$eval('.profile-stack', element => element.textContent), 'Tech stack: Kafka, Go');
    assert.deepEqual(await page.$$eval('.profile-bullets li', rows => rows.map(row => row.textContent)), ['Shipped things.']);
    await button('Edit Engineer at Old Co in Profile').click();
    assert.equal(await page.$eval('.profile-career-editor ::-p-aria([name="Tech stack (optional)"][role="textbox"])', field => field.value), 'Kafka, Go');
    await button('Cancel').click();
    assert.deepEqual(unexpected, [], 'Profile editing never reads CV contents or writes CV/PDF endpoints');
    assert.deepEqual(errors, []);
    console.log('PASS Profile career editing: roles, descriptions, bullet add/remove, optional degree, skills, Cancel, retry, persistence, no CV fallback or writes');
    await page.close();
  } catch (error) {
    if (page && !page.isClosed()) {
      console.error(await page.$$eval('.profile-career-editor textarea', elements => elements.map(element => ({ label: element.labels?.[0]?.textContent, value: element.value }))));
      await page.screenshot({ path: '/private/tmp/job-agent-profile-editor-failure.png', fullPage: true });
    }
    throw error;
  } finally {
    browser.process()?.stdout?.destroy(); browser.process()?.stderr?.destroy();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
