const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// One set of buttons at a time in the CV: pointing at a bullet shows the
// bullet's, not its job's or its section's; at a job's title, the job's only;
// at the section's heading, the section's. Synthetic data.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1500, height: 950 });
    const errors = [];
    const resume = { contact: { lineageId: 'c', firstName: 'Sam', lastName: 'Lee' }, summaries: { default: 'Backend engineer.' },
      experiences: [{ lineageId: 'e', company: 'Acme', title: 'Engineer', from: '2024-01', to: '', current: true, position: 0, blurb: 'Payments platform for online shops.', techStack: 'Node.js | TypeScript',
        achievements: [{ lineageId: 'a', experienceLineageId: 'e', bullet: 'Built a TLS certificate service.', position: 0 }] }],
      educations: [], skills: [], projects: [], certifications: [], customSections: [] };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const p = new URL(request.url()).pathname;
      if (!p.startsWith('/api/')) return void request.continue();
      const reply = value => void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      if (p === '/api/auth/me') return reply({ id: 'o', name: 'Sam Lee', email: 's@e.com' });
      if (p === '/api/resumes') return reply([{ id: 'r1', name: 'CV', updatedAt: '2026-11-13T00:00:00Z', jobId: 'job-1' }]);
      if (p === '/api/resumes/r1') return reply(resume);
      if (p === '/api/resumes/r1/score') return reply({ score: 70, keywords: null, issues: [], job: { id: 'job-1', title: 'Engineer', company: 'Acme' } });
      if (p.endsWith('/theme')) return reply({ theme: null });
      if (p.endsWith('/save')) return reply(JSON.parse(request.postData()));
      return reply([]);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents/r1`);
    const section = '.studio-zoom [data-section="experience"]';
    await page.waitForSelector(`${section} [data-edit-item="bullet"]`);
    await pause(1000); // the pages settle
    // Which sets show: the section's, the job's, a line's.
    const shown = () => page.evaluate(selector => {
      const root = document.querySelector(selector);
      // Seen: its own opacity times its parents' (a column of buttons fades as one).
      const seen = node => { let value = 1; for (let at = node; at && at !== root; at = at.parentElement) value *= Number(getComputedStyle(at).opacity); return value; };
      const visible = nodes => [...nodes].some(node => seen(node) > 0.5);
      return {
        section: visible(root.querySelectorAll(':scope > h2 > :is(.ai, .pro-remove-section)')),
        job: visible(root.querySelectorAll('.doc-roleline > :is(.ai, .doc-remove)')),
        line: visible(root.querySelectorAll(':is([data-edit-item="bullet"], .doc-role-desc, .doc-role-stack) > .doc-bulletmeta > *')),
      };
    }, section);
    const at = async (target, label) => {
      const box = await page.$eval(target, node => { const r = node.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; });
      await page.mouse.move(box.x, box.y);
      await pause(800);
      return shown();
    };
    assert.deepEqual(await at(`${section} [data-edit-item="bullet"]`), { section: false, job: false, line: true }, 'a bullet: its own buttons only');
    assert.deepEqual(await at(`${section} .doc-role-desc`), { section: false, job: false, line: true }, 'the description: its own buttons only');
    assert.deepEqual(await at(`${section} .doc-roleline`), { section: false, job: true, line: false }, "the job's title: the job's buttons only");
    assert.deepEqual(await at(`${section} > h2`), { section: true, job: false, line: false }, "the heading: the section's buttons only");
    // Nothing covers a line's buttons: zoomed in until they reach the right edge, and
    // halfway down, where the right fold sits, they are still on top.
    for (let i = 0; i < 6; i++) {
      const reach = await page.evaluate(selector => {
        const tools = document.querySelector(`${selector} [data-edit-item="bullet"] > .doc-bulletmeta`).getBoundingClientRect();
        return document.querySelector('.studio-fold.right').getBoundingClientRect().left - tools.right;
      }, section);
      if (reach < -8) break;
      await page.click('.studio-tools [title="Zoom in"]');
      await pause(300);
    }
    await page.evaluate(selector => {
      const bullet = document.querySelector(`${selector} [data-edit-item="bullet"]`);
      const fold = document.querySelector('.studio-fold.right').getBoundingClientRect();
      const canvas = document.querySelector('.studio-canvas');
      canvas.scrollTop += bullet.getBoundingClientRect().top - (fold.top + fold.height / 2);
    }, section);
    await at(`${section} [data-edit-item="bullet"]`);
    const covered = await page.evaluate(selector => {
      return [...document.querySelectorAll(`${selector} [data-edit-item="bullet"] > .doc-bulletmeta > *`)].filter(button => {
        const box = button.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !button.contains(top);
      }).map(button => button.getAttribute('aria-label') || button.title);
    }, section);
    assert.deepEqual(covered, [], 'every button of the line can be clicked');
    const line = await page.$eval(`${section} [data-edit-item="bullet"]`, node => { const r = node.getBoundingClientRect(); return { x: Math.max(0, r.right - 420), y: r.y - 50, width: 460, height: r.height + 80 }; });
    await page.screenshot({ path: '/private/tmp/job-agent-tools-inside.png', clip: line });
    await page.mouse.move(5, 500);
    await pause(400);
    assert.equal(await page.$eval('.studio-fold.right', node => getComputedStyle(node).visibility), 'visible', 'the fold is back once the pointer leaves the CV');

    assert.deepEqual(errors, []);
    console.log('PASS CV tools: one set at a time, the innermost under the pointer (line, job, section); nothing covers them');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
