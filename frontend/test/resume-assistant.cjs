const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// The CV editor's right panel: Resume Score and Chat tabs; the chat with
// "Tailoring for <job>" and its score, quick actions as chips, from "+" and
// from "/"; and the round folds on the panels' edges. Synthetic API data.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1500, height: 950 });
    const errors = [], asked = [];
    const resume = { contact: { lineageId: 'c', firstName: 'Sam', lastName: 'Lee' }, summaries: { default: 'Backend engineer.' }, experiences: [], educations: [],
      skills: [{ lineageId: 's', name: 'Node.js', category: 'Core', position: 0 }], projects: [], certifications: [], customSections: [] };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const p = new URL(request.url()).pathname;
      if (!p.startsWith('/api/')) return void request.continue();
      const reply = value => void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      if (p === '/api/auth/me') return reply({ id: 'o', name: 'Sam Lee', email: 's@e.com' });
      if (p === '/api/resumes') return reply([{ id: 'r1', name: 'Sam Lee Resume', updatedAt: '2026-11-13T00:00:00Z', jobId: 'job-1' }]);
      if (p === '/api/resumes/r1') return reply(resume);
      if (p === '/api/jobs') return reply([{ id: 'job-1', title: 'Backend Engineer', company: 'Acme', status: 'saved' }]);
      if (p === '/api/resumes/r1/score') return reply({ score: 72, keywords: { score: 70, matched: ['Node.js'], missing: ['Go'] }, issues: [], job: { id: 'job-1', title: 'Backend Engineer', company: 'Acme' } });
      if (p === '/api/resumes/r1/chat') {
        const body = JSON.parse(request.postData());
        asked.push(body.messages.at(-1).text);
        return reply({ reply: 'Start with the summary.', suggestions: [] });
      }
      if (p.endsWith('/theme')) return reply({ theme: null });
      if (p.endsWith('/save')) return reply(JSON.parse(request.postData()));
      return reply([]);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents/r1`);
    await page.waitForSelector('.ra-tabs');
    assert.deepEqual(await page.$$eval('.ra-tabs button', nodes => nodes.map(node => node.textContent.replace(/\s+/g, ' ').trim())), ['Resume Score', 'Chat Beta']);
    await page.waitForSelector('.ra-score .ra-gauge');

    // Chat: the job and its score, then the empty state with its quick actions.
    await page.click('.ra-tabs button:nth-child(2)');
    await page.waitForSelector('.ra-chat-pane');
    assert.match(await page.$eval('.ra-tailoring', node => node.textContent), /Tailoring for\s*Backend Engineer · Acme/);
    assert.equal(await page.$eval('.ra-mini-score .ra-gauge', node => node.getAttribute('aria-label')), 'Resume score 72 out of 100');
    assert.equal(await page.$eval('.ra-empty h4', node => node.textContent), 'Edit your resume with AI');
    assert.deepEqual(await page.$$eval('.ra-chips button', nodes => nodes.map(node => node.textContent.trim())), ['Fit to one page', 'Tailor to job', 'Review my resume', 'Export to PDF']);
    assert.equal(await page.$eval('.ra-compose textarea', node => node.placeholder), 'Ask AI to edit your resume, or type / for quick actions');
    const panel = await page.$eval('.studio-right', node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
    await page.screenshot({ path: '/private/tmp/job-agent-resume-chat.png', clip: panel });
    // The box sits at the bottom of the panel.
    assert.ok(await page.$eval('.ra-compose', (node) => window.innerHeight - node.getBoundingClientRect().bottom < 90), 'the box is at the bottom');

    // A chip asks at once.
    await page.locator('.ra-chips ::-p-text(Review my resume)').click();
    await page.waitForSelector('.ra-msg.assistant');
    assert.match(asked[0], /^Review my resume/);

    // "/" shows the quick actions, filtered as you type; Enter picks.
    await page.click('.ra-compose textarea');
    await page.keyboard.type('/fit');
    assert.deepEqual(await page.$$eval('.ra-quick-menu button', nodes => nodes.map(node => node.textContent.trim())), ['Fit to one page']);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.ra-msg.assistant').length === 2);
    assert.match(asked[1], /^Fit my resume to one page/);
    assert.equal(await page.$eval('.ra-compose textarea', node => node.value), '');

    // "+" opens them all; Escape closes.
    await page.click('.ra-plus');
    assert.equal(await page.$$eval('.ra-quick-menu button', nodes => nodes.length), 4);
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.ra-quick-menu'), null);

    // Typed words are sent with Enter.
    await page.keyboard.type('Make my summary shorter');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.ra-msg.assistant').length === 3);
    assert.equal(asked[2], 'Make my summary shorter');

    // The folds: halfway down each panel's edge; each folds its panel away and back.
    const fold = await page.$eval('.studio-fold.left', node => { const box = node.getBoundingClientRect(); const left = document.querySelector('.studio-left').getBoundingClientRect(); return { centre: box.x + box.width / 2 - left.right, middle: box.y + box.height / 2 - (left.y + left.height / 2) }; });
    assert.ok(Math.abs(fold.centre) <= 1 && Math.abs(fold.middle) <= 2, `the left fold sits on the edge, halfway down: ${JSON.stringify(fold)}`);
    await page.click('.studio-fold.left');
    await page.waitForFunction(() => !document.querySelector('.studio-left'));
    await page.click('.studio-fold.left');
    await page.waitForSelector('.studio-left');
    await page.click('.studio-fold.right');
    await page.waitForFunction(() => !document.querySelector('.studio-right'));
    await page.click('.studio-fold.right');
    await page.waitForSelector('.studio-right');
    assert.equal(await page.$('.studio-bar .studio-tools button[title*="side panel"]'), null, 'no « » in the header');
    await page.screenshot({ path: '/private/tmp/job-agent-resume-editor.png' });

    assert.deepEqual(errors, []);
    console.log('PASS CV editor right panel: Score and Chat tabs, Tailoring for the job with its score, quick actions (chips, +, /), Enter sends; round folds on the edges');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
