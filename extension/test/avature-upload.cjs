const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Avature's "Choose an option to apply" (Lululemon): Autofill uploads the CV as
// Simplify does: its upload box switched to "upload a file" by the page's own
// script (tpt.uploadResume), then the CV in its hidden input; the page then
// shows the file and its Next button. Synthetic page with a stand-in for
// Avature's script.
const URL = 'https://careers.lululemon.com/en_US/careers/ApplicationMethods?jobId=65847';
const page = `<!doctype html><head><meta name="avature.portal.id" content="4"></head><main>
  <h2>Choose an option to apply</h2>
  <a id="methodButton--file" class="uploadResumeTriggerFile methodButton" role="button" tabindex="0">UPLOAD RESUME</a>
  <form id="manualRegisterMethodsForm"><div id="uploadBox" hidden><input type="file" id="resumeFile" name="resumeFile"><p id="chosen"></p><button type="submit" id="next" hidden>Next</button></div></form>
</main><script>
  window.calls = [];
  window.tpt = { uploadResume: {
    mode: '',
    updateAcceptedFieldMode(mode) { calls.push('mode ' + mode); this.mode = mode; },
    uploadResumeInputShower(mode) { calls.push('show ' + mode); document.getElementById('uploadBox').hidden = false; },
    showUploadFileError(on) { calls.push('error ' + on); },
    checkFilledResumeFile() { return document.getElementById('resumeFile').files.length > 0; },
    toggleUploadResumeNextButton(on) { calls.push('next ' + on); document.getElementById('next').hidden = !on; },
  } };
  document.getElementById('resumeFile').addEventListener('change', (event) => {
    if (tpt.uploadResume.mode !== 'file') return;
    document.getElementById('chosen').textContent = event.target.files[0]?.name ?? '';
    tpt.uploadResume.toggleUploadResumeNextButton(true);
  });
</script>`;
const profile = { firstName: 'Sergey', resumeDataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK', resumeFileName: 'Sergey_Proniuk_CV.pdf' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL.split('?')[0]]: page });
    await tab.open(URL);
    await tab.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../src/page-world.js'), 'utf8') });
    const found = await tab.evaluate(() => window.CVAutofillFields.detectFields().found.map((field) => [field.element.id, field.key, field.kind]));
    assert.deepEqual(found, [['resumeFile', 'resume', 'file']], 'the hidden CV input, not the button that opens a file picker');
    await tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);
    const state = await tab.evaluate(() => ({ calls: window.calls, chosen: document.getElementById('chosen').textContent, next: !document.getElementById('next').hidden, files: document.getElementById('resumeFile').files.length }));
    assert.deepEqual(state.calls.slice(0, 3), ['mode file', 'show file', 'error false'], 'the upload box switched to "upload a file" by its own script');
    assert.deepEqual([state.files, state.chosen, state.next], [1, 'Sergey_Proniuk_CV.pdf', true], 'the CV in, and Next shown');
    console.log('PASS Avature UPLOAD RESUME: switched to "upload a file" by its own script, the CV in its input, Next shown, as Simplify does');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
