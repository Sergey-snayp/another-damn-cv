const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// LinkedIn's Easy Apply resume step, as markup: a modal with no <form>, and
// file inputs hidden behind their "Upload resume" / "Upload cover letter"
// buttons (a <label for> the input). Synthetic page; no account is used.
const extension = path.resolve(__dirname, '..');
const html = `<!doctype html><title>Apply</title>
<dialog id="apply">
  <h3>Resume</h3>
  <div class="js-jobs-document-upload__container">
    <label for="jobs-document-upload-file-input-upload-resume" class="artdeco-button">Upload resume</label>
    <input id="jobs-document-upload-file-input-upload-resume" name="file" type="file" accept=".pdf,.doc,.docx" style="display:none">
  </div>
  <h3>Cover letter</h3>
  <div><label for="jobs-document-upload-file-input-upload-cover-letter" class="artdeco-button">Upload cover letter</label>
    <input id="jobs-document-upload-file-input-upload-cover-letter" name="file" type="file" style="display:none"></div>
  <div><button type="button">Attach your CV</button><input id="other" type="file" style="display:none"></div>
  <div style="display:none"><label for="gone">Upload resume</label><input id="gone" type="file"></div>
  <button>Next</button>
</dialog>`;
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.evaluate(() => {
      window.chrome = { storage: { local: { get: async () => ({ fillMarks: false }) }, onChanged: { addListener() {} } } };
      document.getElementById('apply').showModal();
    });
    for (const file of ['src/sites.js', 'src/fields.js', 'src/filler.js', 'src/marks.js']) await page.addScriptTag({ path: path.join(extension, file) });

    const found = await page.evaluate(() => window.CVAutofillFields.detectFields().found.map(field => `${field.element.id}:${field.key}:${field.kind}`));
    assert.ok(found.includes('jobs-document-upload-file-input-upload-resume:resume:file'), `the hidden resume input is found: ${found}`);
    assert.ok(found.includes('jobs-document-upload-file-input-upload-cover-letter:coverLetter:file'), 'and the cover letter one');
    assert.ok(found.includes('other:resume:file'), 'a hidden input named by the button beside it');
    assert.ok(!found.some(field => field.startsWith('gone:')), 'an input whose button is hidden too is left alone');

    const attached = await page.evaluate(async pdf => {
      const { found } = window.CVAutofillFields.detectFields();
      const fields = found.filter(field => field.element.id === 'jobs-document-upload-file-input-upload-resume');
      let changed = 0;
      fields[0].element.addEventListener('change', () => changed++);
      await window.CVAutofillFiller.fillAll(fields, { resumeDataUrl: pdf, resumeFileName: 'Sergey_Proniuk_CV.pdf' });
      const input = fields[0].element;
      return { name: input.files[0]?.name, changed };
    }, PDF);
    assert.deepEqual(attached, { name: 'Sergey_Proniuk_CV.pdf', changed: 1 }, 'Autofill attaches the CV and tells LinkedIn it changed');
    console.log('PASS hidden upload inputs behind their buttons are found and the CV is attached');

    // As on LinkedIn today: Easy Apply inside #interop-outlet's open shadow root, and
    // "Upload resume" creates its file input only when clicked, outside the page.
    const linkedin = await browser.newPage();
    await linkedin.setContent('<!doctype html><title>Jobs</title><main><input id="search" placeholder="Search"></main><div id="interop-outlet"></div>');
    await linkedin.evaluate(() => {
      window.chrome = { storage: { local: { get: async () => ({ fillMarks: false }) }, onChanged: { addListener() {} } } };
      window.__uploads = [];
      const root = document.getElementById('interop-outlet').attachShadow({ mode: 'open' });
      root.innerHTML = `<div role="dialog" aria-modal="true"><h2>Apply to Conexiom</h2>
        <label for="first">First name</label><input id="first" required>
        <fieldset><legend>Are you legally authorized to work in Canada?</legend>
          <label><input type="radio" name="auth" value="yes"> Yes</label><label><input type="radio" name="auth" value="no"> No</label></fieldset>
        <button type="button" class="artdeco-button" id="upload-resume"><span>Upload resume</span></button>
        <button type="button" class="artdeco-button">Tailor resume with AI</button>
        <h3>Cover letter</h3><button type="button" id="upload-letter">Upload cover letter</button></div>`;
      for (const [id, kind] of [['upload-resume', 'resume'], ['upload-letter', 'letter']]) {
        root.getElementById(id).addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.addEventListener('change', () => window.__uploads.push(`${kind}:${input.files[0]?.name}:${input.files[0]?.size}`));
          input.click();
        });
      }
    });
    for (const file of ['src/page-world.js', 'src/sites.js', 'src/fields.js', 'src/filler.js', 'src/marks.js']) await linkedin.addScriptTag({ path: path.join(extension, file) });
    const seen = await linkedin.evaluate(() => window.CVAutofillFields.detectFields().found.map(field => `${field.key}:${field.kind}`));
    for (const field of ['firstName:text', 'resume:pick', 'coverLetter:pick'])
      assert.ok(seen.includes(field), `${field} is found inside the shadow root: ${seen}`);
    assert.equal(seen.filter(field => field.startsWith('resume')).length, 1, '"Tailor resume with AI" is not an upload');
    const missing = await linkedin.evaluate(() => window.CVAutofillFields.findMissingRequired().map(item => item.label));
    assert.ok(missing.some(label => /First name/.test(label)), `required fields in the shadow root are listed: ${missing}`);

    const result = await linkedin.evaluate(async pdf => {
      const { found } = window.CVAutofillFields.detectFields();
      const { filled } = await window.CVAutofillFiller.fillAll(found, {
        firstName: 'Sergey', resumeDataUrl: pdf, resumeFileName: 'Sergey_Proniuk_CV.pdf',
        coverLetterDataUrl: pdf, coverLetterFileName: 'Sergey_Proniuk_Cover_Letter.pdf',
      });
      const root = document.getElementById('interop-outlet').shadowRoot;
      return { filled, first: root.getElementById('first').value, uploads: window.__uploads };
    }, PDF);
    assert.equal(result.first, 'Sergey');
    assert.deepEqual(result.uploads, ['resume:Sergey_Proniuk_CV.pdf:14', 'letter:Sergey_Proniuk_Cover_Letter.pdf:14'], 'both buttons received their file without a file picker');
    assert.equal(result.filled, 3);

    const again = await linkedin.evaluate(async pdf => {
      const { found } = window.CVAutofillFields.detectFields();
      await window.CVAutofillFiller.fillAll(found, { resumeDataUrl: pdf, coverLetterDataUrl: pdf });
      return window.__uploads.length;
    }, PDF);
    assert.equal(again, 2, 'a second Autofill does not upload the same files again');

    // With nothing armed, a file input's click is the page's own: no file is slipped in.
    const picker = await linkedin.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      let opened = false;
      input.addEventListener('change', () => { opened = true; });
      try { input.click(); } catch { /* headless has no picker */ }
      return { opened, files: input.files.length };
    });
    assert.deepEqual(picker, { opened: false, files: 0 }, 'nothing is armed, so no file is slipped into another input');
    console.log('PASS LinkedIn Easy Apply in a shadow root: fields found, CV and cover letter uploaded through their buttons, once');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
