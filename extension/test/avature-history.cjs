const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Avature's "More about me" (Lululemon): Work History and Education are rows
// added by "add another", as Simplify's Avature rules and Jobright's dataset
// entries fill them: each job of the CV in its own row, "Is Current Position?"
// Yes or No, month boxes for the dates, the degree from "Type of
// Qualification". Languages is left alone. Synthetic page.
const URL = 'https://careers.lululemon.com/en_US/careers/ApplicationForm/65847/more';
const select2 = (id, label, options) => `<label class="WizardFieldLabel" for="${id}">${label}</label>
  <select id="${id}" class="select2-hidden-accessible" aria-hidden="true" tabindex="-1"><option value=""></option>${options.map((option) => `<option value="${option}">${option}</option>`).join('')}</select>
  <span class="select2 select2-container" style="display:inline-block;width:200px;height:28px"><span class="select2-selection" role="combobox">Select an option</span></span>`;
const workRow = (n, sample = false) => `<div id="multipleDatasetEntry_77_${n}" class="${sample ? 'TableSampleRow' : ''}" ${sample ? 'style="display:none"' : ''}>
  <label class="WizardFieldLabel" for="company_${n}">Company *</label><input id="company_${n}" class="WizardFieldInput">
  <label class="WizardFieldLabel" for="title_${n}">Position Title *</label><input id="title_${n}" class="WizardFieldInput">
  ${select2(`current_${n}`, 'Is Current Position?', ['Yes', 'No'])}
  <div><label class="WizardFieldLabel" for="start_${n}">Start Date *</label><input id="start_${n}" type="month" class="WizardFieldInput"></div>
  <div class="end"><label class="WizardFieldLabel" for="end_${n}">End Date *</label><input id="end_${n}" type="month" class="WizardFieldInput"></div>
  <a role="button" class="removeDatasetRow" href="#">remove</a></div>`;
const page = `<!doctype html><head><meta name="avature.portal.id" content="4"></head><form>
  <fieldset class="Section"><legend class="WizardFieldLabel">More about me</legend>
    <label class="WizardFieldLabel" for="cur">Current Position</label><input id="cur">
    <label class="WizardFieldLabel" for="emp">Employer</label><input id="emp">
  </fieldset>
  <fieldset class="Section" id="work"><legend class="WizardFieldLabel">Work History *</legend>
    ${workRow('sample', true)}${workRow(1)}
    <a role="button" class="addDatasetRow" id="addRowForWork" href="#">add another</a></fieldset>
  <fieldset class="Section" id="edu"><legend class="WizardFieldLabel">Education</legend>
    <div id="multipleDatasetEntry_78_1">
      <label class="WizardFieldLabel" for="qual">Qualification</label><input id="qual">
      ${select2('qtype', 'Type of Qualification', ['High School', 'Diploma', "Bachelor's Degree", "Master's Degree"])}
      <label class="WizardFieldLabel" for="inst">Institute</label><input id="inst">
      <a role="button" class="removeDatasetRow" href="#">remove</a></div>
    <a role="button" class="addDatasetRow" href="#">add another</a></fieldset>
  <fieldset class="Section" id="lang"><legend class="WizardFieldLabel">Languages</legend>
    <div id="multipleDatasetEntry_79_1">${select2('language', 'Language', ['English', 'Ukrainian'])}</div>
    <a role="button" class="addDatasetRow" href="#">add another</a></fieldset>
</form><script>
  // Avature's "add another": a new row from the hidden sample.
  let next = 2;
  document.getElementById('addRowForWork').addEventListener('click', (event) => {
    event.preventDefault();
    const html = document.getElementById('multipleDatasetEntry_77_sample').outerHTML.replaceAll('_sample', '_' + next).replace('TableSampleRow', '').replace('style="display:none"', '');
    next++;
    setTimeout(() => event.target.insertAdjacentHTML('beforebegin', html), 200);
  });
  // "Is Current Position?" Yes hides the end date.
  document.addEventListener('change', (event) => { if (event.target.id?.startsWith('current_')) event.target.closest('[id^=multipleDatasetEntry]').querySelector('.end').style.display = event.target.value === 'Yes' ? 'none' : ''; });
</script>`;
const history = {
  source: 'resume',
  experiences: [
    { company: 'Ciklum', title: 'Senior Software Engineer', from: '2024-10', to: '', current: true, description: '' },
    { company: 'EPAM Systems', title: 'Software Engineer', from: '2021-03', to: '2024-09', current: false, description: '' },
  ],
  educations: [{ institution: 'DIIT Institute', degree: "Bachelor's", field: 'Computer and Information Systems Security', from: '2012', to: '2016' }],
  skills: [], websites: [],
};
const profile = { firstName: 'Sergey', lastName: 'Proniuk', currentCompany: 'Ciklum', currentTitle: 'Senior Software Engineer', history };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(URL);
    await tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);
    const value = (id) => tab.$eval(`#${id}`, (element) => element.value).catch(() => null);
    const row1 = await Promise.all(['company_1', 'title_1', 'current_1', 'start_1', 'end_1'].map(value));
    assert.deepEqual(row1, ['Ciklum', 'Senior Software Engineer', 'Yes', '2024-10', ''], 'the current job: no end date');
    const row2 = await Promise.all(['company_2', 'title_2', 'current_2', 'start_2', 'end_2'].map(value));
    assert.deepEqual(row2, ['EPAM Systems', 'Software Engineer', 'No', '2021-03', '2024-09'], 'the second job in a row added by "add another"');
    assert.equal(await tab.$$eval('#work [id^=multipleDatasetEntry_]:not(.TableSampleRow)', (rows) => rows.length), 2, 'one row per job, no more');
    assert.deepEqual(await Promise.all(['inst', 'qtype', 'qual'].map(value)), ['DIIT Institute', "Bachelor's Degree", "Bachelor's in Computer and Information Systems Security"]);
    assert.equal(await value('language'), '', 'Languages left alone');
    assert.deepEqual(await Promise.all(['cur', 'emp'].map(value)), ['Senior Software Engineer', 'Ciklum'], 'Current Position and Employer, as before');
    console.log('PASS Avature Work History and Education: each job in its own row (added by "add another"), Is Current Position Yes/No, month dates, the degree from Type of Qualification; Languages left alone');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
