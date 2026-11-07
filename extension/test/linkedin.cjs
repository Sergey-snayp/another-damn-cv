const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
require(require.resolve('ts-node', { paths: [path.resolve(__dirname, '../../backend')] })).register({ project: path.resolve(__dirname, '../../backend/tsconfig.json'), transpileOnly: true });
const { captureSchema } = require('../../backend/src/modules/jobs/adapters/inbound/http/jobs.schemas.ts');
const { JsonLdJobReader } = require('../../backend/src/modules/jobs/adapters/outbound/documents/json-ld-job.reader.ts');

// Synthetic LinkedIn pages and API responses only. No account or live job is changed.
const extension = path.resolve(__dirname, '..');
const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=engineer';
const description = '<h2>Requirements</h2><p>Build reliable payments services in Node.js and TypeScript. Own the systems from design to delivery and work closely with our product team.</p>';
const details = (id = '111', title = 'Senior Backend Engineer', company = 'Acme') => `
  <section class="jobs-search__job-details--container" data-job-id="${id}">
    <header class="job-details-jobs-unified-top-card">
      <h2 class="job-details-jobs-unified-top-card__job-title"><a href="/jobs/view/${id}">${title}</a></h2>
      <div class="job-details-jobs-unified-top-card__company-name"><a href="/company/acme">${company}</a></div>
      <div class="job-details-jobs-unified-top-card__primary-description-container"><span class="tvm__text--low-emphasis">Toronto, ON (Hybrid)</span> · 2 days ago · 100 applicants</div>
      <a href="/company/acme"><img width="80" height="80" alt="${company}" data-delayed-url="https://media.licdn.com/company-logo.png"></a>
      <div class="job-details-jobs-unified-top-card__job-insight">Full-time · $120,000 – $150,000 per year</div>
    </header>
    <div id="job-details">${description}<p id="expanded" hidden>Design GraphQL APIs backed by PostgreSQL. Deploy Docker services and improve observability.</p></div>
    <button class="jobs-description__footer-button" aria-expanded="false" onclick="this.previousElementSibling.querySelector('[hidden]')?.removeAttribute('hidden'); this.setAttribute('aria-expanded', 'true')">See more</button>
    <aside class="similar-jobs">Unrelated recommendation: Python Django Redis. $250,000 – $300,000 per year. Part-time.</aside>
  </section>`;
const layout = pane => `<!doctype html><title>Jobs | LinkedIn</title><nav>Messages and account</nav><main><h1>Jobs</h1>
  <aside><h2>Frontend Developer at Globex</h2><p>React Vue Angular Java Kotlin</p></aside>${pane}</main>`;
const posting = (id, title = 'Senior Backend Engineer', company = 'Acme') => ({
  '@type': 'JobPosting', url: `https://www.linkedin.com/jobs/view/${id}`, title,
  hiringOrganization: { name: company }, datePosted: '2026-11-04', description: '<p>Short structured copy.</p>',
});
const jsonLd = value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
let panel;

async function pageFixture(browser, html, url = searchUrl, publicHtml = null) {
  const page = await browser.newPage();
  page.publicReads = 0;
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/jobs-guest/jobs/api/jobPosting/')) {
      page.publicReads++;
      void request.respond({ status: publicHtml ? 200 : 404, contentType: 'text/html; charset=utf-8', body: publicHtml || '' });
    }
    else if (request.isNavigationRequest() && request.frame() === page.mainFrame()) void request.respond({ contentType: 'text/html; charset=utf-8', body: html });
    else void request.respond({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>' });
  });
  await page.exposeFunction('notifyPanel', async () => {
    if (panel && !panel.isClosed()) await panel.evaluate(() => window.__listeners.forEach(listener => listener({ type: 'job-context-changed' }, { tab: { id: 1 }, frameId: 0 })));
  });
  await page.evaluateOnNewDocument(() => {
    window.__messages = []; window.__listeners = [];
    window.chrome = {
      runtime: {
        id: 'test', getURL: file => file.endsWith('.css') ? 'data:text/css,' : file.endsWith('.html') ? 'data:text/html,<p>Panel fixture</p>' : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        onMessage: { addListener: listener => window.__listeners.push(listener) },
        sendMessage: async message => { window.__messages.push(message); if (message.type === 'job-context-changed') await window.notifyPanel(); return {}; },
      },
      storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
    };
    window.__ask = message => new Promise(resolve => {
      for (const listener of window.__listeners) listener(message, { url: chrome.runtime.getURL('src/sidepanel.html') }, resolve);
    });
  });
  await page.goto(url);
  const scripts = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'))).content_scripts.find(entry => entry.js.includes('src/content.js')).js;
  for (const file of scripts) await page.addScriptTag({ path: path.join(extension, file) });
  for (const file of ['src/capture-sites.js', 'src/capture.js']) await page.addScriptTag({ path: path.join(extension, file) });
  return page;
}
const capture = page => page.evaluate(() => window.__cvCapture());
const scan = page => page.evaluate(() => window.__ask({ type: 'scan' }));

async function panelFixture(browser, jobPage) {
  const page = await browser.newPage();
  await page.exposeFunction('readJobPage', message => jobPage.evaluate(message => window.__ask(message), message));
  await page.exposeFunction('captureJobPage', () => capture(jobPage));
  await page.exposeFunction('executeJobScript', source => jobPage.evaluate(source => (0, eval)(`(${source})`)(), source));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const file = path.join(extension, new URL(request.url()).pathname);
    if (request.url().startsWith('http://extension.test/') && fs.existsSync(file)) {
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'image/png';
      void request.respond({ contentType, body: fs.readFileSync(file) });
    } else void request.respond({ status: 404, body: '' });
  });
  await page.evaluateOnNewDocument(url => {
    window.__listeners = []; window.__requests = []; window.__opened = [];
    const store = { auth: { syncToken: 'fixture', user: { name: 'Sam Lee', email: 'sam@example.com' } }, profile: {}, chosenResumeId: 'cv1' };
    const event = { addListener() {}, removeListener() {} };
    window.chrome = {
      runtime: { id: 'test', getURL: file => `http://extension.test/${file}`, getManifest: () => ({ version: 'test' }), onMessage: { addListener: listener => window.__listeners.push(listener) }, sendMessage: async message => message.type === 'panel-tab' ? { tabId: 1 } : {} },
      storage: { local: { get: async keys => Object.fromEntries([].concat(keys ?? Object.keys(store)).filter(key => key in store).map(key => [key, store[key]])), set: async value => Object.assign(store, value), remove: async keys => [].concat(keys).forEach(key => delete store[key]) }, onChanged: event },
      tabs: { get: async () => ({ id: 1, url }), sendMessage: async (_, message) => window.readJobPage(message), onUpdated: event, create: async options => window.__opened.push(options.url) },
      scripting: { executeScript: async ({ func }) => {
        if (!func) return [];
        if (window.__captureFailure) { const message = window.__captureFailure; window.__captureFailure = ''; throw new Error(message); }
        return [{ result: await window.executeJobScript(func.toString()) }];
      } },
      permissions: { request: async () => true },
      windows: { getCurrent: async () => ({ width: 1400, height: 900 }), create: async options => { window.__opened.push(options.url); return { id: 7 }; }, onRemoved: event },
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (address, options = {}) => {
      if (!String(address).startsWith('http://localhost:3001/')) return nativeFetch(address, options);
      const pathname = new URL(address).pathname;
      window.__requests.push({ path: pathname, method: options.method ?? 'GET', ...(options.body && { body: JSON.parse(options.body) }) });
      let body = {};
      if (pathname === '/api/extension/resumes') body = [{ id: 'cv1', name: 'Sam Lee CV', isPrimary: true, updatedAt: '2026-11-06' }];
      else if (pathname === '/api/extension/resumes/cv1/text') body = { id: 'cv1', text: 'Node.js TypeScript PostgreSQL Docker' };
      else if (pathname.startsWith('/api/extension/profile/career')) body = { experiences: [], educations: [], skills: [], fields: {} };
      else if (pathname === '/api/extension/defaults') body = [];
      else if (pathname === '/api/jobs/lookup') body = { job: null };
      else if (pathname === '/api/jobs/capture') {
        const input = JSON.parse(options.body);
        body = { job: { id: `saved-${input.url.split('/').pop()}`, title: input.hints.title, company: input.hints.company }, created: true };
      }
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    };
  }, jobPage.url());
  await page.goto('http://extension.test/src/sidepanel.html');
  return page;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await pageFixture(browser, layout(details()) + jsonLd({ '@graph': [posting('999', 'Wrong role', 'Wrong company'), posting('111')] }));
    const before = await scan(page);
    assert.equal(before.context.title, 'Senior Backend Engineer');
    assert.equal(before.context.company, 'Acme');
    assert.equal(before.context.jobUrl, 'https://www.linkedin.com/jobs/view/111');
    assert.equal(before.fields.length, 0);
    assert.equal(await page.evaluate(() => CVAutofillPanel.isOpen()), true, 'a posting opens the panel even without an application form');
    const found = await capture(page);
    assert.equal(found.url, before.context.jobUrl);
    assert.match(found.text, /GraphQL APIs backed by PostgreSQL/);
    assert.match(found.html, /GraphQL APIs backed by PostgreSQL/);
    assert.doesNotMatch(found.text + found.html, /Globex|Wrong company|similar-jobs|Python|React Vue|Messages and account/);
    assert.equal(found.jsonLd.length, 1);
    assert.equal(found.jsonLd[0].url, found.url);
    assert.match(found.jsonLd[0].description, /GraphQL/);
    const parsed = captureSchema.parse(found);
    const backendJob = new JsonLdJobReader().read(parsed.jsonLd);
    assert.equal(backendJob.title, 'Senior Backend Engineer');
    assert.equal(backendJob.company, 'Acme');
    assert.match(backendJob.description, /GraphQL/);
    assert.doesNotMatch(backendJob.description, /Python|Globex/);
    const form = await page.evaluate(() => window.__ask({ type: 'job-details' }));
    assert.equal(form.location, 'Toronto, ON (Hybrid)');
    assert.equal(form.salaryMin, 120000, JSON.stringify({ form, text: found.text }));
    assert.equal(form.salaryMax, 150000);
    assert.equal(form.employmentType, 'Full-time');
    assert.equal(form.url, found.url);
    assert.match(form.description, /GraphQL/);
    console.log('PASS: selected search result, expanded description, matching JSON-LD, job form and automatic opening');

    panel = await panelFixture(browser, page);
    await panel.waitForSelector('[data-tailor="quick"]');
    await panel.waitForSelector('.resume-match');
    assert.match(await panel.$eval('#resume-keywords', node => node.textContent), /GraphQL/);
    assert.doesNotMatch(await panel.$eval('#resume-keywords', node => node.textContent), /Python|Django|React|Angular/);
    assert.match(await panel.$eval('#job-card', node => node.textContent), /Senior Backend Engineer.*Acme/s);
    assert.doesNotMatch(await panel.$eval('#panel-autofill', node => node.textContent), /No application fields found/);
    await panel.click('[data-tailor="quick"]');
    await panel.waitForFunction(() => window.__opened.length === 1);
    const requests = await panel.evaluate(() => window.__requests);
    assert.match(await panel.evaluate(() => window.__opened[0]), /\/popup\/jobs\/saved-111\/quick-tailor\?from=cv1$/);
    assert.match(requests.find(request => request.path === '/api/jobs/capture').body.text, /GraphQL/);
    assert.ok(!requests.some(request => request.method === 'POST' && /\/resumes(?:\/|$)/.test(request.path)), 'opening Quick Tailor creates no CV or PDF');
    console.log('PASS: real panel analyzes the selected job and opens the existing unsaved Quick Tailor flow');

    await page.evaluate(html => { document.querySelector('.jobs-search__job-details--container').outerHTML = html; }, details('222', 'Platform Engineer', 'Beta'));
    await panel.waitForFunction(() => document.getElementById('job-card')?.textContent.includes('Platform Engineer'));
    await panel.click('[data-tailor="quick"]');
    await panel.waitForFunction(() => window.__opened.length === 2);
    assert.match(await panel.evaluate(() => window.__opened[1]), /\/jobs\/saved-222\/quick-tailor/);
    assert.equal((await scan(page)).context.jobUrl, 'https://www.linkedin.com/jobs/view/222');
    console.log('PASS: switching jobs without changing the search URL refreshes the panel, analysis and tailoring target');

    await page.evaluate(() => {
      document.querySelector('.jobs-search__job-details--container').dataset.jobId = '333';
      const title = document.querySelector('.job-details-jobs-unified-top-card__job-title a');
      title.href = '/jobs/view/333'; title.firstChild.nodeValue = 'Customer Support Specialist';
      document.getElementById('job-details').innerHTML = '<p>Help customers solve problems, communicate clearly, and collaborate with colleagues. Bring empathy, patience, and practical experience supporting people.</p>';
    });
    await panel.waitForFunction(() => document.getElementById('job-card')?.textContent.includes('Customer Support Specialist'));
    assert.ok(await panel.$('[data-tailor="quick"]'), 'tailoring is available without three recognized technical skills');
    await panel.click('[data-tailor="full"]');
    await panel.waitForFunction(() => window.__opened.length === 3);
    assert.match(await panel.evaluate(() => window.__opened[2]), /\/documents\/cv1\?job=saved-333$/);
    console.log('PASS: descriptions without technical keywords still open Full Tailoring');
    await panel.close(); panel = null;

    await page.evaluate(() => history.pushState({}, '', '/jobs/search/?currentJobId=555'));
    assert.equal((await scan(page)).context.isJobPosting, undefined);
    await assert.rejects(capture(page), /description/);
    await page.close();
    console.log('PASS: URL/DOM transitions cannot capture the previous job under the next job ID');

    const changing = await pageFixture(browser, layout(details()));
    await changing.evaluate(() => document.querySelector('.jobs-description__footer-button').onclick = () => {
      document.querySelector('.jobs-search__job-details--container').dataset.jobId = '222';
      document.querySelector('.job-details-jobs-unified-top-card__job-title a').href = '/jobs/view/222';
    });
    await assert.rejects(capture(changing), /changed while it was being read/);
    await changing.close();
    console.log('PASS: changing the selection during expansion cancels the capture');

    const publicPage = await pageFixture(browser, layout(`<section class="core-rail"><section class="top-card-layout"><h1 class="topcard__title">Data Engineer</h1><a class="topcard__org-name-link">Public Co</a><span class="topcard__flavor--bullet">Vancouver, BC</span></section><section class="description"><div class="description__text"><div class="show-more-less-html__markup">${description}</div></div><ul class="description__job-criteria-list"><li>Employment type <span>Contract</span></li></ul></section><aside>Wrong Python recommendation</aside></section>`), 'https://ca.linkedin.com/jobs/view/data-engineer-at-public-co-444?trk=public_jobs');
    const publicCapture = await capture(publicPage);
    assert.equal(publicCapture.url, 'https://www.linkedin.com/jobs/view/444');
    assert.equal(publicCapture.hints.company, 'Public Co');
    assert.equal(publicCapture.hints.location, 'Vancouver, BC');
    assert.doesNotMatch(publicCapture.text + publicCapture.html, /Wrong Python/);
    await publicPage.close();
    console.log('PASS: public and regional LinkedIn job pages work without JSON-LD');

    const modernUrl = 'https://www.linkedin.com/jobs/search-results/?currentJobId=4486197628&keywords=Node.JS';
    const modern = await pageFixture(browser, `<!doctype html><title>Node.JS Jobs | LinkedIn</title><main><h1>Jobs</h1>
      <ul><li><a href="/jobs/view/4486197628">Senior Software Engineer</a><img alt="Conexiom company logo" width="60" height="60"><p>Conexiom</p><p>Vancouver, BC</p></li>
      <li><a href="/jobs/view/999">Different role</a><p>Python Django Redis</p></li></ul>
      <div class="generated-781"><section><h2>Almost There</h2><p>Premium match: Java Kotlin Swift Angular</p></section>
      <section id="modern-description" class="generated-448"><div><p><span>About the job</span></p></div><div aria-hidden="true">
      <p>We build customer-facing applications and intelligent services. Bring production experience in Node.js, TypeScript, React and Azure, and collaborate with our product and engineering teams.</p>
      <p id="modern-more" hidden>Requirements: PostgreSQL, Docker and GraphQL. Build reliable integrations and mentor other engineers.</p>
      <span role="button" tabindex="0" aria-expanded="false" onclick="document.getElementById('modern-more').hidden=false; this.setAttribute('aria-expanded','true'); this.textContent='less'">… more</span>
      </div></section><section><h2>Similar jobs</h2><p>Unrelated PHP Laravel Ruby vacancy</p></section></div></main>`, modernUrl);
    const modernCapture = await capture(modern);
    assert.equal(modernCapture.url, 'https://www.linkedin.com/jobs/view/4486197628');
    assert.equal(modernCapture.hints.title, 'Senior Software Engineer');
    assert.equal(modernCapture.hints.company, 'Conexiom');
    assert.match(modernCapture.description, /PostgreSQL, Docker and GraphQL/);
    assert.doesNotMatch(modernCapture.description + modernCapture.text, /Almost There|Premium|Java Kotlin|Python Django|PHP Laravel|Similar jobs/);
    panel = await panelFixture(browser, modern);
    await panel.waitForSelector('.resume-match');
    assert.equal(await panel.$('.job-description-card, [data-read-description], [data-analyze-description]'), null, 'automatic reading adds no card or buttons');
    assert.match(await panel.$eval('#resume-keywords', node => node.textContent), /GraphQL/);
    assert.doesNotMatch(await panel.$eval('#resume-keywords', node => node.textContent), /Python|Kotlin|PHP|Django/);
    assert.ok(!(await panel.evaluate(() => window.__requests)).some(request => request.method === 'POST'), 'automatic reading creates no jobs, CVs or PDFs');
    await panel.setViewport({ width: 420, height: 950 });
    await panel.screenshot({ path: '/private/tmp/job-agent-linkedin-automatic.png', fullPage: true });
    await panel.evaluate(() => {
      window.__captureFailure = 'The selected description is still loading.';
      window.__listeners.forEach(listener => listener({ type: 'job-context-changed' }, { tab: { id: 1 }, frameId: 0 }));
    });
    await panel.waitForFunction(() => !document.querySelector('.resume-match'));
    await panel.waitForSelector('.resume-match');
    assert.equal(await panel.$('.job-description-card, [data-read-description], [data-analyze-description]'), null);
    await panel.close(); panel = null; await modern.close();
    console.log('PASS: automatic search-results analysis and retry use the existing Resume card without new controls');

    const publicHtml = process.env.LINKEDIN_PUBLIC_HTML ? fs.readFileSync(process.env.LINKEDIN_PUBLIC_HTML, 'utf8') : '<section class="top-card-layout"><h2 class="topcard__title">Senior Software Engineer</h2><a class="topcard__org-name-link">Conexiom</a><span class="topcard__flavor--bullet">Vancouver, BC</span></section><div class="show-more-less-html__markup"><p>Build reliable customer-facing applications and intelligent services with Node.js and TypeScript. Work with product teams to design and operate production applications, including React, Azure and modern AI systems.</p></div>';
    const missing = await pageFixture(browser, '<main><h1>Jobs</h1><div>Loading the selected job…</div></main>', modernUrl, publicHtml);
    panel = await panelFixture(browser, missing);
    await panel.waitForSelector('.resume-match');
    await panel.waitForFunction(() => document.getElementById('job-card')?.textContent.includes('Conexiom'));
    assert.equal(await panel.$('.job-description-card, [data-read-description], [data-analyze-description]'), null);
    const recovered = await capture(missing);
    assert.equal(recovered.hints.company, 'Conexiom');
    assert.equal(recovered.url, 'https://www.linkedin.com/jobs/view/4486197628');
    assert.match(recovered.description, /Node\.js|NodeJS/i);
    assert.match(recovered.description, /TypeScript/);
    assert.equal(missing.publicReads, 1, 'concurrent automatic readers reuse the public posting rather than fetching again');
    assert.ok(!(await panel.evaluate(() => window.__requests)).some(request => request.method === 'POST'));
    await panel.close(); panel = null; await missing.close();
    console.log('PASS: inaccessible signed-in content falls back to the selected public Conexiom posting automatically');

    const hybrid = await pageFixture(browser, layout(`<ul><li><a href="/jobs/view/111">Senior Backend Engineer</a><p>Acme</p><p>Toronto, ON</p></li></ul><div class="scaffold-layout__detail"><h1>Senior Backend Engineer</h1><div id="job-details">${description}</div></div>`), 'https://www.linkedin.com/jobs/search-results/?currentJobId=111');
    const hybridCapture = await capture(hybrid);
    assert.equal(hybridCapture.hints.company, 'Acme');
    assert.match(hybridCapture.description, /reliable payments services/);
    await hybrid.close();
    console.log('PASS: mixed LinkedIn layouts can read descriptions when company header classes change');

    const structured = await pageFixture(browser, layout(details()) + jsonLd({ ...posting('111'), description }));
    await structured.evaluate(() => document.getElementById('job-details').replaceChildren());
    const structuredCapture = await capture(structured);
    assert.match(structuredCapture.html, /reliable payments services/);
    assert.match(new JsonLdJobReader().read(captureSchema.parse(structuredCapture).jsonLd).description, /reliable payments services/);
    await structured.close();
    console.log('PASS: matching structured descriptions remain readable while the description element is empty');

    for (const [url, html] of [
      [searchUrl, layout('<aside class="jobs-search-results-list">Python Docker Node.js jobs. Select a result.</aside>')],
      ['https://www.linkedin.com/jobs/view/111', '<h1>Join LinkedIn to see this job</h1><form><input type="password"></form>'],
      ['https://www.linkedin.com/feed/', layout(details())],
    ]) {
      const empty = await pageFixture(browser, html, url);
      await assert.rejects(capture(empty), /description|Open a LinkedIn job/);
      assert.equal(await empty.evaluate(() => CVAutofillPanel.isOpen()), false);
      await empty.close();
    }
    console.log('PASS: search lists, login screens and the feed are not analyzed as job descriptions');
  } finally {
    // Chrome's crash reporter can inherit these pipes after the browser exits.
    // Close the test-owned streams so it cannot keep the runner alive.
    browser.process()?.stdout?.destroy();
    browser.process()?.stderr?.destroy();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
