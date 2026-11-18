const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// A site that reads the uploaded CV and fills the form from it (Lever): the CV
// goes in first, Autofill waits until the site says it is done, then fills
// the rest, so the site's reading never overwrites the profile's values.
// Synthetic page in Lever's markup.
const URL = 'https://jobs.lever.co/acme/1234/apply';
const page = `<!doctype html><form>
  <label for="resume">Resume/CV</label><input type="file" id="resume" name="resume">
  <span class="resume-upload-working" style="display:none">Parsing…</span><span class="resume-upload-success" style="display:none">Success!</span>
  <label for="name">Full name</label><input id="name" name="name">
  <label for="email">Email</label><input id="email" name="email" type="email">
</form><script>
  // Lever reads the CV for a second, then writes what it read into the form.
  document.getElementById('resume').addEventListener('change', () => {
    document.querySelector('.resume-upload-working').style.display = 'inline';
    setTimeout(() => {
      document.getElementById('name').value = 'NAME READ FROM THE CV';
      document.getElementById('email').value = 'old@cv.example';
      document.querySelector('.resume-upload-working').style.display = 'none';
      document.querySelector('.resume-upload-success').style.display = 'inline';
    }, 1000);
  });
</script>`;
const profile = { firstName: 'Sergey', lastName: 'Proniuk', fullName: 'Sergey Proniuk', email: 'sergey@example.com', resumeDataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK', resumeFileName: 'Sergey_Proniuk_CV.pdf' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(URL);
    await tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);
    // Lever has finished writing what it read before anything is checked.
    await tab.waitForFunction(() => document.querySelector('.resume-upload-success').style.display === 'inline', { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const values = await tab.evaluate(() => [document.getElementById('resume').files.length, document.getElementById('name').value, document.getElementById('email').value]);
    assert.deepEqual(values, [1, 'Sergey Proniuk', 'sergey@example.com'], 'the CV in, and the profile values kept over what Lever read');
    console.log('PASS a site that reads the CV (Lever): the CV first, Autofill waits for "Success", then fills, so its values win');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
