const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// LinkedIn's Easy Apply as it is now: the modal lives in #interop-outlet's open
// shadow root and changes step in place, and "Upload resume" makes its file
// input only when clicked. Runs every content script, as the manifest lists
// them, on a synthetic linkedin.com page; panel messages are sent directly.
const extension = path.resolve(__dirname, '..');
const url = 'https://www.linkedin.com/jobs/view/111/';
const html = `<!doctype html><title>Jobs | LinkedIn</title><main>
  <div class="search-filters" role="group" aria-label="Search filters">
    <label><input type="checkbox" name="workplace"> Remote</label>
    <label><input type="checkbox" name="skill"> Azure</label>
    <label><input type="checkbox" name="applicants"> Under 10 applicants</label>
    <label for="where">City, state, or zip code</label><input id="where" placeholder="City, state, or zip code">
    <input aria-label="Search by title, skill, or company">
  </div>
  <section class="jobs-search__job-details--container" data-job-id="111">
    <h2 class="job-details-jobs-unified-top-card__job-title"><a href="/jobs/view/111">Senior Software Engineer</a></h2>
    <div class="job-details-jobs-unified-top-card__company-name"><a href="/company/conexiom">Conexiom</a></div>
    <div id="job-details"><p>Build reliable services in Node.js and TypeScript, own them from design to delivery and work closely with product.</p></div>
  </section></main><div id="interop-outlet"></div>
<script>document.getElementById('interop-outlet').attachShadow({ mode: 'open' });</script>`;
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`;
const button = text => `<button type="button" class="gvylw7"><span class="gvylzd"><span class="gvylje">${text}</span></span></button>`;
const contactStep = `<div role="dialog"><h2>Apply to Conexiom</h2><label for="first">First name*</label><input id="first" required></div>`;
const questionsStep = `<div role="dialog"><h3>Additional Questions</h3>
  <label for="li">LinkedIn Profile</label><input id="li"><label for="site">Website</label><input id="site">
  <button type="button" id="next">Review</button></div>`;
const resumeStep = `<div role="dialog"><h2>Apply to Conexiom</h2>
  <fieldset role="radiogroup"><div id="easyApplyUploadedResumeRef"></div></fieldset>${button('Upload resume')}
  <button type="button"><span>Tailor resume with AI</span></button>
  <h3>Cover letter</h3><fieldset role="radiogroup"><div id="easyApplyUploadedCoverLetterRef"></div></fieldset>${button('Upload cover letter')}</div>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    // Wide enough that the extension's panel, open on the right, leaves the form free.
    await page.setViewport({ width: 1500, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', request => void request.respond(request.isNavigationRequest()
      ? { contentType: 'text/html; charset=utf-8', body: html }
      : { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.evaluateOnNewDocument(() => {
      window.__messages = []; window.__listeners = []; window.__uploads = []; window.__submitted = [];
      window.chrome = {
        runtime: {
          id: 'test', getURL: file => (file.endsWith('.html') ? 'data:text/html,<p>Panel</p>' : 'data:text/css,'),
          onMessage: { addListener: listener => window.__listeners.push(listener) },
          sendMessage: async message => { window.__messages.push(message.type); if (message.type === 'application-submitted') { window.__submitted.push(message.jobUrl); window.__answers = message.answers; } return message.type === 'default-save' ? { ok: true } : message.type === 'panel-state' ? { open: true } : {}; },
        },
        storage: { local: { get: async () => ({ fillMarks: true, animateFill: false, profile: { linkedin: 'linkedin.com/in/serhiiproniuk' } }), set: async () => {} }, onChanged: { addListener() {} } },
      };
      window.__ask = message => new Promise(resolve => {
        let answered = false;
        for (const listener of window.__listeners) {
          const keepOpen = listener(message, { url: chrome.runtime.getURL('src/sidepanel.html'), id: 'test' }, reply => { answered = true; resolve(reply); });
          void keepOpen;
        }
        setTimeout(() => { if (!answered) resolve(null); }, 15000);
      });
    });
    await page.goto(url);
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
    await page.addScriptTag({ path: path.join(extension, 'src/page-world.js') });
    for (const file of manifest.content_scripts.find(entry => entry.js.includes('src/content.js')).js) await page.addScriptTag({ path: path.join(extension, file) });

    const showStep = step => page.evaluate(markup => {
      const host = document.getElementById('interop-outlet');
      const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      root.innerHTML = markup;
      for (const [label, kind] of [['Upload resume', 'resume'], ['Upload cover letter', 'letter']]) {
        const upload = [...root.querySelectorAll('button')].find(node => node.textContent.trim() === label);
        upload?.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.addEventListener('change', () => window.__uploads.push(`${kind}:${input.files[0]?.name}`));
          input.click();
        });
      }
    }, step);
    const fieldsOnPage = async () => ((await page.evaluate(() => window.__ask({ type: 'scan' })))?.fields ?? []).map(field => `${field.key}:${field.kind}`);
    const formChanges = () => page.evaluate(() => window.__messages.filter(type => type === 'form-changed').length);
    const settle = () => new Promise(resolve => setTimeout(resolve, 900));

    await settle();
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), false, 'the posting alone does not open the panel, even in a tab that had it open');
    assert.deepEqual(await fieldsOnPage(), [], 'LinkedIn\'s search filters are no application form: no fields until Easy Apply opens');
    // LinkedIn's other dialogs: sign-in, and a job alert with a field, drawn where Easy Apply is.
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div role="dialog" id="signin"><h2>Sign in</h2><input type="email"><input type="password"><button>Sign in</button></div>'));
    await showStep('<div role="dialog"><h2>Create job alert</h2><label for="kw">Keywords</label><input id="kw"><button type="button">Save</button></div>');
    await settle();
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), false, 'sign-in and job alert dialogs do not open the panel');
    await page.evaluate(() => document.getElementById('signin').remove());
    // Iframes (ads, LinkedIn's own) report in; the reported bug: any report opened the panel on a posting.
    await page.evaluate(() => {
      for (const found of [false, true]) {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:300px;height:250px';
        frame.srcdoc = `<script>parent.postMessage({ adcvFrameForm: ${found} }, '*')<\/script>`;
        document.body.append(frame);
      }
    });
    await settle();
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), false, 'iframes reporting in do not open the panel on a posting');
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('adcv-autofill-launcher'))), 'the D! button stays');
    // Easy Apply drawn ahead of time but not shown.
    await showStep(contactStep.replace('<div role="dialog">', '<div role="dialog" style="opacity:0">'));
    await settle();
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), false, 'a transparent Easy Apply dialog does not open the panel');
    await showStep(contactStep);
    await settle();
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), true, 'opening Easy Apply opens the panel');
    // Easy Apply dismissed: the panel it opened closes; the next Easy Apply opens it again.
    await showStep('');
    await page.waitForFunction(() => !CVAutofillPanel.isOpen(), { timeout: 5000 }).catch(() => {});
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), false, 'closing Easy Apply closes the panel it opened');
    await showStep(contactStep);
    await settle();
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), true, 'Easy Apply again opens it again');
    const afterContact = await formChanges();
    assert.ok(afterContact >= 1, 'opening Easy Apply tells the panel the form changed');
    assert.ok((await fieldsOnPage()).includes('firstName:text'), 'the contact step is found inside the shadow root');

    await showStep(resumeStep);
    await settle();
    assert.ok((await formChanges()) > afterContact, 'the next step, changed in place, tells the panel again');
    const fields = await fieldsOnPage();
    for (const field of ['resume:pick', 'coverLetter:pick']) assert.ok(fields.includes(field), `${field} on the resume step: ${fields}`);

    const result = await page.evaluate(pdf => window.__ask({ type: 'fill', profile: {
      resumeDataUrl: pdf, resumeFileName: 'Sergey_Proniuk_CV.pdf',
      coverLetterDataUrl: pdf, coverLetterFileName: 'Sergey_Proniuk_Cover_Letter.pdf', coverLetterText: 'Dear Hiring Manager,',
    }, answers: [] }), PDF);
    assert.equal(result?.filled, 2, `Autofill reports both uploads: ${JSON.stringify(result)}`);
    assert.deepEqual(await page.evaluate(() => window.__uploads), ['resume:Sergey_Proniuk_CV.pdf', 'letter:Sergey_Proniuk_Cover_Letter.pdf']);
    console.log('PASS LinkedIn Easy Apply: opening it opens the panel, step changes reach the panel, and Autofill uploads the CV and cover letter');

    // A field the Profile has no value for gets a gray "+" icon; its popover fills it
    // just this time (nothing saved) or saves it to the Profile.
    await showStep(questionsStep);
    await settle();
    await page.evaluate(() => window.__ask({ type: 'fill', profile: { linkedin: 'linkedin.com/in/serhiiproniuk', website: '' }, answers: [] }));
    const icons = await page.evaluate(() => {
      const root = document.getElementById('interop-outlet').shadowRoot;
      return { linkedin: window.CVAutofillMarks.statusOf(root.getElementById('li')), website: window.CVAutofillMarks.statusOf(root.getElementById('site')) };
    });
    assert.deepEqual(icons, { linkedin: 'ok', website: 'empty' }, 'filled fields are green; a field with no Profile value is gray');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.search-filters input')].map(input => [input.name || input.id || input.getAttribute('aria-label'), window.CVAutofillMarks.statusOf(input) ?? null, input.type === 'checkbox' ? input.checked : input.value])),
      [['workplace', null, false], ['skill', null, false], ['applicants', null, false], ['where', null, ''], ['Search by title, skill, or company', null, '']], 'the search filters outside Easy Apply: never filled, never marked');
    const once = await page.evaluate(async () => {
      const site = document.getElementById('interop-outlet').shadowRoot.getElementById('site');
      await window.CVAutofillMarks.open(site);
      for (let i = 0; i < 40 && !window.CVAutofillMarks.popoverState().spec; i++) await new Promise(resolve => setTimeout(resolve, 50));
      const { spec, text } = window.CVAutofillMarks.popoverState();
      const before = window.__messages.filter(type => type === 'default-save').length;
      const result = await spec.once('https://serhii.dev');
      return { text, result, value: site.value, saved: window.__messages.filter(type => type === 'default-save').length - before, status: window.CVAutofillMarks.statusOf(site) };
    });
    assert.match(once.text, /Save to Profile/);
    assert.match(once.text, /Just this time/);
    assert.deepEqual({ ...once, text: undefined }, { text: undefined, result: { ok: true, message: 'Filled for this form only.' }, value: 'https://serhii.dev', saved: 0, status: 'ok' });
    const saved = await page.evaluate(async () => {
      const site = document.getElementById('interop-outlet').shadowRoot.getElementById('site');
      site.value = '';
      const { spec } = window.CVAutofillMarks.popoverState();
      const result = await spec.choose('https://serhii.dev');
      return { ok: result.ok, saved: window.__messages.filter(type => type === 'default-save').length };
    });
    assert.deepEqual(saved, { ok: true, saved: 1 }, 'Save to Profile saves it for later forms');
    // The person closes the popover and moves on: the step is read before it goes.
    await page.evaluate(() => window.CVAutofillMarks.close());
    const next = await page.evaluate(() => { const r = document.getElementById('interop-outlet').shadowRoot.getElementById('next').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(next.x, next.y);
    console.log('PASS a field with no Profile value gets a gray icon to fill it once or save it to the Profile');

    // Pressing "Submit application" tells the extension the application was sent,
    // with the LinkedIn job's address; a script's click, or a form with a required
    // field still empty, does not.
    await showStep(`<div role="dialog"><h3>Review your application</h3><label for="q">Years of Node.js*</label><input id="q" required>
      <button type="button" id="submit"><span>Submit application</span></button></div>`);
    await settle();
    const submit = async () => {
      const box = await page.evaluate(() => { const r = document.getElementById('interop-outlet').shadowRoot.getElementById('submit').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.click(box.x, box.y);
      await new Promise(resolve => setTimeout(resolve, 200));
      return page.evaluate(() => window.__submitted.slice());
    };
    assert.deepEqual(await submit(), [], 'a required field is still empty: the form will not send');
    await page.evaluate(() => { document.getElementById('interop-outlet').shadowRoot.getElementById('q').value = '6'; });
    await page.evaluate(() => document.getElementById('interop-outlet').shadowRoot.getElementById('submit').click());
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(await page.evaluate(() => window.__submitted.slice()), [], "a script's click is not the person submitting");
    assert.deepEqual(await submit(), ['https://www.linkedin.com/jobs/view/111'], 'the person submitting sends the job address once');
    assert.deepEqual(await page.evaluate(() => window.__answers), [
      { question: 'Resume', answer: 'Sergey_Proniuk_CV.pdf' },
      { question: 'Cover letter', answer: 'Sergey_Proniuk_Cover_Letter.pdf' },
      { question: 'LinkedIn Profile', answer: 'linkedin.com/in/serhiiproniuk' },
      { question: 'Website', answer: 'https://serhii.dev' },
      { question: 'Years of Node.js', answer: '6' },
    ], 'every step of the form is kept, files by name, and sent with the submit');
    console.log('PASS clicking Submit application reports the LinkedIn job as applied, with every step\'s answers');

    // Easy Apply as a top-layer window: drawn ahead of time in a closed popover
    // (no role="dialog", form in a shadow root), then shown with showPopover(),
    // which adds nothing to the page. And the same as a modal <dialog>.
    await showStep('');
    await page.waitForFunction(() => !CVAutofillPanel.isOpen(), { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => {
      const form = '<h2>Apply to Conexiom</h2><label for="p-first">First name</label><input id="p-first"><button type="button">Next</button>';
      const pop = document.createElement('div');
      pop.id = 'ea-pop'; pop.setAttribute('popover', 'manual'); pop.style.cssText = 'width:80vw;height:80vh';
      pop.attachShadow({ mode: 'open' }).innerHTML = `<div class="sheet">${form}</div>`;
      const dialog = document.createElement('dialog');
      dialog.id = 'ea-dialog'; dialog.style.cssText = 'width:600px;height:400px';
      dialog.innerHTML = form.replaceAll('p-first', 'd-first');
      document.body.append(pop, dialog);
    });
    await settle();
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), false, 'Easy Apply drawn ahead of time but closed does not open the panel');
    await page.evaluate(() => document.getElementById('ea-pop').showPopover());
    await page.waitForFunction(() => CVAutofillPanel.isOpen(), { timeout: 3000 }).catch(() => {});
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), true, 'Easy Apply shown as a popover opens the panel');
    await page.evaluate(() => document.getElementById('ea-pop').hidePopover());
    await page.waitForFunction(() => !CVAutofillPanel.isOpen(), { timeout: 5000 }).catch(() => {});
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), false, 'closing the popover closes the panel it opened');
    await page.evaluate(() => document.getElementById('ea-dialog').showModal());
    await page.waitForFunction(() => CVAutofillPanel.isOpen(), { timeout: 3000 }).catch(() => {});
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), true, 'Easy Apply shown as a modal dialog opens the panel');
    console.log('PASS Easy Apply shown as a popover or a modal dialog opens the panel, and closing it closes the panel');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
