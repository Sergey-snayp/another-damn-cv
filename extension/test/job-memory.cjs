const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts, panelFixture } = require('./panel-fixture.cjs');

// A later step of an application that names no job and links to no job page
// (Lululemon's Avature form after sign-in). As Simplify keeps one job per tab:
// the job this tab already found is still the job here, with its saved logo
// and description. A page with another job number is never given it.
const JOB = 'https://careers.lululemon.com/en_US/careers/JobDetail/Staff-Software-Engineer-Digital-Engineering/65847';
const STEP = 'https://careers.lululemon.com/en_US/careers/ApplicationForm/more';
const OTHER = 'https://careers.lululemon.com/en_US/careers/ApplicationForm?jobId=99999';
const form = `<!doctype html><head><meta name="avature.portal.id" content="4"><link rel="icon" href="/black-logo.png"></head><h1>More about me</h1><form>
  <label for="first">First Name</label><input id="first"><label for="last">Last Name</label><input id="last"><label for="mail">Email</label><input id="mail" type="email"></form>`;
const saved = {
  id: 'lulu', title: 'Staff Software Engineer - Digital Engineering', company: 'Lululemon', url: JOB, canonicalUrl: JOB,
  companyLogo: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22%3E%3Crect width=%2210%22 height=%2210%22 fill=%22red%22/%3E%3C/svg%3E',
  description: 'As a Staff Software Engineer you will lead the architecture of our digital platforms. '.repeat(8), history: [],
};
const remembered = { 'tabJob:1': { host: 'careers.lululemon.com', posting: '65847', jobId: 'lulu' } };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, { [STEP]: form, [OTHER.split('?')[0]]: form });
    await tab.open(STEP);
    const server = { login: null, saves: [], requests: [], lookup: () => null, jobs: { lulu: saved } };
    const panel = await panelFixture(browser, tab, { profile: { firstName: 'Sergey' }, server, session: { ...remembered } });
    await panel.waitForSelector('#job-card.is-saved', { timeout: 15000 });
    assert.equal(await panel.$eval('.company-avatar img', (image) => image.getAttribute('src')), saved.companyLogo, 'the saved job’s logo, not this page’s');
    // The keyword match reads the saved description, as this step has none.
    for (let waited = 0; !server.requests.includes('job lulu') && waited < 10000; waited += 200) await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(server.requests.includes('job lulu'), `the saved job’s description was asked for (${server.requests.join(', ')})`);
    await panel.close();

    // Another job number on the same site: not that job.
    await tab.open(OTHER);
    const other = { login: null, saves: [], requests: [], lookup: () => null, jobs: { lulu: saved } };
    const otherPanel = await panelFixture(browser, tab, { profile: { firstName: 'Sergey' }, server: other, session: { ...remembered } });
    await otherPanel.waitForSelector('#job-card', { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(await otherPanel.$('#job-card.is-saved'), null, 'job 99999 is not job 65847');
    console.log('PASS a form step with no job number keeps the tab’s job: its saved logo and its saved description for the match; another job number does not get it');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
