#!/usr/bin/env node
/**
 * Runs the extension's scanner and filler on live application forms and reports
 * what was recognized, what was filled and stayed filled, and which required
 * fields are still empty. Nothing is submitted: the page is only read and typed
 * into, in a headless browser that is closed afterwards.
 *
 *   node scripts/real-forms.cjs                     # every form in FORMS
 *   node scripts/real-forms.cjs <url> [--save name] # one form; --save keeps its markup as a test fixture
 *
 * Live postings close, so this is a tool, not a test. Forms worth keeping are
 * saved under test/fixtures and checked by the normal tests.
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

const extension = path.resolve(__dirname, '..');
const FORMS = [
  ['Ashby (Quo)', 'https://jobs.ashbyhq.com/quo/bd7daa98-0de4-402a-ba44-db953221bc58/application'],
  ['Greenhouse (Discord)', 'https://job-boards.greenhouse.io/discord/jobs/8917177002'],
  ['Greenhouse (GitLab)', 'https://job-boards.greenhouse.io/gitlab/jobs/8638232002'],
  ['Lever (Palantir)', 'https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply'],
  ['Lever (Spotify)', 'https://jobs.lever.co/spotify/2a55d6c9-c564-443a-be3e-a3851db5a93b/apply'],
];
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64')}`;
/** A full test profile, with the keys the panel sends. */
const PROFILE = {
  firstName: 'Sergey', lastName: 'Proniuk', fullName: 'Sergey Proniuk', preferredName: 'Sergey',
  email: 'sergey.test@example.com', phone: '+1 672 555 0134',
  location: 'Vancouver, BC, Canada', city: 'Vancouver', state: 'British Columbia', country: 'Canada', postalCode: 'V5K 0A1',
  linkedin: 'https://www.linkedin.com/in/example', github: 'https://github.com/example', website: 'https://example.dev', portfolio: 'https://example.dev',
  currentCompany: 'Ciklum', currentTitle: 'Senior Software Engineer', yearsExperience: '7',
  school: 'Dnipro Institute of Infrastructure and Transport', degree: "Bachelor's", fieldOfStudy: 'Computer Science', graduationYear: '2016',
  salaryExpectation: '150000', noticePeriod: '2 weeks',
  workAuthorization: 'Yes', requiresSponsorship: 'No', willingToRelocate: 'Yes',
  eligibility: { workAuthorization: 'Yes', requiresSponsorship: 'No' },
  resumeDataUrl: PDF, resumeFileName: 'Sergey_Proniuk_CV.pdf',
  coverLetterDataUrl: PDF, coverLetterFileName: 'Sergey_Proniuk_Cover_Letter.pdf', coverLetterText: 'Dear Hiring Manager, I would like to apply.',
  heardAbout: 'LinkedIn', acknowledgeRequired: false, offKeys: {},
};

async function check(browser, name, url, save) {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setViewport({ width: 1400, height: 900 });
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (error) { console.log(`\n## ${name}\n  could not open: ${error.message}`); await page.close(); return null; }
  await page.waitForSelector('input[type="email"], input[type="file"], input[name*="email" i]', { timeout: 20000 }).catch(() => {});
  if (save) fs.writeFileSync(path.join(extension, 'test/fixtures', `${save}.html`), `<!-- ${name}: ${url} (saved without scripts for field-detection tests) -->\n${(await page.evaluate(() => document.body.outerHTML)).replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<iframe\b[\s\S]*?<\/iframe>/g, '')}`);
  await page.evaluate(() => {
    window.chrome = { storage: { local: { get: async () => ({ fillMarks: false, animateFill: false }), set: async () => {} }, onChanged: { addListener() {} } } };
  });
  for (const file of ['src/page-world.js', 'src/site-fields.js', 'src/sites.js', 'src/fields.js', 'src/filler.js', 'src/marks.js']) await page.addScriptTag({ path: path.join(extension, file) });
  const report = await page.evaluate(async (profile) => {
    const F = window.CVAutofillFields;
    const { found } = F.detectFields();
    const label = (element) => F.labelOf(element).slice(0, 70);
    const before = found.map((field) => ({ key: field.key, kind: field.kind, label: label(field.element) }));
    const questions = F.detectQuestions(found).map((question) => `${question.kind}: ${question.question.slice(0, 70)}`);
    const { filled, failures } = await window.CVAutofillFiller.fillAll(found, profile);
    await new Promise((resolve) => setTimeout(resolve, 1500)); // Let React re-render and comboboxes settle.
    const after = F.detectFields().found;
    const value = (field) => (field.kind === 'file' ? field.element.files?.[0]?.name ?? ''
      : field.kind === 'pick' ? field.element.dataset.adcvPicked ?? '' : field.kind === 'drop' ? (F.zoneDone(field.element) ? 'uploaded' : '')
        : F.currentAnswer(field.element, window.CVAutofillFiller.controlKind(field.element)));
    const seen = new Set();
    const fields = after.filter((field) => { const id = `${field.key}|${label(field.element)}`; if (seen.has(id)) return false; seen.add(id); return true; })
      .map((field) => ({ key: field.key, kind: field.kind, label: label(field.element), value: String(value(field) ?? '').slice(0, 50) }));
    return { before: before.length, filled, failures, fields, questions, missing: F.findMissingRequired(after).map((item) => item.label.slice(0, 80)) };
  }, PROFILE);
  await page.screenshot({ path: `/private/tmp/real-form-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {});
  await page.close();
  console.log(`\n## ${name}\n  ${url}`);
  console.log(`  recognized ${report.fields.length} fields, filled ${report.filled}${report.failures.length ? `, failures: ${report.failures.join(' | ')}` : ''}`);
  for (const field of report.fields) console.log(`  ${field.value ? 'OK   ' : 'EMPTY'} ${field.key.padEnd(20)} ${field.kind.padEnd(9)} ${field.label}${field.value ? ` = ${field.value}` : ''}`);
  if (report.questions.length) console.log(`  company questions: ${report.questions.join(' | ')}`);
  if (report.missing.length) console.log(`  required and still empty: ${report.missing.join(' | ')}`);
  return report;
}

(async () => {
  const args = process.argv.slice(2);
  const save = args.includes('--save') ? args[args.indexOf('--save') + 1] : null;
  const url = args.find((arg) => /^https?:/.test(arg));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const [name, address] of url ? [['Form', url]] : FORMS) await check(browser, name, address, save);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
