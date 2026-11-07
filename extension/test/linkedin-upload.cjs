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
    console.log('PASS LinkedIn Easy Apply: hidden upload inputs behind their buttons are found and the CV is attached');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
