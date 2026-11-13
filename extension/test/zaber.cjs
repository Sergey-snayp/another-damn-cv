const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Zaber's careers page (saved copy): Autofill fills the application form, attaches
// the CV and the required cover letter, and leaves the site search and the
// footer's newsletter sign-up alone.
const extension = path.resolve(__dirname, '..');
const html = `<!doctype html><title>Software Developer | Zaber</title>${fs.readFileSync(path.join(__dirname, 'fixtures', 'zaber-careers.html'), 'utf8')}`;
const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => void request.respond(request.isNavigationRequest() ? { contentType: 'text/html', body: html } : { status: 404, body: '' }));
    await page.evaluateOnNewDocument(() => {
      window.__listeners = [];
      window.chrome = {
        runtime: {
          id: 'test', getURL: file => (file.endsWith('.html') ? 'data:text/html,<p>Panel</p>' : 'data:text/css,'),
          onMessage: { addListener: listener => window.__listeners.push(listener) },
          sendMessage: async () => ({}),
        },
        storage: { local: { get: async () => ({ fillMarks: true, animateFill: false }), set: async () => {} }, onChanged: { addListener() {} } },
      };
      window.__ask = message => new Promise(resolve => { for (const listener of window.__listeners) listener(message, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, resolve); });
    });
    await page.goto('https://www.zaber.com/careers/job?job_id=181541CA22');
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
    for (const file of manifest.content_scripts.find(entry => entry.js.includes('src/content.js')).js) await page.addScriptTag({ path: path.join(extension, file) });

    const scan = await page.evaluate(() => window.__ask({ type: 'scan' }));
    assert.deepEqual(scan.fields.map(field => field.key), ['firstName', 'lastName', 'email', 'phone', 'resume', 'coverLetter'], 'the newsletter email is not a field');
    assert.equal(scan.fields.find(field => field.key === 'coverLetter').required, true, 'the panel is told the cover letter is required');

    const result = await page.evaluate(profile => window.__ask({ type: 'fill', profile, answers: [] }), {
      firstName: 'Sergey', lastName: 'Proniuk', email: 'sergey@example.com', phone: '+1 672 555 0100',
      resumeDataUrl: pdf, resumeFileName: 'Sergey_Proniuk_CV.pdf', coverLetterDataUrl: pdf, coverLetterFileName: 'Sergey_Proniuk_Cover_Letter.pdf', coverLetterText: 'Dear Zaber team,',
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    const page_ = await page.evaluate(() => ({
      first: document.getElementById('firstName').value,
      email: document.getElementById('email').value,
      newsletter: document.getElementById('footer-newsletter-email').value,
      search: document.querySelector('input[name="search"]').value,
      resume: document.getElementById('resume').files[0]?.name ?? null,
      letter: document.getElementById('question-CA_e2c4').files[0]?.name ?? null,
      transcript: document.getElementById('question-CA_e2c5').files.length,
    }));
    assert.deepEqual(page_, { first: 'Sergey', email: 'sergey@example.com', newsletter: '', search: '', resume: 'Sergey_Proniuk_CV.pdf', letter: 'Sergey_Proniuk_Cover_Letter.pdf', transcript: 0 });
    assert.deepEqual(result.failures, []);
    console.log('PASS Zaber: application form filled, CV and required cover letter attached; newsletter and search left alone');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
