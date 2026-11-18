const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Questions answered by pressing a button, with no input to fill: Ashby's
// Yes/No, Oracle's pills, Eightfold's radios. Autofill presses the answer's
// button, as Simplify does. Synthetic page.
const URL = 'https://jobs.ashbyhq.com/acme/1234/application';
const page = `<!doctype html><main>
  <div class="fieldEntry"><label class="question-title">Are you legally authorized to work in Canada?</label>
    <div class="_yesno_x1"><button type="button" class="_option_x">Yes</button><button type="button" class="_option_x">No</button></div></div>
  <div class="fieldEntry"><span>Will you now or in the future require sponsorship?</span>
    <ul class="cx-select-pills-container" aria-label="Will you now or in the future require sponsorship?"><li><button type="button" class="cx-select-pill">Yes</button></li><li><button type="button" class="cx-select-pill">No</button></li></ul></div>
  <div><p>Are you a Canadian citizen or a permanent resident?</p>
    <div role="radiogroup"><i role="radio" aria-label="Yes" aria-checked="false" tabindex="0"></i><i role="radio" aria-label="No" aria-checked="false" tabindex="0"></i></div></div>
  <div><button type="button">Back</button><button type="button">Next</button></div>
</main><script>
  // Each site marks the chosen answer its own way: a class, aria-pressed, aria-checked.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button, [role=radio]');
    if (!button || !/^(Yes|No)$/.test(button.textContent || button.getAttribute('aria-label'))) return;
    const group = button.parentElement.closest('div, ul');
    for (const other of group.querySelectorAll('button, [role=radio]')) { other.classList.remove('selected'); other.removeAttribute('aria-pressed'); if (other.getAttribute('role') === 'radio') other.setAttribute('aria-checked', 'false'); }
    if (button.classList.contains('cx-select-pill')) button.classList.add('selected');
    else if (button.getAttribute('role') === 'radio') button.setAttribute('aria-checked', 'true');
    else button.setAttribute('aria-pressed', 'true');
  });
</script>`;
const profile = { firstName: 'Sergey', country: 'Canada', eligibility: { 'workAuthorization:Canada': 'Yes', requiresSponsorship: 'No' }, workStatus: { canada: { citizenship: 'No', authorized: 'Yes', sponsorship: 'No', basis: 'PERMANENT_RESIDENT' } } };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(URL);
    const found = await tab.evaluate(() => window.CVAutofillFields.detectFields().found.filter((field) => field.kind === 'buttons').map((field) => [field.key, field.country ?? '']));
    assert.deepEqual(found, [['workAuthorization', 'Canada'], ['requiresSponsorship', ''], ['citizenOrResident', 'Canada']], 'three questions; Back and Next are not answers');
    await tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);
    const chosen = await tab.evaluate(() => [...document.querySelectorAll('[data-adcv-choices]')].map((group) => [...group.querySelectorAll('button, [role=radio]')].filter((b) => b.getAttribute('aria-pressed') === 'true' || b.classList.contains('selected') || b.getAttribute('aria-checked') === 'true').map((b) => b.textContent || b.getAttribute('aria-label')).join()));
    assert.deepEqual(chosen, ['Yes', 'No', 'Yes'], 'authorized Yes, sponsorship No, citizen or PR Yes (a permanent resident)');
    console.log('PASS answers drawn as buttons (Ashby Yes/No, Oracle pills, Eightfold radios): found by their question and pressed; Back and Next left alone');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
