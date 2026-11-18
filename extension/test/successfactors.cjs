const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// SAP SuccessFactors, in the shape of EY's site: the job page on the company's
// domain (microdata, no JSON-LD) and Create an Account on the shared host.
// Synthetic pages.
const JOB = 'https://careers.acme.example/acme/job/Vancouver-Engineer/123/';
const ACCOUNT = 'https://career5.successfactors.eu/career?company=ACMEPROD';
const SEARCH = 'https://career5.successfactors.eu/careers?company=ACMEPROD';
const countries = '<option value="">- Select -</option><option value="1">POLAND</option><option value="2">CANADA</option>';
const codes = '<option value="">- Select -</option><option value="1">POLAND (+48)</option><option value="2">CANADA (+1)</option>';
const row = (id, label, type = 'text') => `<label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}">`;
const pages = {
  [JOB]: `<!doctype html><head><title>Engineer Job Details | Acme</title><link rel="stylesheet" href="https://rmkcdn.successfactors.com/x/main.css"></head>
    <button class="btn" aria-label="Apply now" href="/talentcommunity/apply/123/?locale=en_GB">Apply now</button>
    <div class="jobDisplayShell" itemscope itemtype="http://schema.org/JobPosting">
      <span itemprop="jobLocation" itemscope itemtype="http://schema.org/Place"><span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="addressLocality" content="Vancouver"><meta itemprop="addressRegion" content="BC"><meta itemprop="addressCountry" content="CA"></span></span>
      <meta itemprop="datePosted" content="Mon Nov 09 02:00:00 UTC 2026"><meta itemprop="hiringOrganization" content="Acme">
      <h1><span itemprop="title">Engineer</span></h1><span itemprop="description"><p>Build the payment platform.</p></span></div>`,
  [ACCOUNT.split('?')[0]]: `<!doctype html><title>Career Opportunities: Create an Account</title><nav><a href="/">Careers at Acme</a></nav><form onsubmit="return false">
    ${row('fbclc_userName', 'Email Address: *')}${row('fbclc_emailConf', 'Retype Email Address: *')}${row('fbclc_pwd', 'Choose Password: *', 'password')}${row('fbclc_pwdConf', 'Retype Password: *', 'password')}
    ${row('fbclc_fName', 'First Name: *')}${row('fbclc_lName', 'Last Name: *')}
    <label for="fbclc_ituCode">Country/Region Code:*</label><select id="fbclc_ituCode">${codes}</select>${row('fbclc_phoneNumber', 'Phone Number:*')}
    <label for="fbclc_country">Country/Region of Residence:*</label><select id="fbclc_country">${countries}</select>
    <label><input type="checkbox" id="fbclc_emailEnabled">Receive new job posting notifications by email</label>
    <button name="fbclc_createAccountButton" type="submit">Create Account</button></form>`,
  [SEARCH.split('?')[0]]: `<!doctype html><title>Career Opportunities</title><h2>Search for Openings</h2><label for="k">Keywords</label><input id="k" name="keyword">
    <label><input type="radio" name="kwopt" id="r1">in job title</label><label><input type="radio" name="kwopt" id="r2">in job title or description</label>`,
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await pageWithScripts(browser, pages);
    const scan = () => page.evaluate(() => window.__ask({ type: 'scan' }));

    await page.open(JOB);
    await page.addScriptTag({ path: path.join(__dirname, '../src/capture-sites.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/capture.js') });
    const job = await scan();
    assert.equal(job.site, 'successfactors');
    assert.equal(job.jobPage, true, 'a job page with its Apply button');
    assert.equal(job.context.company, 'Acme');
    assert.equal(job.context.postedAt, '2026-11-09');
    const details = await page.evaluate(() => window.CVAutofillJobDetails.read());
    assert.equal(details.location, 'Vancouver, BC, CA');
    assert.match(details.description, /payment platform/);
    const posting = (await page.evaluate(() => window.__cvCapture())).jsonLd.find(item => item['@type'] === 'JobPosting');
    assert.equal(posting.title, 'Engineer', 'the server gets the posting too');
    assert.equal(posting.hiringOrganization.name, 'Acme');

    await page.open(ACCOUNT);
    const form = await scan();
    assert.equal(form.context.company, 'Acme', 'never the shared host ("Career5")');
    assert.equal(form.passwords, 2);
    const keys = await page.evaluate(() => Object.fromEntries(window.CVAutofillFields.detectFields().found.map(field => [field.element.id, field.key])));
    assert.deepEqual(keys, { fbclc_userName: 'email', fbclc_emailConf: 'email', fbclc_fName: 'firstName', fbclc_lName: 'lastName', fbclc_ituCode: 'phoneCountryCode', fbclc_phoneNumber: 'phone', fbclc_country: 'country' });
    await page.evaluate(() => window.__ask({ type: 'fill', profile: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '6045550100', country: 'Canada' }, answers: [] }));
    assert.deepEqual(await page.evaluate(() => ({ code: fbclc_ituCode.selectedOptions[0].text, country: fbclc_country.selectedOptions[0].text, confirm: fbclc_emailConf.value, alerts: fbclc_emailEnabled.checked })),
      { code: 'CANADA (+1)', country: 'CANADA', confirm: 'sam@example.com', alerts: false });
    assert.equal((await scan()).advance?.text, 'Create Account', 'the panel offers the form’s own button');

    await page.open(SEARCH);
    assert.deepEqual((await scan()).fields.map(field => field.key), [], 'a search form is not an application');
    console.log('PASS SuccessFactors: job page from microdata, Create an Account fields, company name and next button');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
