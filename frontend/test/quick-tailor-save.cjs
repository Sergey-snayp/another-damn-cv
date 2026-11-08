const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Run against the local Vite server. All API responses are synthetic; these
// checks never sign in to an account, save real documents or print real PDFs.
const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function editText(page, selector, value, key = 'Enter') {
  await page.click(selector);
  await page.$eval(selector, element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  if (value) await page.keyboard.type(value);
  else await page.keyboard.press('Backspace');
  if (key) await page.keyboard.press(key);
}

async function editBulletControls(page, quick = false) {
  const first = '[data-section="experience"] article:first-of-type';
  const other = '[data-section="experience"] article:nth-of-type(2)';
  const bullets = role => page.$$eval(`${role} li[data-edit-item="bullet"] [contenteditable]`, rows => rows.map(row => row.textContent));
  const typeAdded = async value => {
    assert.equal(await page.evaluate(() => document.activeElement.isContentEditable), true, 'a new item receives keyboard focus');
    await page.keyboard.type(value); await page.keyboard.press('Enter');
  };
  await page.hover(`${first} li[data-edit-item="bullet"]`);
  const remove = `${first} li[data-edit-item="bullet"] .doc-remove`;
  await page.hover(remove); await pause(160);
  const target = await page.$eval(remove, button => ({
    background: getComputedStyle(button.closest('li')).backgroundColor,
    shadow: getComputedStyle(button.closest('li')).boxShadow,
    label: getComputedStyle(button, '::after').content,
    roleShadow: getComputedStyle(button.closest('article')).boxShadow,
  }));
  assert.notEqual(target.background, 'rgba(0, 0, 0, 0)');
  assert.notEqual(target.shadow, 'none', 'the exact bullet is outlined before removal');
  assert.equal(target.roleShadow, 'none', 'removing a bullet does not mark the entire experience');
  assert.equal(target.label, 'none', 'a remove shows no text on hover');
  assert.equal((await bullets(first)).length, 2, 'hover is only a preview');
  if (quick) await page.screenshot({ path: '/private/tmp/job-agent-remove-bullet.png' });
  await page.click(remove);
  assert.deepEqual(await bullets(first), ['Improved service reliability.']);
  assert.deepEqual(await bullets(other), ['Maintained internal tooling.']);
  if (quick) {
    await page.click('.qt-history button[aria-label="Undo"]');
    assert.deepEqual(await bullets(first), ['Built payment APIs.', 'Improved service reliability.']);
    await page.click('.qt-history button[aria-label="Redo"]');
    assert.deepEqual(await bullets(first), ['Improved service reliability.']);
  }
  await page.hover(first);
  await page.hover(`${first} > .pro-add-bullet`);
  assert.notEqual(await page.$eval(`${first} > .doc-bullets`, list => getComputedStyle(list).boxShadow), 'none', 'Add bullet previews the insertion location');
  await page.click(`${first} > .pro-add-bullet`);
  await typeAdded('Added customer alerts.');
  await page.hover(`${first} li[data-edit-item="bullet"]`);
  await page.click(`${first} li[data-edit-item="bullet"] .pro-insert`);
  await typeAdded('Temporary middle bullet.');
  assert.deepEqual(await bullets(first), ['Improved service reliability.', 'Temporary middle bullet.', 'Added customer alerts.']);
  const middle = `${first} li[data-edit-item="bullet"]:nth-of-type(2)`;
  await page.hover(middle); await page.click(`${middle} .doc-remove`);
  assert.deepEqual(await bullets(first), ['Improved service reliability.', 'Added customer alerts.']);
  await page.hover(`${other} > .doc-roleline`);
  await page.hover(`${other} > .doc-roleline > .doc-remove`); await pause(160);
  assert.notEqual(await page.$eval(other, role => getComputedStyle(role).boxShadow), 'none', 'Remove experience outlines the entire role');
  assert.deepEqual(await bullets(other), ['Maintained internal tooling.']);
  await page.hover(other); await page.click(`${other} > .pro-add-bullet`);
  // Leave this blank to check that placeholders and empty bullet markers stay out of PDF.
  assert.equal(await page.evaluate(() => document.activeElement.isContentEditable), true);

  for (const [section, finalText] of [
    ['[data-section="projects"] article', 'Shipped the project.'],
    ['[data-section="custom:custom-1"]', 'Organised a community workshop.'],
  ]) {
    await page.hover(`${section} li[data-edit-item="bullet"]`);
    await page.click(`${section} li[data-edit-item="bullet"] .doc-remove`);
    await page.hover(section); await page.click(`${section} > .pro-add-bullet`);
    await typeAdded(finalText);
  }
}

async function editInlineSections(page) {
  const edit = (selector, value, key) => editText(page, selector, value, key);
  const skill = '[data-section="skills"] .pro-skill [contenteditable="true"]';
  await edit(skill, 'Discard this', 'Escape');
  assert.equal(await page.$eval(skill, element => element.textContent), 'Node.js', 'Escape restores the original skill');
  await edit(skill, 'TypeScript');
  await edit('[data-section="skills"] [aria-label="Skill type"]', 'Languages');
  await page.focus('[data-section="skills"] button[aria-label="Remove skill: Python"]');
  await pause(160);
  assert.notEqual(await page.$eval('[data-section="skills"] button[aria-label="Remove skill: Python"]', button => getComputedStyle(button.closest('.pro-skill')).boxShadow), 'none', 'removing a skill outlines only that skill');
  await page.keyboard.press('Enter');
  await page.hover('[data-section="skills"] li');
  await page.hover('[data-section="skills"] .doc-add.inline');
  assert.notEqual(await page.$eval('[data-section="skills"] .doc-add.inline', button => getComputedStyle(button.closest('li')).boxShadow), 'none', 'Add skill identifies its category');
  await page.click('[data-section="skills"] .doc-add.inline');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.pro-skill')?.dataset.added), 'true');
  await edit('[data-section="skills"] .pro-skill [contenteditable="true"]:empty', 'Rust');
  // A new skills line: its type first (optional), Enter, then the skill.
  await page.click('[data-control-key="add-skill"]');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Skill type (optional)', 'a new skills line starts at its type');
  await page.keyboard.type('Data');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Skill', 'Enter moves from the type to the skill');
  await page.keyboard.type('Kafka');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForFunction(() => !document.querySelector('.pro-new-skill-line'));
  // Left empty, a new line leaves nothing behind.
  const skillCount = await page.$$eval('[data-section="skills"] .pro-skill', rows => rows.length);
  await page.click('[data-control-key="add-skill"]');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForFunction(() => !document.querySelector('.pro-new-skill-line'));
  assert.equal(await page.$$eval('[data-section="skills"] .pro-skill', rows => rows.length), skillCount, 'an empty new skills line is dropped');

  const field = label => `[data-section="education"] [aria-label="${label}"]`;
  await edit(field('Institution'), 'New University');
  await edit(field('Degree'), 'Master of Science');
  await edit(field('Field of study'), 'Software Engineering');
  await edit(field('Education start date'), 'Sep 2014');
  await edit(field('Education end date'), 'Jun 2018');
  const course = '[data-section="education"] article:nth-of-type(2)';
  const courseTitle = () => page.$eval(`${course} .doc-title`, element => element.textContent.trim());
  const courseName = 'Advanced Node.js — Streams, Event Emitters, Microservices';
  assert.equal(await page.$(`${course} [aria-label="Degree"]`), null, 'a course without a degree has no empty Degree placeholder');
  assert.equal(await courseTitle(), courseName, 'the course name has no leading comma');
  await page.focus(`${course} [aria-label="Add degree"]`);
  await page.keyboard.press('Enter');
  await page.waitForSelector(`${course} [aria-label="Degree"]`);
  assert.equal(await page.$eval(`${course} [aria-label="Degree"]`, element => element === document.activeElement), true, 'Add degree focuses the optional field');
  await edit(`${course} [aria-label="Degree"]`, 'Certificate');
  assert.equal(await courseTitle(), `Certificate, ${courseName}`);
  await edit(`${course} [aria-label="Field of study"]`, '');
  assert.equal(await courseTitle(), 'Certificate', 'a degree without a course also has no trailing comma');
  await edit(`${course} [aria-label="Field of study"]`, courseName);
  await edit(`${course} [aria-label="Degree"]`, '');
  assert.equal(await page.$(`${course} [aria-label="Degree"]`), null, 'clearing a degree hides its field again');
  assert.equal(await courseTitle(), courseName);
  await page.click('[data-section="education"] > .doc-add');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Institution', 'new education is focused in place');
  assert.equal(await page.$$eval('[data-section="education"] article', rows => rows.length), 3, 'education can be added directly on the CV');
  await page.focus('[data-section="education"] article:last-of-type button[aria-label^="Remove education"]');
  await pause(160);
  assert.notEqual(await page.$eval('[data-section="education"] article:last-of-type', row => getComputedStyle(row).boxShadow), 'none', 'the whole education entry is marked for removal');
  await page.keyboard.press('Enter');
  assert.equal(await page.$$eval('[data-section="education"] article', rows => rows.length), 2);
  assert.equal(await page.$('.studio-form'), null, 'direct editing and add/remove controls do not open the sidebar menu');
}

function assertInlineChanges(resume, source) {
  const renamed = resume.skills.find(skill => skill.name === 'TypeScript');
  assert.equal(renamed.category, 'Languages');
  assert.equal(renamed.weight, 4, 'editing keeps the skill metadata');
  assert.deepEqual(renamed.aliases, ['Node']);
  assert.ok(!resume.skills.some(skill => skill.name === 'Python'));
  assert.ok(resume.skills.some(skill => skill.name === 'Rust' && skill.category === 'Languages'));
  assert.ok(resume.skills.some(skill => skill.name === 'AWS' && skill.category === 'Cloud'), 'other categories remain unchanged');
  assert.ok(resume.skills.some(skill => skill.name === 'Kafka' && skill.category === 'Data'), 'a new line keeps its type');
  assert.ok(!resume.skills.some(skill => !skill.name.trim()), 'no empty skills are saved');
  assert.deepEqual(resume.educations.map(row => [row.institution, row.degree, row.field, row.from, row.to]), [
    ['New University', 'Master of Science', 'Software Engineering', '2014-09', '2018-06'],
    ['EPAM', '', 'Advanced Node.js — Streams, Event Emitters, Microservices', '', ''],
  ]);
  assert.equal(source.skills[0].name, 'Node.js');
  assert.equal(source.educations[0].institution, 'Original University');
  assert.deepEqual(resume.experiences[0].achievements.map(row => row.bullet), ['Improved service reliability.', 'Added customer alerts.']);
  assert.equal(resume.experiences[0].achievements[0].weight, 3);
  assert.equal(resume.experiences[0].achievements[0].evidence, 'production logs');
  assert.ok(resume.experiences[0].achievements.every(row => row.lineageId && row.experienceLineageId === resume.experiences[0].lineageId));
  assert.deepEqual(resume.experiences[1].achievements.map(row => row.bullet), ['Maintained internal tooling.', '']);
  assert.deepEqual(resume.projects[0].bullets, ['Added monitoring.', 'Shipped the project.']);
  assert.deepEqual(resume.customSections[0].bullets, ['Organised meetups.', 'Organised a community workshop.']);
  assert.equal(source.experiences[0].achievements[0].bullet, 'Built payment APIs.');
}

async function check(browser, failure, fullEditor = false, historyMode = false) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 880 });
  const events = [], errors = [], aiRequests = [], assessmentRequests = [];
  let assessmentUnavailable = historyMode;
  let assessedOnOpen = 0;
  let fail = failure, cvSaved = false;
  let savedId = fullEditor ? 'copy-1' : null, createdDocuments = fullEditor ? 1 : 0;
  let resume = {
    snapshot: 1, contact: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
    summaries: { default: 'Backend engineer.' }, experiences: [
      { lineageId: 'role-1', company: 'Acme Labs', title: 'Backend Engineer', from: '2020', current: true, achievements: [
        { lineageId: 'bullet-1', experienceLineageId: 'role-1', bullet: 'Built payment APIs.', weight: 4 },
        { lineageId: 'bullet-2', experienceLineageId: 'role-1', bullet: 'Improved service reliability.', weight: 3, evidence: 'production logs' },
      ] },
      { lineageId: 'role-2', company: 'Other Co', title: 'Developer', from: '2018', to: '2020', achievements: [
        { lineageId: 'bullet-3', experienceLineageId: 'role-2', bullet: 'Maintained internal tooling.' },
        { lineageId: 'bullet-4', experienceLineageId: 'role-2', bullet: 'Tech stack: Go, Redis' },
      ] },
    ],
    educations: [
      { lineageId: 'education-1', institution: 'Original University', degree: 'BSc', field: 'Computer Science', from: '2013-09', to: '2017-06' },
      { lineageId: 'course-1', institution: 'EPAM', degree: '', field: 'Advanced Node.js — Streams, Event Emitters, Microservices', from: '', to: '' },
    ],
    skills: [
      { lineageId: 'skill-1', name: 'Node.js', category: 'Backend', weight: 4, aliases: ['Node'] },
      { lineageId: 'skill-2', name: 'Python', category: 'Backend' },
      { lineageId: 'skill-3', name: 'AWS', category: 'Cloud' },
    ],
    projects: [{ lineageId: 'project-1', name: 'Side project', bullets: ['Built a dashboard.', 'Added monitoring.'] }],
    certifications: [], customSections: [{ lineageId: 'custom-1', title: 'Community', bullets: ['Mentored developers.', 'Organised meetups.'] }],
  };
  const source = structuredClone(resume);
  const prepared = () => ({ resumeId: savedId, sourceResumeId: 'source', name: 'Sam_Lee_CV_Acme_Engineer', document: savedId ? resume : source, theme: null });
  const apply = changes => {
    const { achievements, experiences, summaries, ...rest } = changes;
    const next = { ...resume, ...rest,
      experiences: experiences.map(role => ({ ...role, achievements: achievements.filter(bullet => bullet.experienceLineageId === role.lineageId) })),
      summaries: Object.fromEntries(summaries.map(item => [item.variant, item.text])),
    };
    if (JSON.stringify(next) !== JSON.stringify(resume)) next.snapshot = resume.snapshot + 1;
    resume = next;
  };
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.testMessages = [];
    window.addEventListener('message', event => { if (event.source === window) window.testMessages.push(event.data); });
  });
  await page.setRequestInterception(true);
  const handleRequest = request => {
    void (async () => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return request.continue();
      const reply = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (pathname === '/api/auth/me') return reply({ id: 'test-user', name: 'Sam Lee', email: 'sam@example.com', avatarUrl: null });
      if (pathname === '/api/jobs/job-1/tailor-copy') { events.push('copy'); createdDocuments++; return reply({ resumeId: 'copy-1' }); }
      if (pathname === '/api/jobs/job-1/quick-tailor' && request.method() === 'GET') { events.push('preview'); return reply(prepared()); }
      if (pathname === '/api/jobs/job-1/quick-tailor' && request.method() === 'POST') {
        events.push('save');
        await pause(100);
        if (fail === 'cv') return reply({ message: 'Test save failure' }, 503);
        const body = JSON.parse(request.postData());
        assert.equal(body.resumeId, savedId, 'a retry must reuse the document already created by Save');
        if (!savedId) { savedId = 'copy-1'; createdDocuments++; }
        apply(body.changes);
        cvSaved = true;
        return reply(prepared());
      }
      if (pathname === '/api/resumes') return reply([{ id: 'copy-1', name: 'Sam_Lee_CV_Acme_Engineer', jobId: 'job-1', updatedAt: '2026-11-05' }]);
      if (pathname === '/api/resumes/copy-1') return reply(resume);
      if (pathname === '/api/print/resumes/copy-1') return reply({ resume, theme: null });
      if (pathname.endsWith('/theme')) {
        if (request.method() === 'PUT') events.push('theme');
        return reply({ theme: null });
      }
      if (pathname === '/api/jobs') return reply([]);
      if (pathname === '/api/jobs/job-1') return reply({ id: 'job-1', title: 'Engineer', company: 'Acme', description: 'Build Node.js services.' });
      if (pathname.endsWith('/score')) return reply({ score: historyMode ? 50 : null, keywords: historyMode ? { matched: ['Node.js'], missing: ['Docker'] } : null, issues: [], job: { id: 'job-1', title: 'Engineer', company: 'Acme' } });
      if (pathname.endsWith('/job-assessment')) {
        assessmentRequests.push({ path: pathname, body: JSON.parse(request.postData() || '{}') });
        await pause(200);
        if (assessmentUnavailable) return reply({ message: 'Test assessment unavailable' }, 503);
        return reply({ verdict: 'apply', score: 8, technologies: [{ name: 'Node.js', inProfile: true }, { name: 'Docker', inProfile: false }],
          summary: 'I would apply. Your payment API work in Node.js fits the central backend responsibilities; confirm how much Docker the role expects.',
          strengths: [{ point: 'Your API delivery is relevant to this role.', jobQuote: 'Build Node.js services.', profileQuote: 'Led payment API delivery, including details omitted from this CV.' }],
          gaps: [{ point: 'The Profile does not yet show container operations experience.', jobQuote: 'Build Node.js services.', importance: 'preferred' }],
          questions: ['How much infrastructure ownership is expected?'], basis: { source: 'profile', profileRevision: 3, jobId: 'job-1' } });
      }
      if (pathname.endsWith('/tailor-summary')) {
        aiRequests.push(JSON.parse(request.postData() || '{}')); await pause(150);
        return reply({ original: '', summary: 'Built services for **Acme**.', wordCount: 4, mapping: [{ item: 'Node.js', type: 'required', evidence: 'NO EVIDENCE', employer: null }], gaps: ['Node.js'], decidingGap: 'Node.js', failedChecks: [{ id: 'word-count', name: 'Word count', ok: false, detail: '4 words; it must be 80 to 120.' }], attempts: 3 });
      }
      if (pathname.endsWith('/tailor-skills')) {
        const body = JSON.parse(request.postData() || '{}');
        await pause(150);
        return reply({ groups: body.groups.map(group => ({ category: group.category, skills: [...new Set([...group.skills, 'Kubernetes'])], added: ['Kubernetes'], dropped: [] })), cannotDo: [] });
      }
      if (pathname.endsWith('/tailor-line')) {
        const body = JSON.parse(request.postData() || '{}');
        aiRequests.push(body);
        // Bullets of a job arrive one by one and are long, as the real AI's are.
        if (body.kind === 'techStack') {
          await pause(150);
          return reply({ original: body.text, suggestion: 'Redis, Go', cannotDo: [] });
        }
        if (body.kind === 'bullet' && /Acme Labs/.test(body.context || '')) {
          await pause(300 + 500 * aiRequests.length % 1200);
          return reply({ suggestion: `${body.text} Rewritten for the job with reliable services, observability and clear ownership from design through production support for the team.`, cannotDo: [] });
        }
        await pause(150);
        return reply({ suggestion: 'Built services for Acme.', cannotDo: [] });
      }
      if (pathname.endsWith('/save')) {
        events.push('save');
        await pause(100);
        if (fail === 'cv') return reply({ message: 'Test save failure' }, 503);
        const body = JSON.parse(request.postData());
        const { message, ...changes } = body;
        apply(changes);
        cvSaved = true;
        return reply(resume);
      }
      if (pathname.endsWith('/pdf') && request.method() === 'POST') {
        assert.ok(cvSaved, 'PDF generation must follow a successful CV save');
        events.push('pdf');
        await pause(100);
        return fail === 'pdf' ? reply({ message: 'Test PDF failure' }, 503) : reply({ fileName: 'Sam_Lee_Resume.pdf', version: `${resume.snapshot}:design:3` });
      }
      if (pathname.endsWith('/pdf')) { events.push('download'); return request.respond({ status: 204 }); }
      return reply({});
    })().catch(error => { errors.push(error.message); void request.abort().catch(() => {}); });
  };
  page.on('request', handleRequest);
  const checkPrint = async () => {
    const print = await browser.newPage();
    try {
      await print.setRequestInterception(true);
      print.on('request', handleRequest);
      await print.goto(`${appUrl}/print/resumes/copy-1?token=test`);
      await print.waitForSelector('[data-section="education"]');
      assert.equal(await print.$('[contenteditable="true"]'), null, 'the printed CV is read-only');
      assert.equal(await print.$('.doc-add, .pro-skill .doc-remove, .doc-education .doc-remove'), null, 'editing controls stay out of the printed CV');
      assert.equal(await print.$('.qt-assessment'), null, 'job recommendations stay out of the CV PDF');
      const text = await print.$eval('.page', element => element.textContent);
      for (const value of ['Languages: TypeScript, Rust', 'Cloud: AWS', 'New University', 'Master of Science, Software Engineering', 'Sep 2014 - Jun 2018'])
        assert.ok(text.includes(value), `the printed CV includes ${value}`);
      assert.equal(await print.$eval('[data-section="education"] article:nth-of-type(2) .doc-title', element => element.textContent), 'Advanced Node.js — Streams, Event Emitters, Microservices', 'the PDF keeps the course without a degree or stray punctuation');
      for (const value of ['Improved service reliability.', 'Added customer alerts.', 'Shipped the project.', 'Organised a community workshop.'])
        assert.ok(text.includes(value), `the PDF includes ${value}`);
      for (const value of ['Built payment APIs.', 'Built a dashboard.', 'Mentored developers.']) assert.ok(!text.includes(value));
      assert.equal(await print.$$eval('[data-section="experience"] article:nth-of-type(2) li', rows => rows.length), 1, 'blank bullets do not print markers or placeholders');
    } finally { await print.close(); }
  };

  try {
    await page.goto(`${appUrl}${fullEditor ? '/documents/copy-1' : '/popup/jobs/job-1/quick-tailor?from=source'}`);
    const summary = '[data-section="summary"] [contenteditable="true"]';
    await page.waitForSelector(summary);
    if (!fullEditor) {
      assert.ok(events.includes('preview') && !events.includes('copy'), 'opening reads a draft instead of creating a copy');
      assert.equal(createdDocuments, 0, 'opening Quick Tailor creates no document');
      assert.equal(await page.evaluate(() => window.testMessages.some(message => message.type === 'CV_PLATFORM_RESUMES_CHANGED')), false, 'opening does not publish a new document to the extension');
      await page.waitForSelector('.qt-assessment-start button');
      await pause(400);
      assert.equal(assessmentRequests.length, 0, 'opening Quick Tailor does not run "Should you apply?"');
      await page.click('.qt-assessment-start button');
      if (historyMode) {
        await page.waitForSelector('.qt-assessment [role="alert"]');
        assert.match(await page.$eval('.qt-assessment', element => element.textContent), /Test assessment unavailable/);
        assessmentUnavailable = false;
        await page.click('.qt-assessment button');
      }
      await page.waitForSelector('.qt-assessment-verdict');
      assert.match(await page.$eval('.qt-assessment', element => element.textContent), /I’d apply/);
      assert.match(await page.$eval('.qt-assessment', element => element.textContent), /payment API work/);
      assert.equal(await page.$eval('.qt-assessment-score', element => element.getAttribute('aria-label')), '8 out of 10');
      assert.equal(await page.$$eval('.qt-assessment-meter i.on', bars => bars.length), 8);
      assert.deepEqual(await page.$$eval('.qt-assessment-summary .qt-tech', marks => marks.map(mark => `${mark.textContent}:${mark.className}`)),
        ['Node.js:qt-tech has', 'Docker:qt-tech missing'], 'technologies are bold, green when the Profile shows them and red when not');
      assert.ok(assessmentRequests.every(request => request.path === '/api/profile/job-assessment' && JSON.stringify(request.body) === JSON.stringify({ jobId: 'job-1' })), 'only the job is sent; the assessment reads the saved Profile independently of the CV');
      assert.match(await page.$eval('.qt-assessment', element => element.textContent), /Based on your saved Profile/);
      assert.equal(createdDocuments, 0, 'the assessment creates no CV');
    }
    if (failure === 'close') {
      await page.screenshot({ path: '/private/tmp/job-agent-quick-tailor-assessment.png', fullPage: true });
      const beforeProfileSave = assessmentRequests.length;
      await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'cv-platform:profile-career-changed', newValue: 'updated-profile' })));
      await page.waitForSelector('.qt-assessment-start button');
      await pause(400);
      assert.equal(assessmentRequests.length, beforeProfileSave, 'a Profile edit clears the old advice without running it again');
    }
    assessedOnOpen = assessmentRequests.length;
    assert.ok(!events.includes('save') && !events.includes('pdf'), 'opening Quick Tailor does not save or generate a PDF');
    assert.equal(await page.evaluate(() => window.testMessages.some(message => message.type === 'CV_PLATFORM_USE_RESUME')), false);
    if (historyMode) {
      const undo = '.qt-history button[aria-label="Undo"]', redo = '.qt-history button[aria-label="Redo"]';
      const reset = '.qt-history button[aria-label="Reset changes"]';
      const summaryText = () => page.$eval(summary, element => element.textContent);
      const disabled = selector => page.$eval(selector, button => button.disabled);
      const shortcut = async (key, shift = false) => {
        await page.click('.qt-job h3');
        await page.keyboard.down('Control');
        if (shift) await page.keyboard.down('Shift');
        await page.keyboard.press(key);
        if (shift) await page.keyboard.up('Shift');
        await page.keyboard.up('Control');
      };
      assert.equal(await disabled(undo), true);
      assert.equal(await disabled(redo), true);
      assert.equal(await disabled(reset), true, 'Reset is disabled before any edit');
      await editText(page, summary, 'Pending edit.', null);
      assert.equal(await disabled(undo), false, 'Undo is available before leaving the edited line');
      assert.equal(await disabled(reset), false, 'Reset is available for text still being edited');
      await page.click(reset);
      assert.equal(await summaryText(), 'Backend engineer.', 'Reset also removes an uncommitted inline edit');
      await page.click(undo);
      assert.equal(await summaryText(), 'Pending edit.', 'Reset itself can be undone');
      await page.click(undo);
      assert.equal(await summaryText(), 'Backend engineer.', 'Undo commits the active line and reverts it once');
      await page.click(redo);
      assert.equal(await summaryText(), 'Pending edit.');
      await page.click(undo);
      await editText(page, summary, 'First edit.');
      await page.click(undo);
      assert.equal(await summaryText(), 'Backend engineer.');
      await page.click(redo);
      assert.equal(await summaryText(), 'First edit.');
      await shortcut('z');
      assert.equal(await summaryText(), 'Backend engineer.');
      await shortcut('z', true);
      assert.equal(await summaryText(), 'First edit.');
      await shortcut('z'); await shortcut('y');
      assert.equal(await summaryText(), 'First edit.');

      const skill = '[data-section="skills"] .pro-skill [contenteditable="true"]';
      await editText(page, skill, 'TypeScript');
      await page.click(undo);
      assert.equal(await page.$eval(skill, element => element.textContent), 'Node.js');
      await page.click(redo);
      assert.equal(await page.$eval(skill, element => element.textContent), 'TypeScript');
      const school = '[data-section="education"] [aria-label="Institution"]';
      await editText(page, school, 'History University');
      await page.click(undo);
      assert.equal(await page.$eval(school, element => element.textContent), 'Original University');
      await page.click(redo);
      assert.equal(await page.$eval(school, element => element.textContent), 'History University');
      await editBulletControls(page, true);
      await page.waitForSelector('.qt-add-skill');
      await page.click('.qt-add-skill');
      assert.ok((await page.$eval('[data-section="skills"]', element => element.textContent)).includes('Docker'));
      await page.click(undo);
      assert.ok(!(await page.$eval('[data-section="skills"]', element => element.textContent)).includes('Docker'));
      await page.click(redo);
      assert.ok((await page.$eval('[data-section="skills"]', element => element.textContent)).includes('Docker'));

      const asked = aiRequests.length;
      await page.click('[title="Tailor the summary for the job"]');
      await page.waitForSelector('.qt-unit .qt-screen');
      // The card opens as a window onto the line: the CV's own text shows through it.
      const lined = await page.evaluate(() => {
        const pane = document.querySelector('.qt-unit .qt-window').getBoundingClientRect();
        const line = document.querySelector('[data-section="summary"] .doc-summary').getBoundingClientRect();
        return Math.abs(pane.top + 4 - line.top) <= 1 && Math.abs(pane.bottom - 4 - line.bottom) <= 1 && pane.left <= line.left && pane.right >= line.right;
      });
      assert.ok(lined, 'the window sits exactly over the CV line');
      assert.equal(await page.$eval('.qt-unit', card => getComputedStyle(card).backgroundColor), 'rgba(0, 0, 0, 0)', 'the window is see-through');
      await pause(200);
      assert.equal(aiRequests.length, asked, 'pressing ✦ opens the screen; nothing is generated before Generate');
      await page.type('.qt-request textarea', 'Make it shorter');
      await page.click('.qt-unit .qt-generate');
      assert.ok(await page.$('.qt-unit .qt-screen.is-busy > .qt-window'), 'the window pulses while the AI writes');
      await page.screenshot({ path: '/private/tmp/job-agent-qt-summary-writing.png' });
      await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
      assert.equal(aiRequests.length, asked + 1);
      assert.equal(aiRequests.at(-1).instruction, 'Make it shorter', 'the request typed under the screen goes to the AI');
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-actions button')].find(button => button.textContent === 'Try again').click());
      await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
      assert.equal(aiRequests.length, asked + 2, 'Try again writes another version');
      await pause(400); // The line types itself in.
      // The new version shows as a change: the old words red and crossed out, the new ones green.
      assert.deepEqual(await page.$$eval('.qt-unit .qt-change .qt-del', parts => parts.map(part => part.textContent).join('')), 'First edit');
      assert.equal(await page.$$eval('.qt-unit .qt-change .qt-add', parts => parts.map(part => part.textContent).join('')), 'Built services for Acme');
      assert.equal(await page.$eval('.qt-unit .qt-change', element => element.textContent), 'First edit Built services for Acme.');
      assert.equal(await page.$eval('.qt-unit .qt-change b', element => element.textContent.trim()), 'Acme', 'with its bold');
      const report = await page.$eval('.qt-unit', element => element.innerText);
      for (const part of ['Still fails 1 check', 'Word count: 4 words', 'Deciding gap: Node.js', 'How it answers the posting'])
        assert.ok(report.includes(part), `the summary card shows: ${part}`);
      assert.deepEqual(await page.$$eval('.qt-unit .qt-menu > .qt-actions button', buttons => buttons.map(button => button.textContent)), ['Use this', 'Try again', 'Dismiss']);
      await page.$eval('.qt-card', card => { card.scrollTop = card.scrollHeight; });
      await pause(50);
      assert.ok(await page.$eval('.qt-card', card => {
        const bar = card.querySelector('.qt-menu > .qt-actions').getBoundingClientRect(), box = card.getBoundingClientRect();
        return bar.top >= box.top - 1 && bar.bottom <= box.bottom;
      }), 'Use this, Try again and Dismiss stay at the top of the card while it scrolls');
      await page.$eval('.qt-card', card => { card.scrollTop = 0; });
      await page.screenshot({ path: '/private/tmp/job-agent-qt-card.png' });
      {
        // At the card's end, the wheel over the card does not scroll the CV behind it.
        const box = await page.$eval('.qt-card', card => { const r = card.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        const pageBefore = await page.$eval('.qt-canvas', canvas => canvas.scrollTop);
        await page.mouse.move(box.x, box.y);
        await page.mouse.wheel({ deltaY: 600 });
        await pause(250);
        assert.equal(await page.$eval('.qt-canvas', canvas => canvas.scrollTop), pageBefore, 'scrolling past the card end leaves the page still');
        await page.mouse.wheel({ deltaY: -600 });
        await pause(250);
        assert.equal(await page.$eval('.qt-canvas', canvas => canvas.scrollTop), pageBefore, 'and so does scrolling past its top');
        const canvasRoom = await page.$eval('.qt-canvas', canvas => canvas.scrollHeight - canvas.clientHeight);
        if (canvasRoom > 0) {
          await page.mouse.move(box.x, 860);
          await page.mouse.wheel({ deltaY: 200 });
          await pause(250);
          assert.notEqual(await page.$eval('.qt-canvas', canvas => canvas.scrollTop), pageBefore, 'away from the card the page scrolls as usual');
          await page.$eval('.qt-canvas', (canvas, top) => { canvas.scrollTop = top; }, pageBefore);
        }
      }
      await page.click('.qt-unit .qt-actions .primary');
      assert.equal(await summaryText(), 'Built services for Acme.', 'the summary goes in with its bold');
      await page.click(undo);
      assert.equal(await summaryText(), 'First edit.');
      await page.click(redo);
      assert.equal(await summaryText(), 'Built services for Acme.');
      // A job's bullets: while the AI writes, the card stays where it opened.
      {
        await page.click('[title^="Tailor Backend Engineer at Acme Labs"]');
        await page.waitForSelector('.qt-unit .qt-generate');
        const opened = await page.$eval('.qt-unit', card => Math.round(card.getBoundingClientRect().top));
        await page.click('.qt-unit .qt-generate');
        setTimeout(() => void page.screenshot({ path: '/private/tmp/job-agent-qt-writing.png' }).catch(() => {}), 900);
        const tops = [], lines = [], menus = [];
        for (let i = 0; i < 90; i++) {
          tops.push(await page.$eval('.qt-unit', card => Math.round(card.getBoundingClientRect().top)).catch(() => null));
          menus.push(await page.$eval('.qt-unit .qt-menu', menu => Math.round(menu.getBoundingClientRect().top)).catch(() => null));
          lines.push(await page.evaluate(() => Math.round(document.querySelector('[data-section="experience"] article').getBoundingClientRect().top)));
          await pause(30);
        }
        const moves = menus.filter((top, index) => index && top !== null && menus[index - 1] !== null && top !== menus[index - 1]).length;
        console.log('CARD TOPS', opened, JSON.stringify([...new Set(tops)]), 'LINE TOPS', JSON.stringify([...new Set(lines)]), 'MENU MOVES', moves, JSON.stringify(menus.filter((top, index) => top !== menus[index - 1])));
        assert.deepEqual([...new Set(tops.filter(top => top !== null))], [opened], 'the card stays where it opened while the bullets are written');
        // The job's lines, as the CV draws them: each change in its place, with its own buttons.
        const lineCount = await page.$$eval('.qt-unit .qt-slot', rows => rows.length);
        assert.equal(lineCount, 2, 'both bullets are shown in the job');
        assert.match(await page.$eval('.qt-unit .qt-screen-body', body => body.textContent), /Acme Labs/, 'with the job\'s own title line');
        await page.waitForFunction(() => document.querySelectorAll('.qt-unit .qt-slot .qt-actions .primary:not([disabled])').length === 2);
        await pause(1500); // The changes type themselves in.
        assert.match(await page.$eval('.qt-unit .qt-slot', slot => slot.textContent), /Rewritten for the job/);
        assert.ok(await page.$('.qt-unit .qt-slot .qt-add'), 'what was put in is marked');
        const bulletsBefore = await page.$$eval('.qt-zoom [data-section="experience"] article:first-of-type li .pro-text', rows => rows.map(row => row.textContent));
        await page.evaluate(() => document.querySelectorAll('.qt-unit .qt-slot')[1].querySelector('.qt-actions .primary').click());
        const bulletsAfter = await page.$$eval('.qt-zoom [data-section="experience"] article:first-of-type li .pro-text', rows => rows.map(row => row.textContent));
        assert.equal(bulletsAfter[0], bulletsBefore[0], 'the other bullet is not touched');
        assert.match(bulletsAfter[1], /Rewritten for the job/, 'Use puts in only that line');
        assert.match(await page.$$eval('.qt-unit .qt-slot', slots => slots[1].textContent), /✓ Used/);
        await page.click(undo);
        assert.ok(moves <= lineCount, `the menu moves at most once per line as it arrives (${moves} moves, ${lineCount} lines), never while text types in`);
        await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-menu > .qt-actions button')].find(button => button.textContent === 'Close')?.click());
      }

      // The second job's "Tech stack:" bullet is its tech stack line, tailored as a list.
      {
        const other = '[data-section="experience"] article:nth-of-type(2)';
        assert.match(await page.$eval(`${other} .doc-role-stack`, element => element.textContent), /Tech stack:\s*Go, Redis/);
        assert.ok(!(await page.$$eval(`${other} li[data-edit-item="bullet"]`, rows => rows.map(row => row.textContent))).some(text => /Tech stack/.test(text)), 'no longer a bullet');
        await page.hover(`${other} .doc-role-stack`);
        await page.click(`${other} .doc-role-stack [title="Tailor the tech stack for the job"]`);
        await page.waitForSelector('.qt-unit .qt-generate');
        assert.match(await page.$eval('.qt-unit .qt-screen-title', element => element.textContent), /Tech stack/);
        await page.click('.qt-unit .qt-generate');
        await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
        const sent = aiRequests.at(-1);
        assert.equal(sent.kind, 'techStack');
        assert.match(sent.context, /Maintained internal tooling\./, "the job's own lines go with it");
        await page.click('.qt-unit .qt-actions .primary');
        assert.match(await page.$eval(`${other} .doc-role-stack`, element => element.textContent), /Tech stack:\s*Redis, Go/);
        await page.click(undo);
        assert.match(await page.$eval(`${other} .doc-role-stack`, element => element.textContent), /Tech stack:\s*Go, Redis/);
      }

      // Every skills line at once: the same screen over the section, one row per line.
      const beforeSkills = aiRequests.length;
      await page.click('[title="Tailor every skills line for the job"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await pause(150);
      assert.equal(aiRequests.length, beforeSkills, 'nothing is generated before Generate');
      assert.ok(await page.$('.qt-unit .qt-window'), 'the section shows through the window');
      await page.click('.qt-unit .qt-generate');
      await page.waitForSelector('.qt-unit .qt-screen-line .qt-actions .primary');
      assert.ok((await page.$$('.qt-unit .qt-screen-line')).length >= 2, 'each skills line is a row of the screen');
      await pause(500);
      assert.match(await page.$eval('.qt-unit .qt-screen', element => element.innerText), /Kubernetes/);
      await page.screenshot({ path: '/private/tmp/job-agent-qt-skills.png' });
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-menu > .qt-actions button')].find(button => button.textContent === 'Close').click());
      assert.equal(await page.$('.qt-card'), null);

      await page.click('[title="Tailor the summary for the job"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await page.click('.qt-unit .qt-generate');
      await page.waitForSelector('.qt-unit .qt-screen.is-busy');
      await page.click(undo);
      await pause(200);
      assert.equal(await page.$('.qt-card'), null, 'Undo dismisses suggestions and ignores late responses');
      assert.equal(await summaryText(), 'First edit.');
      await editText(page, summary, 'Final branch.');
      assert.equal(await disabled(redo), true, 'a new edit replaces the redo path');
      assert.ok(!events.includes('save') && !events.includes('pdf'), 'Undo/Redo and AI acceptance do not save or print');
      assert.equal(createdDocuments, 0);

      const beforeReset = [...events];
      await page.click(reset);
      assert.equal(await summaryText(), 'Backend engineer.');
      assert.equal(await page.$eval(skill, element => element.textContent), 'Node.js');
      assert.equal(await page.$eval(school, element => element.textContent), 'Original University');
      assert.ok(!(await page.$eval('[data-section="skills"]', element => element.textContent)).includes('Docker'));
      assert.equal(await disabled(reset), true);
      assert.deepEqual(events, beforeReset, 'Reset never saves or creates a PDF');
      await page.click(undo);
      assert.equal(await summaryText(), 'Final branch.');
      assert.equal(await page.$eval(skill, element => element.textContent), 'TypeScript');
      await page.click(redo);
      assert.equal(await summaryText(), 'Backend engineer.');
      await page.click(undo);

      await page.screenshot({ path: '/private/tmp/job-agent-tailoring-history.png' });
      await page.setViewport({ width: 680, height: 880 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'history controls fit a narrow popup');
      await page.setViewport({ width: 1180, height: 880 });
      await page.click('.studio-actions button.primary');
      assert.equal(await disabled(undo), true, 'history is locked while saving');
      assert.equal(await disabled(redo), true);
      assert.equal(await disabled(reset), true, 'Reset is locked while saving');
      await page.waitForFunction(() => document.querySelector('.studio-status')?.textContent === 'CV and PDF saved');
      const savedEvents = [...events];
      await page.click(undo);
      assert.equal(await summaryText(), 'First edit.');
      assert.equal(await page.$('a[href$="/pdf?download=1"]'), null, 'an undone saved CV needs Save before exporting');
      await page.click(redo);
      assert.equal(await summaryText(), 'Final branch.');
      assert.ok(await page.$('a[href$="/pdf?download=1"]'), 'Redo to the saved state restores its PDF');
      assert.deepEqual(events, savedEvents, 'moving through saved history never writes');
      await page.click(undo);
      await page.click('.studio-actions button.primary');
      await page.waitForFunction(() => document.querySelector('.studio-status')?.textContent === 'CV and PDF saved');
      assert.equal(resume.summaries.default, 'First edit.');
      assert.equal(createdDocuments, 1, 'saving an earlier edit reuses the same CV');
      assert.equal(await disabled(redo), false, 'Save preserves the redo path');
      assert.equal(source.summaries.default, 'Backend engineer.');
      assert.equal(source.skills[0].name, 'Node.js');
      const beforeSavedReset = [...events];
      await page.click(reset);
      assert.equal(await summaryText(), 'Backend engineer.', 'Reset still returns to the opening state after Save');
      assert.equal(await page.$('a[href$="/pdf?download=1"]'), null, 'saved changes must be saved again after Reset');
      assert.deepEqual(events, beforeSavedReset);
      assert.equal(resume.summaries.default, 'First edit.', 'Reset changes only the local draft');
      await page.click('.studio-actions button.primary');
      await page.waitForFunction(() => document.querySelector('.studio-status')?.textContent === 'CV and PDF saved');
      assert.equal(resume.summaries.default, 'Backend engineer.');
      assert.equal(resume.skills[0].name, 'Node.js');
      assert.equal(resume.educations[0].institution, 'Original University');
      assert.equal(createdDocuments, 1, 'saving Reset updates the same CV');
      assert.deepEqual(errors, []);
      console.log('PASS Quick Tailor history and Reset: inline edits, AI, keyboard, Save and PDF state');
      return;
    }
    await page.$eval(summary, element => { element.focus(); element.textContent = 'Edited for Acme.'; element.blur(); });
    if (!failure) { await editBulletControls(page, !fullEditor); await editInlineSections(page); }
    await pause(fullEditor ? 2300 : 1800);
    if (fullEditor) {
      assert.ok(!events.includes('pdf'), 'full-editor autosaves do not create PDFs');
      await page.click('.studio-export');
      for (let attempt = 0; attempt < 100 && !events.includes('download'); attempt++) await pause(50);
      assert.deepEqual(events.slice(-4), ['save', 'theme', 'pdf', 'download'], 'Save & export persists content and layout before making the PDF');
      assert.deepEqual(errors, []);
      assertInlineChanges(resume, source);
      await checkPrint();
      console.log('PASS full editor Save & export PDF');
      return;
    }
    assert.ok(!events.includes('save') && !events.includes('pdf'), 'editing never triggers autosave or PDF generation');
    assert.equal(createdDocuments, 0, 'editing creates no document');
    if (failure === 'close') {
      await page.close();
      assert.equal(createdDocuments, 0, 'closing an unsaved draft creates no document');
      assert.ok(!events.includes('save') && !events.includes('pdf'));
      console.log('PASS closing Quick Tailor without Save creates nothing');
      return;
    }
    assert.equal(await page.$eval('.studio-actions button[title="Click Save to create the PDF first."]', button => button.disabled), true, 'Export is disabled before Save');
    await page.click('.studio-actions button.primary');

    if (failure) {
      await page.waitForSelector('.studio-held.bad');
      assert.match(await page.$eval('.studio-held.bad', element => element.textContent), failure === 'cv' ? /CV could not be saved/ : /CV saved, but the PDF could not be created/);
      assert.deepEqual(events.filter(event => !['preview', 'copy'].includes(event)), failure === 'cv' ? ['save'] : ['save', 'pdf']);
      assert.equal(createdDocuments, failure === 'cv' ? 0 : 1);
      assert.equal(await page.evaluate(() => window.testMessages.some(message => message.type === 'CV_PLATFORM_USE_RESUME')), false, 'failed saves never select the CV in the extension');
      assert.equal(await page.$('a[href$="/pdf?download=1"]'), null, 'failed saves never enable export');
      await page.click('.qt-history button[aria-label="Undo"]');
      assert.equal(await page.$eval(summary, element => element.textContent), 'Backend engineer.');
      await page.click('.qt-history button[aria-label="Redo"]');
      assert.equal(await page.$eval(summary, element => element.textContent), 'Edited for Acme.', 'failed saves keep edit history');
      fail = null;
      await page.click('.studio-held.bad button');
    }

    await page.waitForFunction(() => document.querySelector('.studio-status')?.textContent === 'CV and PDF saved');
    await page.waitForFunction(() => window.testMessages.some(message => message.type === 'CV_PLATFORM_USE_RESUME' && message.resumeId === 'copy-1'));
    assert.equal(resume.summaries.default, 'Edited for Acme.');
    if (!failure) { assertInlineChanges(resume, source); await checkPrint(); }
    assert.equal(source.summaries.default, 'Backend engineer.', 'the source CV remains unchanged');
    assert.equal(createdDocuments, 1, 'only Save creates exactly one document, including after a retry');
    assert.ok(await page.$('a[href$="/pdf?download=1"]'), 'export is enabled only after the PDF is ready');
    assert.deepEqual(events.slice(-2), ['save', 'pdf']);
    assert.deepEqual(errors, []);
    console.log(`PASS Quick Tailor Save (${failure ? `${failure} failure and retry` : 'success'})`);
  } finally {
    if (!fullEditor && assessedOnOpen) assert.equal(assessmentRequests.length, assessedOnOpen, 'editing, history, Reset and Save do not change the Profile assessment');
    if (!page.isClosed()) await page.close();
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'),
    headless: true,
  });
  try {
    if (process.argv.includes('--history')) await check(browser, null, false, true);
    else {
      for (const failure of ['close', null, 'cv', 'pdf']) await check(browser, failure);
      await check(browser, null, false, true);
      await check(browser, null, true);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
