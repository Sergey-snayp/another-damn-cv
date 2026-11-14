const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// The tailoring card of Quick Tailor only (the ✦ card over a line, a job, a section),
// in one page load. Saving, PDF, history, Reset and the assessment are in quick-tailor-save.cjs.
// Run against the local Vite server. All API responses are synthetic.
const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function check(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 880 });
  const errors = [], aiRequests = [], roleRequests = [];
  // When set, the Profile has more achievements for Acme Labs (see tailor-role).
  let profileChoice = false;
  // How many bullets the posting gives Acme Labs when the whole job is tailored.
  let roleCount = 2;
  const source = {
    snapshot: 1, contact: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
    summaries: { default: 'Backend engineer.' }, experiences: [
      { lineageId: 'role-1', company: 'Acme Labs', client: 'SymphonyAI', title: 'Backend Engineer', from: '2020', current: true, achievements: [
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
    ],
    skills: [
      { lineageId: 'skill-1', name: 'Node.js', category: 'Backend', weight: 4, aliases: ['Node'] },
      { lineageId: 'skill-2', name: 'Python', category: 'Backend' },
      { lineageId: 'skill-3', name: 'AWS', category: 'Cloud' },
    ],
    projects: [{ lineageId: 'project-1', name: 'Side project', bullets: ['Built a dashboard.', 'Added monitoring.'] }],
    certifications: [], customSections: [{ lineageId: 'custom-1', title: 'Community', bullets: ['Mentored developers.', 'Organised meetups.'] }],
  };
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    void (async () => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return request.continue();
      const reply = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (pathname === '/api/auth/me') return reply({ id: 'test-user', name: 'Sam Lee', email: 'sam@example.com', avatarUrl: null });
      if (pathname === '/api/jobs/job-1/quick-tailor' && request.method() === 'GET')
        return reply({ resumeId: null, sourceResumeId: 'source', name: 'Sam_Lee_CV_Acme_Engineer', document: source, theme: null });
      if (pathname.endsWith('/theme')) return reply({ theme: null });
      if (pathname === '/api/jobs') return reply([]);
      if (pathname === '/api/jobs/job-1') return reply({ id: 'job-1', title: 'Engineer', company: 'Acme', description: 'Build Node.js services.' });
      if (pathname.endsWith('/score')) return reply({ score: 50, keywords: { matched: ['Node.js', 'TypeScript'], missing: ['Docker'], skillsOnly: ['TypeScript'] }, issues: [], job: { id: 'job-1', title: 'Engineer', company: 'Acme' } });
      if (pathname.endsWith('/tailor-summary/stream')) {
        aiRequests.push(JSON.parse(request.postData() || '{}')); await pause(150);
        // The summary as it is written, the fix announced, then the checked result: one JSON object per line.
        const lines = [
          { type: 'draft', summary: 'Built services for **Ac' },
          { type: 'draft', summary: 'Built services for **Acme**.' },
          { type: 'fixing', failed: ['Word count'] },
          { type: 'done', original: '', summary: 'Built services for **Acme**.', wordCount: 4, gaps: ['Node.js'], decidingGap: 'Node.js', failedChecks: [{ id: 'word-count', name: 'Word count', ok: false, detail: '4 words; it must be 80 to 120.' }], attempts: 3 },
        ];
        return request.respond({ status: 200, contentType: 'application/x-ndjson', body: lines.map(line => JSON.stringify(line)).join('\n') + '\n' });
      }
      if (pathname.endsWith('/tailor-skills')) {
        const body = JSON.parse(request.postData() || '{}');
        await pause(150);
        return reply({ groups: body.groups.map(group => ({ category: group.category, skills: [...new Set([...group.skills, 'Kubernetes'])], added: ['Kubernetes'], dropped: [] })), cannotDo: [] });
      }
      if (pathname.endsWith('/tailor-role')) {
        const body = JSON.parse(request.postData() || '{}');
        roleRequests.push(body);
        await pause(200);
        if (!profileChoice) return reply({ matched: false, profileRole: null, chosen: [], alternates: [] });
        if (body.role.bullets.length === 1) {
          const other = body.role.company === 'Other Co';
          return reply({
            matched: true, profileRole: null,
            chosen: [{ id: 'pf3', text: other ? 'Maintained Go tooling.' : 'Built React Native screens with Expo Router.', original: 'Role notes.', source: 'profile', cvIndex: null }],
            alternates: [{ id: 'r1b1', text: other ? 'Built Redis operational tooling.' : 'Implemented offline persistence with AsyncStorage.', original: 'Saved CV bullet.', source: 'saved-cv', cvIndex: null }],
          });
        }
        return reply({
          matched: true,
          profileRole: { title: 'Backend Engineer', company: 'Acme Labs' },
          chosen: [
            { id: 'p4', text: 'Cut checkout latency by 30% with Redis caching.', original: 'Cut checkout latency by 30% with Redis caching.', source: 'profile', cvIndex: null, starred: true },
            { id: 'c1', text: 'Built Node.js payment APIs.', original: body.role.bullets[0], source: 'cv', cvIndex: 0, starred: false },
            { id: 'p6', text: 'Ran the payments on-call rotation for 2 years.', original: 'Ran the payments on-call rotation for 2 years.', source: 'profile', cvIndex: null, starred: false },
          ].slice(roleCount === 1 ? 1 : 0, roleCount === 1 ? 2 : roleCount),
          // (roleCount 0: the posting does not need this job's bullets.)
          alternates: [
            { id: 'p5', text: 'Mentored two engineers on code review.', original: 'Mentored two engineers on code review.', source: 'profile', cvIndex: null, starred: false },
          ],
        });
      }
      if (pathname.endsWith('/tailor-line')) {
        const body = JSON.parse(request.postData() || '{}');
        aiRequests.push(body);
        // A bullet is sent with its job's other lines, so the rewrite does not repeat them.
        if (body.kind === 'bullet' && /Acme Labs|Other Co/.test(body.context || '')) {
          assert.ok(Array.isArray(body.others), 'a bullet comes with its neighbours');
          assert.ok(!body.others.includes(body.text), 'but never with itself');
        }
        if (body.kind === 'techStack') {
          await pause(150);
          return reply({ original: body.text, suggestion: 'Redis, Go', cannotDo: [] });
        }
        // Bullets of a job arrive one by one and are long, as the real AI's are.
        if (body.kind === 'bullet' && /Acme Labs/.test(body.context || '')) {
          await pause(300 + 500 * aiRequests.length % 1200);
          return reply({ suggestion: `${body.text} Rewritten for the job with reliable services, observability and clear ownership from design through production support for the team.`, cannotDo: [] });
        }
        await pause(150);
        return reply({ suggestion: 'Built services for Acme.', cannotDo: [] });
      }
      return reply({});
    })().catch(error => { errors.push(error.message); void request.abort().catch(() => {}); });
  });

  const done = [];
  try {
    await page.goto(`${appUrl}/popup/jobs/job-1/quick-tailor?from=source`);
    const summary = '[data-section="summary"] [contenteditable="true"]';
    await page.waitForSelector(summary);
    const undo = '.qt-history button[aria-label="Undo"]', redo = '.qt-history button[aria-label="Redo"]';
    // The AI's text types itself into the card; wait until no line is still typing.
    const typedIn = async () => {
      await pause(100);
      await page.waitForFunction(() => !document.querySelector('.qt-unit .qt-typing'), { polling: 50 });
    };
    const summaryText = () => page.$eval(summary, element => element.textContent);
    // Typing is slow in the dev build (every key re-renders the CV), so the text is set at once.
    await page.$eval(summary, element => { element.focus(); element.textContent = 'First edit.'; element.blur(); });
    assert.equal(await summaryText(), 'First edit.');

    // One line: the summary card.
    {
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
      await page.$eval('.qt-request textarea', box => {
        box.focus();
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, 'Make it shorter');
        box.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.click('.qt-unit .qt-generate');
      assert.ok(await page.$('.qt-unit .qt-screen.is-busy > .qt-window'), 'the window pulses while the AI writes');
      await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
      assert.equal(aiRequests.length, asked + 1);
      assert.equal(aiRequests.at(-1).instruction, 'Make it shorter', 'the request typed under the screen goes to the AI');
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-actions button')].find(button => button.textContent === 'Try again').click());
      await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
      assert.equal(aiRequests.length, asked + 2, 'Try again writes another version');
      await pause(100); // Shown as it was written: the change is drawn at once, not typed in again.
      // The new version shows as a change: the old words red and crossed out, the new ones green.
      assert.deepEqual(await page.$$eval('.qt-unit .qt-change .qt-del', parts => parts.map(part => part.textContent).join('')), 'First edit');
      assert.equal(await page.$$eval('.qt-unit .qt-change .qt-add', parts => parts.map(part => part.textContent).join('')), 'Built services for Acme');
      assert.equal(await page.$eval('.qt-unit .qt-change', element => element.textContent), 'First edit Built services for Acme.');
      assert.equal(await page.$eval('.qt-unit .qt-change b', element => element.textContent.trim()), 'Acme', 'with its bold');
      const report = await page.$eval('.qt-unit', element => element.innerText);
      for (const part of ['Still fails 1 check', 'Word count: 4 words', 'Deciding gap: Node.js', 'Gaps'])
        assert.ok(report.toLowerCase().includes(part.toLowerCase()), `the summary card shows: ${part}`);
      assert.deepEqual(await page.$$eval('.qt-unit .qt-menu > .qt-actions button', buttons => buttons.map(button => button.textContent || button.getAttribute('aria-label'))), ['Use this', 'Try again', 'Close'], 'no Dismiss: the × at the row\'s end closes it');
      await page.$eval('.qt-card', card => { card.scrollTop = card.scrollHeight; });
      await pause(50);
      assert.ok(await page.$eval('.qt-card', card => {
        const bar = card.querySelector('.qt-menu > .qt-actions').getBoundingClientRect(), box = card.getBoundingClientRect();
        return bar.top >= box.top - 1 && bar.bottom <= box.bottom;
      }), 'Use this and Try again stay at the top of the card while it scrolls');
      await page.$eval('.qt-card', card => { card.scrollTop = 0; });
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
      assert.equal(await summaryText(), 'First edit.', 'Undo takes a used change back');
      await page.click(redo);
      assert.equal(await summaryText(), 'Built services for Acme.');
      done.push('line');
    }

    // A job's bullets, line by line: while the AI writes, the card stays where it opened.
    {
      await page.click('[title^="Tailor Backend Engineer at Acme Labs"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      const opened = await page.$eval('.qt-unit', card => Math.round(card.getBoundingClientRect().top));
      await page.click('.qt-unit .qt-generate');
      // Sampled in the page every 30 ms for 2.7 s, while the bullets arrive.
      const { tops, menus } = await page.evaluate(() => new Promise(resolve => {
        const tops = [], menus = [];
        const top = selector => { const node = document.querySelector(selector); return node ? Math.round(node.getBoundingClientRect().top) : null; };
        const timer = setInterval(() => {
          tops.push(top('.qt-unit')); menus.push(top('.qt-unit .qt-menu'));
          if (tops.length === 90) { clearInterval(timer); resolve({ tops, menus }); }
        }, 30);
      }));
      const moves = menus.filter((top, index) => index && top !== null && menus[index - 1] !== null && top !== menus[index - 1]).length;
      assert.deepEqual([...new Set(tops.filter(top => top !== null))], [opened], 'the card stays where it opened while the bullets are written');
      // The job's lines, as the CV draws them: each change in its place, with its own buttons.
      const lineCount = await page.$$eval('.qt-unit .qt-slot', rows => rows.length);
      assert.equal(lineCount, 2, 'both bullets are shown in the job');
      assert.match(await page.$eval('.qt-unit .qt-screen-body', body => body.textContent), /Acme Labs/, 'with the job\'s own title line');
      await page.waitForFunction(() => document.querySelectorAll('.qt-unit .qt-slot .qt-actions .primary:not([disabled])').length === 2);
      await typedIn(); // The changes type themselves in.
      assert.match(await page.$eval('.qt-unit .qt-slot', slot => slot.textContent), /Rewritten for the job/);
      assert.ok(await page.$('.qt-unit .qt-slot .qt-add'), 'what was put in is marked');
      const bulletsBefore = await page.$$eval('.qt-zoom [data-section="experience"] article:first-of-type li .pro-text', rows => rows.map(row => row.textContent));
      await page.evaluate(() => document.querySelectorAll('.qt-unit .qt-slot')[1].querySelector('.qt-actions .primary').click());
      const bulletsAfter = await page.$$eval('.qt-zoom [data-section="experience"] article:first-of-type li .pro-text', rows => rows.map(row => row.textContent));
      assert.equal(bulletsAfter[0], bulletsBefore[0], 'the other bullet is not touched');
      assert.match(bulletsAfter[1], /Rewritten for the job/, 'Use puts in only that line');
      assert.match(await page.$$eval('.qt-unit .qt-slot', slots => slots[1].textContent), /✓ Used/);
      await page.click(undo);
      assert.deepEqual(await page.$$eval('.qt-zoom [data-section="experience"] article:first-of-type li .pro-text', rows => rows.map(row => row.textContent)), bulletsBefore, 'Undo takes the used line back');
      assert.ok(moves <= lineCount, `the menu moves at most once per line as it arrives (${moves} moves, ${lineCount} lines), never while text types in`);
      await page.evaluate(() => document.querySelector('.qt-unit .qt-close')?.click());
      done.push('job');
    }

    // With more achievements for the job in the Profile: the bullets are chosen from them.
    {
      assert.ok(roleRequests.length >= 1, 'the job above asked the Profile first');
      const latestRole = roleRequests.at(-1);
      const choicesBefore = roleRequests.length;
      assert.deepEqual(latestRole.role, { company: 'Acme Labs', client: 'SymphonyAI', title: 'Backend Engineer', from: '2020', description: '', techStack: '', bullets: latestRole.role.bullets });
      profileChoice = true;
      const bulletLines = () => aiRequests.filter(body => body.kind === 'bullet').length;
      const linesBefore = bulletLines();
      await page.click('[title^="Tailor Backend Engineer at Acme Labs"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await page.click('.qt-unit .qt-generate');
      await page.waitForFunction(() => document.querySelectorAll('.qt-unit .qt-slot .qt-actions .primary:not([disabled])').length === 2);
      await typedIn(); // The lines type themselves in.
      assert.equal(bulletLines(), linesBefore, 'no bullet is tailored line by line');
      assert.equal(roleRequests.length, choicesBefore + 1);
      const slots = await page.$$eval('.qt-unit .qt-slot', rows => rows.map(row => row.textContent));
      assert.match(slots[0], /Built Node\.js payment APIs\./, 'a CV bullet chosen stays in its own place');
      assert.doesNotMatch(slots[0], /From your Profile/);
      assert.match(slots[1], /Cut checkout latency by 30% with Redis caching\./);
      assert.match(slots[1], /From your Profile/);
      assert.doesNotMatch(slots[1], /For recruiters/, 'a plain line has no recruiter note');
      // A keyword only in the skills list is marked as such.
      assert.deepEqual(
        await page.$$eval('.ra-kw.have', chips => chips.map(chip => chip.textContent)),
        ['✓ Node.js', '✓ TypeScript · skills only'],
      );
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-slot')[1].querySelectorAll('button')].find(button => button.textContent === 'Swap').click());
      await typedIn();
      assert.match(await page.$$eval('.qt-unit .qt-slot', rows => rows[1].textContent), /Mentored two engineers on code review\./, 'Swap brings the next best');
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-menu > .qt-actions button')].find(button => button.textContent.startsWith('Use all')).click());
      const roleBullets = await page.$$eval('.qt-zoom [data-section="experience"] article:first-of-type li .pro-text', rows => rows.map(row => row.textContent));
      assert.deepEqual(roleBullets.slice(0, 2), ['Built Node.js payment APIs.', 'Mentored two engineers on code review.']);
      await page.click(undo);
      done.push('Swap');

      // The posting decides how many: a job may gain a bullet, or lose one.
      const first = '.qt-zoom [data-section="experience"] article:first-of-type';
      const listed = () => page.$$eval(`${first} li .pro-text`, rows => rows.map(row => row.textContent));
      const bulletsBefore = await listed();
      roleCount = 3;
      await page.click('[title^="Tailor Backend Engineer at Acme Labs"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      // Before Generate: one button, no Dismiss, and no empty band before "What should change?".
      assert.deepEqual(await page.$$eval('.qt-unit .qt-menu > .qt-actions button', buttons => buttons.map(button => button.textContent.trim() || button.getAttribute('aria-label'))), ['Generate', 'Close']);
      assert.ok(await page.evaluate(() => {
        const actions = document.querySelector('.qt-unit .qt-menu > .qt-actions').getBoundingClientRect();
        const request = document.querySelector('.qt-unit .qt-request').getBoundingClientRect();
        return request.top - actions.bottom <= 16;
      }), 'the request follows the buttons with no empty band');
      // No line of its own for the title or the ×: the × ends the buttons' row. Icons are centred.
      assert.equal(await page.$('.qt-unit .qt-screen-label'), null, 'no "N lines · for …" line above the lines');
      assert.equal(await page.$eval('.qt-unit .qt-menu > .qt-actions', row => row.lastElementChild?.getAttribute('aria-label')), 'Close');
      const offCentre = await page.evaluate(() => ['.qt-unit .qt-close', '.qt-unit .qt-generate .ai-badge'].map(selector => {
        const box = document.querySelector(selector).getBoundingClientRect(), icon = document.querySelector(`${selector} svg`).getBoundingClientRect();
        return Math.max(Math.abs(box.left + box.width / 2 - (icon.left + icon.width / 2)), Math.abs(box.top + box.height / 2 - (icon.top + icon.height / 2)));
      }));
      assert.ok(offCentre.every(gap => gap <= 1), `the × and the wand sit in the middle of their buttons (off by ${offCentre.join(', ')}px)`);
      await page.click('.qt-unit .qt-generate');
      await page.waitForFunction(() => document.querySelectorAll('.qt-unit .qt-slot .qt-actions .primary:not([disabled])').length === 3);
      assert.equal(roleRequests.at(-1).position, 0, 'the whole job says where it is on the CV');
      await typedIn();
      const more = await page.$$eval('.qt-unit .qt-slot', rows => rows.map(row => row.textContent));
      assert.match(more[2], /Ran the payments on-call rotation for 2 years\..*New bullet for this job/);
      assert.doesNotMatch(more.join(' '), /\d+ words|Action verb|Metric|Keywords/, 'no score chips under the bullets: the review asks for decisions');
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-slot')[2].querySelectorAll('button')].some(button => button.textContent === 'Add')));
      for (const index of [0, 1]) {
        const buttons = await page.evaluate(i => [...document.querySelectorAll('.qt-unit .qt-slot')[i].querySelectorAll('button')].map(button => button.textContent), index);
        for (const name of ['Use', 'Skip', 'Swap', 'Try again']) assert.ok(buttons.includes(name), `line ${index + 1} has ${name} (${buttons.join(', ')})`);
      }
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-menu > .qt-actions button')].some(button => button.textContent.trim() === 'Use all 3')), 'Use all counts the lines');
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-menu > .qt-actions button')].find(button => button.textContent.startsWith('Use all')).click());
      assert.deepEqual(await listed(), ['Built Node.js payment APIs.', 'Cut checkout latency by 30% with Redis caching.', 'Ran the payments on-call rotation for 2 years.'], 'the new bullet goes after the job\'s last one');
      await page.click(undo);
      assert.deepEqual(await listed(), bulletsBefore);
      done.push('whole job', 'Add', 'Use all');

      roleCount = 1;
      await page.click('[title^="Tailor Backend Engineer at Acme Labs"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await page.click('.qt-unit .qt-generate');
      await page.waitForFunction(() => document.querySelectorAll('.qt-unit .qt-slot .qt-actions .primary:not([disabled])').length === 2);
      await typedIn();
      const fewer = await page.$$eval('.qt-unit .qt-slot', rows => rows.map(row => row.textContent));
      assert.match(fewer[1], /Not needed for this job/);
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-slot')[1].querySelectorAll('button')].some(button => button.textContent === 'Swap')), 'Swap keeps a bullet in its place');
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-slot')[1].querySelectorAll('button')].find(button => button.textContent === 'Remove').click());
      assert.deepEqual(await listed(), [bulletsBefore[0]], 'Remove takes the bullet off, the others stay');
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-slot')[0].querySelectorAll('button')].find(button => button.textContent === 'Use').click());
      assert.deepEqual(await listed(), ['Built Node.js payment APIs.'], 'the line before it is still found after the removal');
      await page.click(undo);
      await page.click(undo);
      assert.deepEqual(await listed(), bulletsBefore);
      // None needed: every bullet of the job is offered for removal.
      roleCount = 0;
      await page.click('[title^="Tailor Backend Engineer at Acme Labs"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await page.click('.qt-unit .qt-generate');
      await page.waitForFunction(() => document.querySelectorAll('.qt-unit .qt-slot .qt-actions .primary:not([disabled])').length === 2);
      assert.deepEqual(await page.$$eval('.qt-unit .qt-slot .qt-actions .primary', buttons => buttons.map(button => button.textContent)), ['Remove', 'Remove']);
      // "Use all" never removes a bullet: each removal is its own click.
      const before = await listed();
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-menu > .qt-actions button')].find(button => button.textContent.startsWith('Use all'))?.disabled), true, 'with only removals, Use all has nothing to use');
      assert.deepEqual(await listed(), before);
      await page.evaluate(() => document.querySelector('.qt-unit .qt-close').click());
      roleCount = 2;
      profileChoice = false;
      done.push('Remove');
    }

    // One bullet and Try again use the same full-role evidence, with source labels.
    {
      profileChoice = true;
      const before = roleRequests.length, linesBefore = aiRequests.length;
      const first = '.qt-zoom [data-section="experience"] article:first-of-type';
      const bulletsBefore = await page.$$eval(`${first} li .pro-text`, rows => rows.map(row => row.textContent));
      await page.hover(`${first} li:first-of-type`);
      await page.click(`${first} li:first-of-type [title="Tailor this bullet for the job"]`);
      await page.waitForSelector('.qt-unit .qt-generate');
      assert.equal(roleRequests.length, before, 'opening the menu makes no generation request');
      await page.click('.qt-unit .qt-generate');
      await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
      assert.equal(roleRequests.length, before + 1);
      assert.equal(roleRequests.at(-1).role.client, 'SymphonyAI');
      assert.deepEqual(roleRequests.at(-1).role.bullets, [bulletsBefore[0]]);
      assert.match(await page.$eval('.qt-unit', card => card.textContent), /From your Profile/);
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-actions button')].find(button => button.textContent === 'Try again').click());
      await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
      assert.equal(roleRequests.length, before + 2, 'Try again also reads Profile and CV evidence');
      assert.equal(aiRequests.length, linesBefore, 'neither request falls back to the CV-only line rewriter');
      await page.evaluate(() => [...document.querySelectorAll('.qt-unit .qt-actions button')].find(button => button.textContent === 'Swap').click());
      assert.match(await page.$eval('.qt-unit', card => card.textContent), /From your saved CVs/);
      await page.click('.qt-unit .qt-actions .primary');
      const after = await page.$$eval(`${first} li .pro-text`, rows => rows.map(row => row.textContent));
      assert.equal(after[0], 'Implemented offline persistence with AsyncStorage.');
      assert.equal(after[1], bulletsBefore[1], 'the other bullet stays as written');
      await page.click(undo);
      assert.deepEqual(await page.$$eval(`${first} li .pro-text`, rows => rows.map(row => row.textContent)), bulletsBefore);
      done.push('one bullet');

      // A section request keeps each role and its Swap alternatives separate.
      const groupedBefore = roleRequests.length;
      await page.click('[title="Tailor every job for this job posting"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await page.click('.qt-unit .qt-generate');
      // A whole section is shown in the CV's own text too, each line's change in its own place.
      await page.waitForFunction(() => [...document.querySelectorAll('.qt-unit .qt-slot')].some(slot => /Go tooling\./.test(slot.textContent) && slot.querySelector('.primary:not([disabled])')));
      assert.equal(await page.$('.qt-unit .qt-screen-line'), null, 'no list in another style');
      assert.ok(await page.$eval('.qt-unit .qt-screen-body', body => /Acme Labs/.test(body.textContent) && /Other Co/.test(body.textContent)), 'both jobs as the CV draws them');
      assert.equal(roleRequests.length, groupedBefore + 2);
      assert.deepEqual(roleRequests.slice(groupedBefore).map(body => [body.role.company, body.role.bullets.length]).sort(), [['Acme Labs', 2], ['Other Co', 1]]);
      await page.evaluate(() => {
        const slot = [...document.querySelectorAll('.qt-unit .qt-slot')].find(slot => /Go tooling\./.test(slot.textContent));
        [...slot.querySelectorAll('button')].find(button => button.textContent === 'Swap').click();
      });
      await typedIn();
      const slots = await page.$$eval('.qt-unit .qt-slot', rows => rows.map(row => row.textContent));
      assert.ok(slots.some(text => text.includes('Redis operational') && text.includes('From your saved CVs')));
      assert.ok(slots.some(text => text.includes('30%')));
      assert.ok(!slots.some(text => text.includes('Mentored two engineers')), 'Swap never borrows another role’s alternatives');
      await page.evaluate(() => document.querySelector('.qt-unit .qt-close').click());
      profileChoice = false;
      done.push('experience section');
    }

    // The second job's "Tech stack:" bullet is its tech stack line, tailored as a list,
    // and written "Go | Redis" (the AI's commas too).
    {
      const other = '[data-section="experience"] article:nth-of-type(2)';
      assert.match(await page.$eval(`${other} .doc-role-stack`, element => element.textContent), /Tech stack:\s*Go \| Redis/);
      assert.ok(!(await page.$$eval(`${other} li[data-edit-item="bullet"]`, rows => rows.map(row => row.textContent))).some(text => /Tech stack/.test(text)), 'no longer a bullet');
      await page.hover(`${other} .doc-role-stack`);
      await page.click(`${other} .doc-role-stack [title="Tailor the tech stack for the job"]`);
      await page.waitForSelector('.qt-unit .qt-generate');
      await page.click('.qt-unit .qt-generate');
      await page.waitForSelector('.qt-unit .qt-actions .primary:not([disabled])');
      const sent = aiRequests.at(-1);
      assert.equal(sent.kind, 'techStack');
      assert.match(sent.context, /Maintained internal tooling\./, "the job's own lines go with it");
      await page.click('.qt-unit .qt-actions .primary');
      assert.match(await page.$eval(`${other} .doc-role-stack`, element => element.textContent), /Tech stack:\s*Redis \| Go/);
      await page.click(undo);
      assert.match(await page.$eval(`${other} .doc-role-stack`, element => element.textContent), /Tech stack:\s*Go \| Redis/);
      done.push('tech stack');
    }

    // Every skills line at once: the same screen over the section, one row per line.
    {
      const beforeSkills = aiRequests.length;
      await page.click('[title="Tailor every skills line for the job"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await pause(150);
      assert.equal(aiRequests.length, beforeSkills, 'nothing is generated before Generate');
      assert.ok(await page.$('.qt-unit .qt-window'), 'the section shows through the window');
      await page.click('.qt-unit .qt-generate');
      await page.waitForSelector('.qt-unit .qt-screen-line .qt-actions .primary');
      assert.ok((await page.$$('.qt-unit .qt-screen-line')).length >= 2, 'each skills line is a row of the screen');
      await typedIn();
      assert.match(await page.$eval('.qt-unit .qt-screen', element => element.innerText), /Kubernetes/);
      await page.evaluate(() => document.querySelector('.qt-unit .qt-close').click());
      assert.equal(await page.$('.qt-card'), null);
      done.push('skills');
    }

    // Undo while the AI writes closes the card, and the late answer is ignored.
    {
      await page.click('[title="Tailor the summary for the job"]');
      await page.waitForSelector('.qt-unit .qt-generate');
      await page.click('.qt-unit .qt-generate');
      await page.waitForSelector('.qt-unit .qt-screen.is-busy');
      await page.click(undo);
      await pause(200);
      assert.equal(await page.$('.qt-card'), null, 'Undo dismisses suggestions and ignores late responses');
      assert.equal(await summaryText(), 'First edit.');
      done.push('Undo while writing');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS Quick Tailor card: ${done.join(', ')}`);
  } catch (error) {
    if (done.length) console.error(`Passed before the failure: ${done.join(', ')}`);
    throw error;
  } finally {
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
    await check(browser);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
