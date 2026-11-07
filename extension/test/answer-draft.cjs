const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A company's own written questions, laid out as on Ashby. The popover drafts an
// answer (Simplify's rule: a box of at least 400 × 80), and it is used just
// this time or saved; an optional question with no answer shows a gray icon.
const extension = path.resolve(__dirname, '..');
const html = `<!doctype html><title>Senior Backend Engineer @ Quo</title><h1>Senior Backend Engineer</h1>
<form style="width: 700px; font: 14px system-ui">
  <div class="fieldEntry"><label for="name">Name*</label><input id="name" name="name" required style="width: 600px"></div>
  <div class="fieldEntry"><label for="why">Why are you interested in working at Quo?*</label><textarea id="why" name="why" required style="width: 600px; height: 120px"></textarea></div>
  <div class="fieldEntry"><label for="else">Anything else you would like us to know?</label><textarea id="else" name="else" style="width: 600px; height: 120px"></textarea></div>
  <div class="fieldEntry"><label for="pronouns">Pronouns</label><input id="pronouns" name="pronouns" style="width: 200px"></div>
</form>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', request => void request.respond(request.isNavigationRequest() ? { contentType: 'text/html', body: html } : { status: 404, body: '' }));
    await page.evaluateOnNewDocument(() => {
      window.__messages = []; window.__listeners = [];
      window.chrome = {
        runtime: {
          id: 'test', getURL: file => (file.endsWith('.html') ? 'data:text/html,<p>Panel</p>' : 'data:text/css,'),
          onMessage: { addListener: listener => window.__listeners.push(listener) },
          sendMessage: async message => {
            window.__messages.push(message);
            if (message.type === 'answer-draft') return { ok: true, answer: "Quo's phone system for small teams is the kind of product I like to build behind.", needsInput: [] };
            if (message.type === 'default-save') return { ok: true };
            return {};
          },
        },
        storage: { local: { get: async () => ({ fillMarks: true, animateFill: false }), set: async () => {} }, onChanged: { addListener() {} } },
      };
      window.__ask = message => new Promise(resolve => { for (const listener of window.__listeners) listener(message, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, resolve); });
    });
    await page.goto('https://jobs.ashbyhq.com/quo/1/application');
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
    for (const file of manifest.content_scripts.find(entry => entry.js.includes('src/content.js')).js) await page.addScriptTag({ path: path.join(extension, file) });

    await page.evaluate(() => window.__ask({ type: 'fill', profile: { fullName: 'Sergey Proniuk' }, answers: [] }));
    await new Promise(resolve => setTimeout(resolve, 300));
    const icons = await page.evaluate(() => Object.fromEntries(['name', 'why', 'else', 'pronouns'].map(id => [id, window.CVAutofillMarks.statusOf(document.getElementById(id))])));
    assert.equal(icons.name, 'ok');
    assert.equal(icons.why, 'missing', 'a required question still empty is red');
    assert.equal(icons.else, 'empty', 'an optional question with no answer is gray');

    const popover = async id => page.evaluate(async target => {
      window.CVAutofillMarks.close();
      await window.CVAutofillMarks.open(document.getElementById(target));
      for (let i = 0; i < 40 && !window.CVAutofillMarks.popoverState().spec; i++) await new Promise(resolve => setTimeout(resolve, 50));
      const { spec, text } = window.CVAutofillMarks.popoverState();
      return { text, generate: Boolean(spec?.generate) };
    }, id);
    const why = await popover('why');
    assert.ok(why.generate && /Generate answer/.test(why.text) && /Save answer/.test(why.text) && /Just this time/.test(why.text));

    const drafted = await page.evaluate(async () => {
      const result = await window.CVAutofillMarks.popoverState().spec.generate();
      window.CVAutofillMarks.close();
      await window.CVAutofillMarks.open(document.getElementById('why'));
      for (let i = 0; i < 40 && !window.CVAutofillMarks.popoverState().spec; i++) await new Promise(resolve => setTimeout(resolve, 50));
      const request = window.__messages.find(message => message.type === 'answer-draft');
      return { result, kept: window.CVAutofillMarks.popoverState().spec.text.value, request: { question: request.question, kind: request.kind, title: request.job.title } };
    });
    assert.equal(drafted.result.ok, true);
    assert.match(drafted.kept, /Quo's phone system/, 'the draft stays in the box when the popover redraws');
    assert.deepEqual(drafted.request, { question: 'Why are you interested in working at Quo?', kind: 'textarea', title: 'Senior Backend Engineer' });

    const used = await page.evaluate(async () => {
      const spec = window.CVAutofillMarks.popoverState().spec;
      const result = await spec.once(spec.text.value);
      return { result, value: document.getElementById('why').value, saved: window.__messages.filter(message => message.type === 'default-save').length };
    });
    assert.deepEqual(used, { result: { ok: true, message: 'Filled for this form only.' }, value: "Quo's phone system for small teams is the kind of product I like to build behind.", saved: 0 });

    const small = await popover('pronouns');
    assert.equal(small.generate, false, 'a small box is not drafted (Simplify: 400 × 80 and up)');
    console.log('PASS written questions: gray or red icon, a drafted answer kept in the box, used just this time or saved');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
