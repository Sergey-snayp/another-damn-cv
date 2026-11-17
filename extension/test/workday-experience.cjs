const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Workday's "My Experience" step, in the markup Simplify's Workday rules name:
// Work Experience, Education and Websites are lists behind "Add" (a panel per
// item), Skills a search box that adds one known skill at a time, school and
// field of study search boxes, the degree a menu. Synthetic page; no account used.
const URL = 'https://ubc.wd10.myworkdayjobs.com/en-US/ubcstaffjobs/job/x/Programmer-Analyst-I-2_JR26638/apply/applyManually';
const page = `<!doctype html><title>My Experience</title>
<style>label { display: block; }</style>
<main><h2>My Experience</h2>
  <div role="group" aria-labelledby="Work-Experience-section"><h3 id="Work-Experience-section">Work Experience</h3><div id="work"></div>
    <button type="button" data-automation-id="add-button" aria-label="Add Work Experience" onclick="addWork(this)">Add</button></div>
  <div role="group" aria-labelledby="Education-section"><h3 id="Education-section">Education</h3><div id="education"></div>
    <button type="button" data-automation-id="add-button" aria-label="Add Education" onclick="addEducation(this)">Add</button></div>
  <div data-automation-id="formField-skills"><label for="skills">Skills</label><div data-automation-id="multiSelectContainer"><div id="chips"></div><input id="skills" placeholder="Search" data-picks="skills"></div></div>
  <div data-automation-id="formField-resume"><label>Application Documents</label><div class="drop"><div style="display:none"><input type="file" data-automation-id="file-upload-input-ref" id="cv"></div><button type="button" data-automation-id="select-files">Select files</button></div></div>
  <section><h3>Websites</h3><div id="websites"></div>
    <button type="button" onclick="addWebsite(this)">Add</button></section>
</main>
<script>
  let works = 0, schools = 0, sites = 0;
  // Workday's panel Delete button.
  const DELETE = '<button type="button" data-automation-id="panel-set-delete-button" onclick="this.parentElement.remove()">Delete</button>';
  // Its upload box: a chosen file shows as an item with its own Delete button.
  document.addEventListener('change', (event) => {
    if (event.target.id !== 'cv' || !event.target.files.length) return;
    event.target.closest('.drop').insertAdjacentHTML('beforeend', '<div data-automation-id="file-upload-item">' + event.target.files[0].name + ' <button type="button" data-automation-id="delete-file" onclick="this.parentElement.remove()">Delete</button></div>');
  });
  const text = (id, label, extra = '') => '<div data-automation-id="formField-' + id + '"><label for="' + id + '">' + label + '</label><input type="text" id="' + id + '" data-automation-id="' + id + '" ' + extra + '></div>';
  const monthYear = (id, label, n) => '<div data-automation-id="formField-' + id + '"><label>' + label + '</label><input aria-label="Month" id="' + id + '-month-' + n + '"><input aria-label="Year" id="' + id + '-year-' + n + '"></div>';
  function addWork(button) {
    works++;
    document.getElementById('work').insertAdjacentHTML('beforeend', '<div data-automation-id="workExperience-' + works + '"><h4>Work Experience ' + works + '</h4>' + DELETE
      + text('jobTitle', 'Job Title').replace(/id="jobTitle"/, 'id="jobTitle-' + works + '"')
      + text('company', 'Company').replace(/id="company"/, 'id="company-' + works + '"')
      + text('location', 'Location').replace(/id="location"/, 'id="location-' + works + '"')
      + '<label><input type="checkbox" data-automation-id="currentlyWorkHere" id="current-' + works + '"> I currently work here</label>'
      + monthYear('startDate', 'From', works) + monthYear('endDate', 'To', works)
      + '<label for="description-' + works + '">Role Description</label><textarea data-automation-id="description" id="description-' + works + '"></textarea></div>');
    button.setAttribute('aria-label', 'Add Another Work Experience');
  }
  function addEducation(button) {
    schools++;
    document.getElementById('education').insertAdjacentHTML('beforeend', '<div data-automation-id="education-' + schools + '"><h4>Education ' + schools + '</h4>' + DELETE
      + '<div data-automation-id="formField-schoolItem"><label>School or University</label><div id="school-chip-' + schools + '"></div><input placeholder="Search" id="school-' + schools + '" data-picks="schools"></div>'
      + '<div data-automation-id="formField-degree"><label id="degree-label-' + schools + '">Degree</label><button type="button" aria-haspopup="listbox" aria-labelledby="degree-label-' + schools + '" data-automation-id="degree" id="degree-' + schools + '">Select One</button></div>'
      + '<div data-automation-id="formField-field-of-study"><label>Field of Study</label><div id="study-chip-' + schools + '"></div><input placeholder="Search" id="study-' + schools + '" data-picks="studies"></div>'
      + '<div data-automation-id="formField-startDate"><label>From</label><input id="school-from-' + schools + '"></div>'
      + '<div data-automation-id="formField-endDate"><label>To</label><input id="school-to-' + schools + '"></div></div>');
    button.setAttribute('aria-label', 'Add Another Education');
  }
  function addWebsite(button) {
    sites++;
    document.getElementById('websites').insertAdjacentHTML('beforeend', '<div data-automation-id="websitePanelSet-' + sites + '">' + text('website', 'URL').replace(/id="website"/, 'id="website-' + sites + '"') + '</div>');
    button.setAttribute('aria-label', 'Add Another Websites');
  }
  // Workday's search boxes: Enter shows the known items that match; choosing one makes a chip.
  const CATALOG = { skills: ['TypeScript', 'Node.js (Programming)', 'PostgreSQL', 'JavaScript'], schools: ['Original University', 'Other University'], studies: ['Computer Science', 'Software Engineering'] };
  const DEGREES = ["Associate's Degree", "Bachelor's Degree", "Master's Degree"];
  let searching = null;
  const popup = (texts, prompt) => {
    document.querySelector('[data-automation-activepopup]')?.remove();
    document.body.insertAdjacentHTML('beforeend', '<div data-automation-activepopup="true"><ul role="listbox">' + texts.map((t) => prompt
      ? '<li><div data-automation-id="promptLeafNode"><div data-automation-id="promptOption" data-automation-label="' + t + '">' + t + '</div></div></li>'
      : '<li role="option">' + t + '</li>').join('') + '</ul></div>');
  };
  document.addEventListener('keydown', (event) => {
    if (event.keyCode !== 13 || !event.target.dataset?.picks) return;
    searching = event.target;
    const typed = searching.value.toLowerCase();
    popup(CATALOG[searching.dataset.picks].filter((t) => t.toLowerCase().includes(typed)), true);
  });
  document.addEventListener('click', (event) => {
    const degree = event.target.closest('button[data-automation-id="degree"]');
    if (degree) { searching = degree; popup(DEGREES, false); return; }
    const option = event.target.closest('[data-automation-id="promptLeafNode"], [role="option"]');
    if (!option || !searching) return;
    const chosen = option.textContent;
    document.querySelector('[data-automation-activepopup]').remove();
    if (searching.tagName === 'BUTTON') { searching.textContent = chosen; return; }
    const chips = searching.dataset.picks === 'skills' ? document.getElementById('chips') : searching.previousElementSibling;
    chips.insertAdjacentHTML('beforeend', '<div data-automation-id="selectedItem">' + chosen + '</div>');
    searching.value = '';
  });
</script>`;

const history = {
  source: 'resume',
  experiences: [
    { company: 'Ciklum', title: 'Senior Software Engineer', location: 'Canada (Remote)', from: '2024-10', to: '', current: true, description: 'Card payment platform.\n• Built the Discover integration.' },
    { company: 'EPAM', title: 'Software Engineer', location: 'Kyiv, Ukraine', from: '2021-12', to: '2024-09', current: false, description: 'High-load ad tech.' },
  ],
  educations: [
    { institution: 'Original University', degree: 'BSc', field: 'Computer Engineering', from: '2013', to: '2017' },
    // A course: no degree, so no Education panel (Workday would demand a degree).
    { institution: 'EPAM', degree: '', field: 'Advanced Node.js', from: '', to: '' },
  ],
  skills: ['TypeScript', 'Node.js', 'Rust'],
  websites: ['https://www.linkedin.com/in/sergey', 'https://github.com/sergey'],
};
// A home location and current employer that must never land in an older job's panel.
const profile = { firstName: 'Sergey', lastName: 'Proniuk', email: 'sam@example.com', location: 'Vancouver, BC', city: 'Vancouver', currentCompany: 'Ciklum', currentTitle: 'Senior Software Engineer', history,
  resumeDataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK', resumeFileName: 'Sergey_Proniuk_CV.pdf' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [URL]: page });
    await tab.open(URL);
    const fill = () => tab.evaluate((profile) => window.__ask({ type: 'fill', profile, answers: [] }), profile);
    await fill();
    const value = (id) => tab.$eval(`#${id}`, (input) => (input.type === 'checkbox' ? input.checked : input.value));
    const read = (ids) => Promise.all(ids.map(value));

    assert.deepEqual(await read(['jobTitle-1', 'company-1', 'location-1', 'current-1', 'startDate-month-1', 'startDate-year-1', 'endDate-year-1']),
      ['Senior Software Engineer', 'Ciklum', 'Canada (Remote)', true, '10', '2024', ''], 'the current job: "I currently work here" ticked, no end date; a two-digit month and its year both set');
    assert.match(await value('description-1'), /^Card payment platform\.\n• Built the Discover integration\.$/);
    assert.deepEqual(await read(['jobTitle-2', 'company-2', 'current-2', 'startDate-month-2', 'startDate-year-2', 'endDate-month-2', 'endDate-year-2']),
      ['Software Engineer', 'EPAM', false, '12', '2021', '9', '2024'], 'each job its own panel, added with "Add"; months as Workday shows them');
    const chips = (id) => tab.$$eval(`#${id} [data-automation-id="selectedItem"]`, (items) => items.map((item) => item.textContent));
    assert.deepEqual([await chips('school-chip-1'), await tab.$eval('#degree-1', (button) => button.textContent), await chips('study-chip-1'), await value('school-from-1'), await value('school-to-1')],
      [['Original University'], "Bachelor's Degree", ['Software Engineering'], '2013', '2017'], 'the school: found, its degree as Workday names it ("BSc" → Bachelor\'s Degree), the closest field of study when the exact one is not listed');
    assert.equal(await tab.$$eval('[data-automation-id^="education-"]', (panels) => panels.length), 1, 'a course (no degree) gets no Education panel');
    const uploaded = () => tab.$$eval('[data-automation-id="file-upload-item"]', (items) => items.map((item) => item.firstChild.textContent.trim()));
    assert.deepEqual(await uploaded(), ['Sergey_Proniuk_CV.pdf'], "the CV attached to Workday's hidden upload input");
    assert.deepEqual(await chips('chips'), ['TypeScript', 'Node.js (Programming)'], 'skills Workday knows (searched with a real Enter); Rust is not in its list, so it is left out');
    assert.deepEqual(await read(['website-1', 'website-2']), history.websites);
    console.log('PASS Workday My Experience: each job, school and website added and filled, its degree and known skills chosen');

    // Again: nothing doubles, nothing filled is changed.
    await tab.$eval('#jobTitle-1', (input) => { input.value = 'Senior Engineer (edited)'; });
    await tab.$eval('#location-2', (input) => { input.value = ''; });
    await tab.$eval('#company-2', (input) => { input.value = ''; });
    await fill();
    const counts = await tab.evaluate(() => ['workExperience', 'education', 'websitePanelSet'].map((name) => document.querySelectorAll(`[data-automation-id^="${name}-"]`).length));
    assert.deepEqual(counts, [2, 1, 2], 'a second Autofill adds no second copy');
    assert.equal(await value('jobTitle-1'), 'Senior Engineer (edited)', 'and never overwrites what is there');
    assert.deepEqual(await read(['company-2', 'location-2']), ['EPAM', 'Kyiv, Ukraine'], "an older job's emptied fields get that job's, never the current employer or home location");
    assert.deepEqual(await chips('chips'), ['TypeScript', 'Node.js (Programming)']);
    assert.deepEqual(await uploaded(), ['Sergey_Proniuk_CV.pdf'], 'the CV replaced, not uploaded twice: the old file deleted first');
    console.log('PASS a second Autofill: no job, school, website, skill or CV twice, and nothing typed over');

    // Clean-up: a page left with extra panels and an invalid date, as Workday showed it.
    await tab.open(URL);
    await tab.evaluate(() => {
      const work = document.querySelector('[aria-label="Add Work Experience"]'), school = document.querySelector('[aria-label="Add Education"]');
      addWork(work);
      for (let i = 0; i < 4; i++) addEducation(i ? document.querySelector('[aria-label="Add Another Education"]') : school);
      document.getElementById('startDate-month-1').value = '10';
      document.querySelector('[data-automation-id="workExperience-1"] [data-automation-id="formField-startDate"]').insertAdjacentHTML('beforeend', '<p data-automation-id="errorMessage">Error: Invalid Date: 10/</p>');
    });
    const cleaned = await fill();
    assert.equal(await tab.$$eval('[data-automation-id^="education-"]', (panels) => panels.length), 1, 'Education panels beyond the CV\'s one school are deleted');
    assert.ok(cleaned.notes.includes('Removed 3 Education entries not in your CV.'), `the panel is told (${JSON.stringify(cleaned.notes)})`);
    assert.deepEqual(await read(['startDate-month-1', 'startDate-year-1']), ['10', '2024'], 'a date Workday called invalid is set again');
    console.log('PASS clean-up: extra Education panels deleted (and said so), an invalid date set again');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
