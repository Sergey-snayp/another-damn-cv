const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Real application forms (saved without scripts by scripts/real-forms.cjs): what each
// field is taken for. Each case is a mistake once made on the live form.
const extension = path.resolve(__dirname, '..');

async function scan(browser, fixture) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  await page.setContent(`<!doctype html>${fs.readFileSync(path.join(__dirname, 'fixtures', fixture), 'utf8')}`);
  await page.evaluate(() => { window.chrome = { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } } }; });
  for (const file of ['src/sites.js', 'src/fields.js']) await page.addScriptTag({ path: path.join(extension, file) });
  const result = await page.evaluate(() => {
    const F = window.CVAutofillFields;
    const { found } = F.detectFields();
    return {
      fields: found.filter((field) => !field.diversity).map((field) => ({ key: field.key, kind: field.kind, label: F.labelOf(field.element) })),
      questions: F.detectQuestions(found).map((question) => question.question),
      missing: F.findMissingRequired(found).map((item) => item.label),
      countries: found.filter((field) => field.countries).map((field) => field.countries),
    };
  });
  await page.close();
  return result;
}
const keyOf = (fields, needle) => fields.find((field) => field.label.includes(needle))?.key ?? null;

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const discord = await scan(browser, 'greenhouse-discord.html');
    assert.equal(keyOf(discord.fields, 'tech company'), null, '"experience at a tech company?" is a question, not Current company');
    assert.equal(keyOf(discord.fields, 'state bar'), null, '"a U.S. state bar?" is not the State field');
    assert.ok(discord.questions.some((question) => /tech company/.test(question)) && discord.questions.some((question) => /state bar/.test(question)));
    for (const key of ['school', 'degree', 'fieldOfStudy']) assert.ok(discord.fields.some((field) => field.key === key), `${key} is found`);

    const gitlab = await scan(browser, 'greenhouse-gitlab.html');
    assert.equal(keyOf(gitlab.fields, "name you'd prefer"), 'preferredName');
    assert.equal(keyOf(gitlab.fields, 'employment agreements'), null, 'a yes/no question naming "your current employer" is not Current company');
    assert.equal(keyOf(gitlab.fields, 'require sponsorship'), 'requiresSponsorship');

    const lever = await scan(browser, 'lever-palantir.html');
    assert.equal(lever.fields.find((field) => field.key === 'location')?.label, 'Current location', 'the title, not the dropdown messages in its label');
    assert.equal(keyOf(lever.fields, 'pronounce'), null, '"How do you pronounce your name?" is not the name');
    assert.equal(keyOf(lever.fields, 'call you'), 'preferredName');
    for (const key of ['workAuthorization', 'requiresSponsorship']) assert.ok(lever.fields.some((field) => field.key === key && field.kind === 'radio'), `${key} is found by its question title`);
    assert.equal(lever.questions.filter((question) => /Language Skill/.test(question)).length, 1, 'a checkbox group is one question');
    assert.equal(lever.missing.filter((label) => /Language Skill/.test(label)).length, 1, 'and one missing field');
    assert.ok(!lever.missing.some((label) => /^cards\[/.test(label)), 'every question has its title');

    const ashby = await scan(browser, 'ashby-quo.html');
    assert.ok(ashby.countries.some((countries) => countries.includes('United States') && countries.includes('Canada')), '"the United States or Canada" names both');
    console.log('PASS real forms: Greenhouse, Lever and Ashby fields are taken for what they ask');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
