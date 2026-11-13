const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// "How would you like to create this resume?": from the Profile, an upload, or a copy of
// one the person has (searched, viewable, design included). Synthetic API data only.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], created = [], saved = {}, themes = {};
    const source = { kind: 'profile' }, importedAt = '2026-11-13T12:00:00Z';
    const summary = (id, name, extra = {}) => ({ id, name, targetRole: null, isPrimary: false, currentSnapshotId: 's', createdAt: importedAt, updatedAt: importedAt, jobId: null, sourceResumeId: null, hasTailoring: false, ...extra });
    const rows = [summary('master', 'Sergey_Proniuk_Master', { isPrimary: true, targetRole: 'Backend Engineer' }), summary('swe', 'Software Engineer', { jobId: 'job-1' })];
    const blank = { contact: { lineageId: 'c0', firstName: '', lastName: '' }, summaries: {}, experiences: [], educations: [], skills: [], projects: [], certifications: [], customSections: [] };
    const master = { contact: { lineageId: 'c1', firstName: 'Sergey', lastName: 'Proniuk' }, summaries: { default: 'Backend engineer.' },
      experiences: [{ lineageId: 'e1', company: 'Ciklum', title: 'Senior Software Engineer', from: '2024-10', to: '', current: true, position: 0,
        achievements: [{ lineageId: 'a1', experienceLineageId: 'e1', bullet: 'Built a TLS certificate service.', verified: false, position: 0 }] }],
      educations: [], skills: [{ lineageId: 's1', name: 'Node.js', category: '', position: 0 }], projects: [], certifications: [], customSections: [] };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url()), p = url.pathname, method = request.method();
      if (!p.startsWith('/api/')) return void request.continue();
      const reply = (value, status = 200) => void request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (p === '/api/auth/me') return reply({ id: 'o', name: 'Sergey Proniuk', email: 's@e.com' });
      if (p === '/api/profile') return reply({ firstName: 'Sergey', lastName: 'Proniuk', email: 's@e.com', phone: '', location: 'Vancouver' });
      if (p === '/api/profile/career') return reply({ revision: 1, data: {
        summary: { value: 'Backend engineer with 7 years of experience.', source, importedAt },
        experiences: { value: [{ title: 'Senior Software Engineer', company: 'Ciklum', client: '', location: 'Canada', workType: 'remote', from: '2024-10', to: '', current: true, description: '', bullets: ['Built a TLS certificate service.'], techStack: 'Node.js' }], source, importedAt },
        skills: { value: ['Node.js'], source, importedAt },
      } });
      if (p === '/api/resumes' && method === 'GET') return reply(rows);
      if (p === '/api/resumes' && method === 'POST') { const body = JSON.parse(request.postData()); const id = `new-${created.length + 1}`; created.push({ id, ...body }); return reply(summary(id, body.name)); }
      const theme = /^\/api\/resumes\/([^/]+)\/theme$/.exec(p);
      if (theme && method === 'GET') return reply({ theme: theme[1] === 'master' ? { template: 'professional', font: 'Inter' } : null });
      if (theme && method === 'PUT') { themes[theme[1]] = JSON.parse(request.postData()); return reply({ ok: true }); }
      const save = /^\/api\/resumes\/([^/]+)\/save$/.exec(p);
      if (save) { saved[save[1]] = JSON.parse(request.postData()); return reply(blank); }
      const one = /^\/api\/resumes\/([^/]+)$/.exec(p);
      if (one && method === 'GET') return reply(one[1] === 'master' ? master : blank);
      return reply([]);
    });
    const open = async () => {
      await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents`);
      await page.waitForSelector('.documents-new-card');
      await page.click('.documents-new-card');
      await page.waitForSelector('.new-resume');
      // The window slides in: click once it is in place, as a person would.
      await page.waitForFunction(() => document.querySelector('.new-resume').getAnimations({ subtree: true }).every(animation => animation.playState !== 'running'));
    };

    // The chooser: three ways, the person's resumes to copy, newest default first, searchable.
    await open();
    assert.equal(await page.$eval('#new-resume-title', node => node.textContent), 'How would you like to create this resume?');
    assert.deepEqual(await page.$$eval('.new-resume-option strong', nodes => nodes.map(node => node.textContent)), ['Start From Profile', 'Upload a Resume']);
    assert.deepEqual(await page.$$eval('.new-resume-row strong', nodes => nodes.map(node => node.textContent)), ['Sergey_Proniuk_Master', 'Software Engineer']);
    assert.deepEqual(await page.$$eval('.new-resume-row:first-child .new-resume-tag', nodes => nodes.map(node => node.textContent)), ['Default']);
    assert.equal(await page.$eval('.new-resume-row:first-child .new-resume-view', node => node.getAttribute('href')), '/documents/master', 'View opens it');
    await page.type('[aria-label="Search resumes by name"]', 'software');
    assert.deepEqual(await page.$$eval('.new-resume-row strong', nodes => nodes.map(node => node.textContent)), ['Software Engineer']);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.new-resume'));
    assert.equal(created.length, 0, 'closing creates nothing');

    // From the Profile: created, filled, saved, opened.
    await open();
    await page.locator('.new-resume-option ::-p-text(Start From Profile)').click();
    await page.waitForFunction(() => location.pathname === '/documents/new-1');
    assert.equal(created[0].name, 'Sergey Proniuk Resume');
    assert.equal(saved['new-1'].message, 'filled from Profile');
    assert.equal(saved['new-1'].experiences[0].company, 'Ciklum');
    assert.deepEqual(saved['new-1'].achievements.map(item => item.bullet), ['Built a TLS certificate service.']);

    // A copy: the content with new ids (each line still on its job) and the design.
    await open();
    await page.click('.new-resume [aria-label="Select Sergey_Proniuk_Master to copy"]');
    await page.waitForFunction(() => location.pathname === '/documents/new-2');
    assert.deepEqual([created[1].name, created[1].targetRole], ['Sergey_Proniuk_Master (copy)', 'Backend Engineer']);
    const copy = saved['new-2'];
    assert.equal(copy.message, 'copied from Sergey_Proniuk_Master');
    assert.equal(copy.experiences[0].company, 'Ciklum');
    assert.notEqual(copy.experiences[0].lineageId, 'e1', 'new ids: a copy, not the same rows');
    assert.equal(copy.achievements[0].experienceLineageId, copy.experiences[0].lineageId, 'each line still on its job');
    assert.deepEqual(themes['new-2'], { template: 'professional', font: 'Inter' }, 'the design comes too');

    // Upload: the file picker, as before.
    await open();
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.locator('.new-resume-option ::-p-text(Upload a Resume)').click()]);
    assert.ok(chooser, 'Upload opens the file picker');
    await chooser.cancel();
    assert.equal(await page.$('.new-resume'), null, 'and the chooser closes');

    assert.deepEqual(errors, []);
    console.log('PASS new resume: from Profile, upload, or a copy (searched, viewable, new ids, design); Escape creates nothing');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
