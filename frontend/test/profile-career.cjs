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
      await page.waitForSelector('[aria-label="Add work experience"]');
    };
    const button = name => page.locator(`::-p-aria(${name})`);
    const input = (label, prefix = '.profile-career-editor') => page.locator(`${prefix} ::-p-aria([name="${label}"][role="textbox"])`);
    const closed = () => page.waitForFunction(() => !document.querySelector('.profile-career-editor'));
    const save = async () => { await button('Save to Profile').click(); await closed(); };
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    await visit();
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Detailed responsibilities/);
    assert.equal(writes.length, 0, 'reading never copies a CV to Profile');

    // One job: its fields, dates as month and year, and achievements as a list.
    await button('Edit Engineer at Profile Only Inc in Profile').click();
    await page.waitForSelector('.profile-career-editor .career-edit-entry');
    assert.equal(await page.$eval('#career-editor-title', element => element.textContent), 'Edit experience');
    await input('Job title').fill('Senior Backend Engineer');
    await input('Role description').fill('Complete role details and outcomes not constrained by a CV page.');
    await page.select('[aria-label="Start date year"]', '2019');
    await page.select('[aria-label="Start date month"]', '03');
    assert.match(await page.$eval('.career-date-fixed', element => element.textContent), /Present/, 'a current job ends at Present');
    await button('Remove bullet 1 from experience 1').hover();
    assert.notEqual(await page.$eval('.career-edit-bullet', element => getComputedStyle(element).borderColor), 'rgba(0, 0, 0, 0)', 'the removal target is highlighted');
    await button('Remove bullet 1 from experience 1').click();
    await button('Add Bullet').click();
    assert.equal(await focused(), 'Bullet 2', 'a new bullet takes the cursor');
    await input('Bullet 2').fill('Led Node.js services and mentored the delivery team.');
    await page.keyboard.press('Enter');
    assert.equal(await focused(), 'Bullet 3', 'Enter starts the next bullet');
    await page.keyboard.press('Backspace');
    assert.equal(await focused(), 'Bullet 2', 'Backspace in an empty bullet removes it');
    assert.equal(await page.$$eval('.career-edit-bullet', rows => rows.length), 2);
    await page.screenshot({ path: '/private/tmp/job-agent-profile-career-editor.png' });
    await button('Save to Profile').click();
    await page.waitForSelector('.profile-career-editor [role="alert"]');
    assert.match(await page.$eval('.profile-career-editor [role="alert"]', element => element.textContent), /Test profile save unavailable/);
    assert.deepEqual(state, original, 'a failed save changes no saved Profile data');
    assert.equal(await page.$eval('section[aria-label="Experience 1"] input', element => element.value), 'Senior Backend Engineer', 'failed saves preserve the draft');
    failSave = false;
    await save();
    assert.deepEqual(state.data.experiences.value[0].bullets, ['Keep this achievement.', 'Led Node.js services and mentored the delivery team.']);
    assert.equal(state.data.experiences.value[0].from, '2019-03');

    // Add: a new job, on its own.
    await button('Add work experience').click();
    await page.waitForSelector('.profile-career-editor .career-edit-entry');
    assert.equal(await page.$eval('#career-editor-title', element => element.textContent), 'Add experience');
    assert.equal(await page.$('.career-delete'), null, 'nothing to delete yet');
    await input('Job title').fill('Developer');
    await input('Company').fill('Earlier Employer');
    await save();
    assert.equal(state.data.experiences.value.length, 2);
    assert.equal(state.data.experiences.value[0].title, 'Senior Backend Engineer', 'adding keeps the other jobs');
    assert.deepEqual(state.data.educations, original.data.educations, 'editing experience preserves education');
    await visit();
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Senior Backend Engineer/);

    // A job's own edit button edits that job only; Save keeps the other jobs as they are.
    await button('Edit Developer at Earlier Employer in Profile').click();
    await page.waitForSelector('.profile-career-editor .career-edit-entry');
    assert.equal(await page.$eval('.career-editor-subtitle', element => element.textContent), 'Developer · Earlier Employer');
    assert.equal(await page.$$eval('.profile-career-editor .career-edit-entry', rows => rows.length), 1, 'only the job that was clicked');
    await input('Job title').fill('Backend Developer');
    await input('Tech stack (optional)').fill('Go, Redis');
    const untouched = structuredClone(state.data.experiences.value[0]);
    await save();
    assert.deepEqual(state.data.experiences.value[0], untouched, 'the other job is saved as it was');
    assert.equal(state.data.experiences.value[1].title, 'Backend Developer');
    assert.equal(state.data.experiences.value[1].techStack, 'Go, Redis', 'the tech stack is saved with the job');
    assert.match(await page.$eval('#profile-work-heading', element => element.closest('section').textContent), /Technologies: Go, Redis/);

    // Delete asks first; Keep keeps it.
    await button('Edit Backend Developer at Earlier Employer in Profile').click();
    await button('Remove experience 2').click();
    assert.match(await page.$eval('.career-confirm', element => element.textContent), /Delete this experience from your Profile\?/);
    await button('Keep').click();
    assert.equal(await page.$('.career-confirm'), null);
    // Closing with changes asks too: Escape, then Keep editing, then Discard.
    await input('Job title').fill('Unsaved title');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.career-confirm');
    assert.match(await page.$eval('.career-confirm', element => element.textContent), /Discard your changes\?/);
    await button('Keep editing').click();
    assert.equal(await page.$eval('section[aria-label="Experience 2"] input', element => element.value), 'Unsaved title', 'nothing is lost');
    await button('Cancel').click();
    await button('Discard').click();
    await closed();
    assert.equal(state.data.experiences.value[1].title, 'Backend Developer');

    // One education entry, the same way.
    await button('Edit Training Provider in Profile').click();
    await page.waitForSelector('.profile-career-editor .career-edit-entry');
    assert.equal(await page.$eval('#career-editor-title', element => element.textContent), 'Edit education');
    assert.equal(await page.$$eval('.profile-career-editor .career-edit-entry', rows => rows.length), 1);
    await button('Cancel').click();
    await closed();
    await page.evaluate(() => scrollTo(0, 0)); // The app's sticky header must not cover the button.
    // The summary is edited in place; the panel beside it checks it as a summary.
    await button('Edit profile summary').click();
    await input('Professional summary', '.profile-main').fill('Unsaved temporary summary.');
    await page.waitForFunction(() => /Summary check|Needs work|Fair|Good|Excellent/.test(document.querySelector('.bullet-panel')?.textContent ?? ''));
    assert.match(await page.$eval('.bullet-panel', element => element.textContent), /Years of experience.*No “I” or “my”.*Professional summary.*years of experience/s);
    await button('Cancel').click();
    assert.equal(await page.$('[aria-label="Professional summary"]'), null);
    assert.equal(state.data.summary.value, original.data.summary.value, 'Cancel discards edits');
    await button('Edit profile summary').click();
    await input('Professional summary', '.profile-main').fill('Backend engineer with 7 years of experience in payments.');
    await page.evaluate(() => [...document.querySelectorAll('.ach-save')].find(button => button.textContent === 'Save').click());
    await page.waitForFunction(() => !document.querySelector('[aria-label="Professional summary"]'));
    assert.equal(state.data.summary.value, 'Backend engineer with 7 years of experience in payments.');
    assert.match(await page.$eval('#profile-summary-heading', element => element.closest('section').textContent), /7 years of experience/);
    assert.equal(await page.$('.bullet-panel'), null, 'the panel closes with the editor');
    state = { revision: state.revision + 1, data: { ...state.data, summary: { value: 'Updated in another session.', source: { kind: 'profile' }, importedAt } } };
    await button('Edit profile skills').click();
    await input('Skills — one per line').fill('Node.js\nTypeScript\nNode.js\n');
    await save();
    assert.deepEqual(state.data.skills.value, ['Node.js', 'TypeScript']);
    assert.equal(state.data.summary.value, 'Updated in another session.', 'opening an editor reads the latest revision and preserves another session’s changes');
    await button('Edit Training Provider in Profile').click();
    await input('Field of study or course').fill('Advanced distributed systems');
    await save();
    assert.equal(state.data.educations.value[0].degree, '', 'training needs no degree');
    assert.equal(state.data.educations.value[0].field, 'Advanced distributed systems');
    // Deleting a job removes only that job, at once.
    await button('Edit Backend Developer at Earlier Employer in Profile').click();
    await button('Remove experience 2').click();
    await button('Delete').click();
    await closed();
    assert.deepEqual(state.data.experiences.value.map(role => role.title), ['Senior Backend Engineer']);
    await button('Edit Senior Backend Engineer at Profile Only Inc in Profile').click();
    await button('Remove experience 1').click();
    await button('Delete').click();
    await closed();
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
    assert.equal(await page.$eval('.profile-stack', element => element.textContent), 'Technologies: Kafka, Go');
    assert.deepEqual(await page.$$eval('.ach-text', rows => rows.map(row => row.textContent)), ['Shipped things.']);
    await button('Edit Engineer at Old Co in Profile').click();
    await page.waitForSelector('.profile-career-editor .career-edit-entry');
    assert.equal(await page.$eval('.profile-career-editor ::-p-aria([name="Tech stack (optional)"][role="textbox"])', field => field.value), 'Kafka, Go');
    await button('Cancel').click();
    await page.waitForFunction(() => !document.querySelector('.profile-career-editor'));
    // The bin on a job deletes it, after asking; "Cancel" in that question keeps it.
    let answer = false;
    page.on('dialog', dialog => void (answer ? dialog.accept() : dialog.dismiss()));
    await button('Delete Engineer at Old Co').click();
    assert.equal(state.data.experiences.value.length, 1, 'kept when the question is cancelled');
    answer = true;
    await button('Delete Engineer at Old Co').click();
    await page.waitForFunction(() => !document.querySelector('[aria-labelledby="profile-work-heading"] .profile-entry'));
    assert.deepEqual(state.data.experiences.value, []);
    assert.match(await page.$eval('.profile-success', element => element.textContent), /Deleted Engineer at Old Co/);
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
