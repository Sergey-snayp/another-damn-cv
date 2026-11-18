const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// The match card on a job page: above the description, with the score's level,
// its other cases, and closing it. Synthetic pages and answers.
const JOB = 'https://jobs.lever.co/acme/1';
const FORM = 'https://jobs.lever.co/acme/1/apply';
const OTHER = 'https://shop.example/job/1';
const text = 'Build reliable payment services with TypeScript and PostgreSQL for customers around the world. '.repeat(4);
const posting = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Engineer', description: `<p>${text}</p>`, hiringOrganization: { name: 'Acme' } })}</script>`;
const job = `<!doctype html><title>Engineer</title>${posting}<div id="page"><h1>Engineer</h1><div id="wrap"><div id="about">${text}</div></div></div>`;
const PARAGRAPH = 'https://jobs.lever.co/acme/2';
const pages = { [PARAGRAPH]: `<!doctype html><title>Engineer</title>${posting}<div id="page"><h1>Engineer</h1><div id="outer"><div id="block"><p id="first"><span>${text}</span></p></div></div></div>`, [JOB]: job, [FORM]: `<!doctype html><title>Apply</title>${posting}<h1>Engineer</h1><form id="application-form"><label>Name<input name="name"></label></form>`, [OTHER]: job };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await pageWithScripts(browser, pages);
    const open = (url, reply) => page.open(url, new Function(`window.__sent = []; window.__settings = { animateFill: false }; const send = chrome.runtime.sendMessage; chrome.runtime.sendMessage = async message => { window.__sent.push(message); return message.type === 'match-card' ? ${JSON.stringify(reply)} : send(message); };`));
    const shown = () => page.waitForFunction(() => document.getElementById('adcv-match-card')?.shadowRoot?.querySelector('.card'), { timeout: 6000 });
    const words = () => page.evaluate(() => document.getElementById('adcv-match-card').shadowRoot.textContent.replace(/\s+/g, ' '));
    const absent = async () => { await new Promise(resolve => setTimeout(resolve, 700)); assert.equal(await page.$('#adcv-match-card'), null); };

    await open(JOB, { show: true, score: 90, matched: 7, total: 9 });
    await shown();
    assert.match(await words(), /Strong match.*7 out of 9.*Improve my match.*90.*Good match/);
    assert.equal(await page.evaluate(() => document.getElementById('adcv-match-card').nextElementSibling.id), 'wrap', 'just above the job text, below the title');
    assert.equal((await page.evaluate(() => window.__sent.find(message => message.type === 'match-card').title)), 'Engineer');
    await page.evaluate(() => document.getElementById('adcv-match-card').shadowRoot.querySelector('[data-action="open"]').click());
    assert.ok(await page.evaluate(() => window.__sent.some(message => message.type === 'match-card-open')), 'its button opens the panel');
    await page.evaluate(() => document.getElementById('adcv-match-card').shadowRoot.querySelector('[data-action="close"]').click());
    await page.evaluate(() => { document.body.append(document.createElement('p')); window.CVAutofillMatchCard.update(true); });
    await absent();

    for (const [score, level] of [[81, 'Good match'], [80, 'Fair match'], [41, 'Fair match'], [40, 'Low match']]) {
      await open(JOB, { show: true, score, matched: 1, total: 3 });
      await shown();
      assert.ok((await words()).includes(level), `${score} is ${level}`);
    }
    await open(JOB, { show: true, message: 'No keywords found in this job description' });
    await shown();
    assert.match(await words(), /CV match.*No keywords found.*–/);
    await open(JOB, { show: true, applied: { jobId: 'job1', at: '2026-11-01T12:00:00Z' } });
    await shown();
    assert.match(await words(), /You applied to this job.*Applied on Nov 1, 2026/);
    await open(FORM, { show: true, score: 50, matched: 1, total: 2 });
    await shown();
    assert.equal(await page.evaluate(() => document.getElementById('application-form').firstElementChild.id), 'adcv-match-card', 'at the top of the application form');
    await open(PARAGRAPH, { show: true, score: 50, matched: 1, total: 2 });
    await shown();
    assert.notEqual(await page.evaluate(() => document.getElementById('adcv-match-card').parentElement.tagName), 'P', 'never inside the paragraph');
    assert.ok(await page.evaluate(() => document.getElementById('adcv-match-card').getBoundingClientRect().height > 80), 'it has its size');
    await open(JOB, { show: false });
    await absent();
    await open(OTHER, { show: true, score: 90, matched: 7, total: 9 });
    await absent();
    assert.equal(await page.evaluate(() => window.__sent.filter(message => message.type === 'match-card').length), 0, 'other sites are not asked about');
    console.log('PASS the match card: above the job text, its levels and cases, closing it, and only on the listed job systems');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
