const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// "Company", "employer" and "title" in a question do not make it the person's
// current job, and "Company website" is not the person's website. Synthetic form.
const URL = 'https://jobs.lever.co/acme/2/apply';
const expected = {
  Company: 'currentCompany', 'Company name': 'currentCompany', 'Company *': 'currentCompany', 'Current company': 'currentCompany',
  Employer: 'currentCompany', 'Current employer': 'currentCompany', 'Most recent employer': 'currentCompany', 'Name of your employer': 'currentCompany',
  'What is your current company?': 'currentCompany', 'Company / Organization': 'currentCompany',
  Title: 'currentTitle', 'Job title': 'currentTitle', 'Current job title': 'currentTitle', 'Current role': 'currentTitle', 'What is your current title?': 'currentTitle',
  'Why do you want to join our company?': null, 'What interests you about this company?': null, 'Which company do you admire most?': null,
  'Previous employer': null, 'Former company': null, 'Employer contact permission': null, 'Why are you leaving your current employer?': null,
  'Company question number 3': null, 'Company website': null, 'Company email': null, 'Employer phone': null,
  'Desired job title': null, 'Previous job title': null, 'Title of your best project': null,
  // The rule is about these words only: other fields read as before.
  Email: 'email', Website: 'website', Phone: 'phone',
};
const labels = Object.keys(expected);
const html = `<!doctype html><h1>Apply</h1><form>${labels.map((label, i) => `<label for="f${i}">${label}</label><input id="f${i}">`).join('')}</form>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await pageWithScripts(browser, { [URL]: html });
    await page.open(URL);
    const keys = await page.evaluate(() => Object.fromEntries(window.CVAutofillFields.detectFields().found.map(field => [field.element.id, field.key])));
    assert.deepEqual(Object.fromEntries(labels.map((label, i) => [label, keys[`f${i}`] ?? null])), expected);
    console.log('PASS company, employer and title count only when the label just names the field');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
