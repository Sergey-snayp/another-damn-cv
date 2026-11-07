const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A real Ashby application form (Quo's), saved without its scripts. Ashby links
// some labels to nothing: Location's label names a field path its input does
// not have, and a choice question's title is a label in its fieldset.
const extension = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/ashby-quo.html'), 'utf8');

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await page.setContent(`<!doctype html>${html}`);
    await page.evaluate(() => { window.chrome = { storage: { local: { get: async () => ({ fillMarks: true }) }, onChanged: { addListener() {} } } }; });
    for (const file of ['src/sites.js', 'src/fields.js', 'src/marks.js']) await page.addScriptTag({ path: path.join(extension, file) });
    const { fields, questions } = await page.evaluate(() => {
      const F = window.CVAutofillFields;
      const { found } = F.detectFields();
      return {
        fields: [...new Set(found.filter(f => !f.diversity).map(f => `${f.key}:${f.kind}`))],
        questions: F.detectQuestions(found).map(q => q.question),
      };
    });
    assert.deepEqual(fields, [
      'fullName:text', 'email:text', 'linkedin:text', 'phone:text', 'resume:file', 'coverLetter:textarea',
      'location:combobox', 'country:radio', 'workAuthorization:radio', 'requiresSponsorship:textarea', 'website:text',
    ], 'every profile field is found once, with its own question as its label');
    assert.deepEqual(questions, ['Why are you interested in working at Quo?', 'What interests you about this particular role?']);
    const titles = await page.evaluate(() => {
      const F = window.CVAutofillFields;
      const { found } = F.detectFields();
      const first = key => F.labelOf(found.find(f => f.key === key).element);
      return [first('location'), first('country').slice(0, 40), first('eeoVeteran')];
    });
    assert.deepEqual(titles, ['Location', 'We would like to hire this role into the', 'Veteran Status']);
    console.log('PASS Ashby: unlinked labels and choice-question titles are read, every field is recognized');

    // A choice question's icon sits beside its options, level with their middle, on no option's text.
    const icon = await page.evaluate(async () => {
      const F = window.CVAutofillFields;
      const veteran = F.detectFields().found.filter(f => f.key === 'eeoVeteran').map(f => f.element);
      const chosen = veteran.at(-1);
      chosen.click();
      chosen.scrollIntoView({ block: 'center' });
      await window.CVAutofillMarks.show([{ element: chosen, status: 'ok', reason: 'From your diversity answers' }]);
      await new Promise(resolve => setTimeout(resolve, 700));
      return { chosen: chosen.id };
    });
    const overlap = await page.evaluate(id => {
      const chosen = document.getElementById(id);
      const options = window.CVAutofillFields.radiosOf(chosen).flatMap(radio => [...radio.labels]).map(label => label.getBoundingClientRect());
      const top = Math.min(...options.map(box => box.top)), bottom = Math.max(...options.map(box => box.bottom));
      // The icon lives in a closed shadow root: find it by hit-testing to the right of the options.
      const right = Math.max(...options.map(box => box.right));
      return { right: Math.round(right), middle: Math.round((top + bottom) / 2), status: window.CVAutofillMarks.statusOf(chosen) };
    }, icon.chosen);
    assert.equal(overlap.status, 'ok');
    await page.screenshot({ path: '/private/tmp/job-agent-ashby-radio-icon.png', clip: { x: 0, y: Math.max(0, overlap.middle - 140), width: 1400, height: 280 } });
    console.log('PASS the choice icon is drawn beside the options (see the screenshot)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
