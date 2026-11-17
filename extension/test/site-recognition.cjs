const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { pageWithScripts } = require('./panel-fixture.cjs');

// Which job system a page is, on its own domain too: by address, by the system's
// mark in the page (Simplify's embeddedPaths), by its address pattern on any
// host or a query parameter (Jobright's site registry). Synthetic pages.
const pages = {
  // Lululemon's careers site is Avature's, on lululemon.com: its portal meta tags give it away.
  'https://careers.lululemon.com/en_US/careers/ApplicationMethods': `<!doctype html><head><meta name="avature.portal.id" content="4"><meta name="avature.portal.page" content="ApplicationMethods"></head>
    <main><h2>Choose an option to apply</h2><a id="methodButton--file" class="methodButton" role="button" tabindex="0">UPLOAD RESUME</a></main>`,
  // Greenhouse's form embedded on a company's own careers page.
  'https://www.example-company.com/careers/apply': '<!doctype html><main><h1>Apply</h1><label for="n">Name</label><input id="n"></main>',
  // Phenom on a company domain: its page id on <body>.
  'https://careers.example-health.org/us/en/apply': '<!doctype html><body data-ph-id="ph-page-element-page6"><main><h1>Apply</h1></main></body>',
  'https://www.google.com/about/careers/applications/apply/123': '<!doctype html><main><h1>Apply</h1></main>',
  'https://www.google.com/search': '<!doctype html><main><input name="q"></main>',
  'https://www.uber.com/global/en/careers/apply/interstitial/123': '<!doctype html><main><h1>Apply</h1></main>',
  'https://jobs.paycomonline.net/v4/ats/web.php/portal/ABC/jobs/123': '<!doctype html><main><h1>Job</h1></main>',
  'https://www.example-blog.com/': '<!doctype html><main><h1>Blog</h1><a href="https://www.pinpointhq.com">Our partner</a></main>',
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const tab = await pageWithScripts(browser, pages);
    const site = async (url) => { await tab.open(url); return tab.evaluate(() => window.CVAutofillSites.siteForPage()?.name ?? null); };
    assert.equal(await site('https://careers.lululemon.com/en_US/careers/ApplicationMethods'), 'avature', "Avature on Lululemon's own domain, by its portal meta tag");
    const fields = await tab.evaluate(() => window.CVAutofillFields.detectFields().found.map((field) => [field.element.id, field.key]));
    assert.deepEqual(fields, [['methodButton--file', 'resume']], '"UPLOAD RESUME" takes the CV');
    assert.equal(await site('https://www.example-company.com/careers/apply?gh_jid=4567'), 'greenhouse', 'Greenhouse embedded on a company page, by gh_jid');
    assert.equal(await site('https://careers.example-health.org/us/en/apply'), 'phenompeople', "Phenom on a company domain, by its page id");
    assert.equal(await site('https://www.google.com/about/careers/applications/apply/123'), 'google', "Google's own application form");
    assert.equal(await site('https://www.google.com/search'), null, 'Google search is not a job site');
    assert.equal(await site('https://www.uber.com/global/en/careers/apply/interstitial/123'), 'uber', "Uber's careers pages");
    assert.equal(await site('https://jobs.paycomonline.net/v4/ats/web.php/portal/ABC/jobs/123'), 'paycomonline', 'a system only Jobright knew (Paycom)');
    assert.equal(await site('https://www.example-blog.com/'), null, 'a page that only links to Pinpoint is not Pinpoint');
    console.log('PASS site recognition: Avature on its own domain with "UPLOAD RESUME" as the CV, Greenhouse by gh_jid, Phenom by its page id, Google only on its careers pages, Uber careers, Paycom from Jobright');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
