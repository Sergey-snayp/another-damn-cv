const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// The full editor's Design tab: every setting changes the CV at once, is saved with
// it, and prints the same (the PDF page uses the saved design). Synthetic data.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [], themes = [];
    const resume = {
      contact: { lineageId: 'c', firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
      summaries: { default: 'Backend engineer.' },
      experiences: [{ lineageId: 'e1', company: 'Acme', title: 'Engineer', from: '2023-01', to: null, current: true, location: 'Vancouver, BC, Canada', position: 0,
        achievements: [{ lineageId: 'a1', experienceLineageId: 'e1', bullet: 'Built Node.js services.', position: 0 }] }],
      educations: [{ lineageId: 'ed1', institution: 'Original University', degree: 'BSc', field: 'Computer Science', from: '2013-09', to: '2017-06', position: 0 }], projects: [], certifications: [], customSections: [],
      skills: [{ lineageId: 's1', name: 'TypeScript', category: 'Core', position: 0 }, { lineageId: 's2', name: 'Node.js', category: 'Core', position: 1 }],
    };
    // Saved before the Design panel (no version): its font size and line height were never chosen.
    let saved = { template: 'professional', accent: '#000000', fontFamily: 'Roboto, Arial, sans-serif', fontSize: 12, lineHeight: 1.6, sectionGap: 12 };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const p = new URL(request.url()).pathname;
      if (!p.startsWith('/api/')) return void request.continue();
      const reply = value => void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      if (p === '/api/auth/me') return reply({ id: 'o', name: 'Sam Lee', email: 's@e.com' });
      if (p === '/api/resumes') return reply([{ id: 'r1', name: 'CV', updatedAt: '2026-11-15T00:00:00Z' }]);
      if (p === '/api/resumes/r1') return reply(resume);
      if (p === '/api/print/resumes/r1') return reply({ resume, theme: saved });
      if (p === '/api/resumes/r1/theme') {
        if (request.method() === 'PUT') { saved = JSON.parse(request.postData()); themes.push(saved); return reply({ theme: saved }); }
        return reply({ theme: saved });
      }
      if (p === '/api/profile/career') return reply({ revision: 1, data: {} });
      if (p === '/api/resumes/r1/save') return reply(JSON.parse(request.postData()));
      return reply([]);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents/r1`);
    const cv = '.studio-zoom .page';
    await page.waitForSelector(`${cv} [data-section="experience"]`);
    const style = (selector, property, pseudo = null) => page.$eval(selector, (node, property, pseudo) => getComputedStyle(node, pseudo)[property], property, pseudo);
    const px = async (selector, property) => Math.round(parseFloat(await style(selector, property)) * 100) / 100;
    assert.equal(await px(cv, 'fontSize'), 13.33, 'an old design\'s font size (12pt) is not brought back: 10pt');

    await page.evaluate(() => [...document.querySelectorAll('.studio-tabs button')].find(button => button.textContent === 'Design').click());
    await page.waitForSelector('.design-panel');
    assert.deepEqual(await page.$$eval('.dp-group > h3 button', buttons => buttons.map(button => `${button.textContent}:${button.getAttribute('aria-expanded')}`)),
      ['Template:false', 'Section Order & Display:false', 'Layout:false', 'Typography:false', 'Content Format:false'], 'every group starts closed');
    const openGroup = title => page.evaluate(title => [...document.querySelectorAll('.dp-group > h3 button')].find(button => button.textContent === title).click(), title);
    const choose = (label, text) => page.evaluate((label, text) => {
      const field = [...document.querySelectorAll('.dp-field')].find(node => node.querySelector('.dp-label')?.textContent === label);
      [...field.querySelectorAll('.dp-choice')].find(button => button.textContent.includes(text)).click();
    }, label, text);
    const toggle = label => page.evaluate(label => [...document.querySelectorAll('.dp-toggle')].find(node => node.textContent.trim() === label).click(), label);

    // Typography
    await openGroup('Typography');
    await page.select('.dp-field select', 'Georgia, serif');
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).fontFamily.startsWith('Georgia'), {}, cv);
    const sizeSelect = await page.$$('.dp-field select');
    await sizeSelect[1].select('11');
    await page.waitForFunction(selector => Math.abs(parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) - 14.67) < 0.01, {}, cv);
    await page.focus('.dp-range');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('.dp-value', node => node.textContent), '1.4');
    assert.equal(await px(cv, 'lineHeight'), 20.53, 'the line height follows the slider: 11pt × 1.4');
    assert.equal(await px(`${cv} [data-section="experience"] .doc-bullets li`, 'lineHeight'), 20.53, 'bullets too');
    assert.equal(await px(`${cv} .doc-contact`, 'lineHeight'), 24.93, 'the contact line too, 0.3 roomier: 11pt × 1.7');
    assert.equal(await style(`${cv} .doc-head h1`, 'textTransform'), 'uppercase');
    await toggle('Full Name Capitalization');
    assert.equal(await style(`${cv} .doc-head h1`, 'textTransform'), 'none', 'the name without capitals');

    // Layout
    await openGroup('Layout');
    await choose('Header Alignment', 'Left');
    assert.equal(await style(`${cv} .doc-head`, 'textAlign'), 'left');
    await choose('Margins', 'Wide');
    assert.equal(await style(cv, 'paddingLeft'), '72px', 'wide margins: 0.75in');
    await choose('Page Size', 'Letter');
    assert.equal(await page.$eval(cv, node => node.offsetWidth), 816, 'Letter is 8.5in wide');

    // Content Format
    await openGroup('Content Format');
    const roleline = () => page.$eval(`${cv} .doc-role .doc-roleline`, node => node.querySelector('.doc-dates, .doc-place')?.textContent);
    const subline = () => page.$eval(`${cv} .doc-role .doc-subline`, node => node.querySelector('.doc-dates, .doc-place')?.textContent);
    await choose('Date Format', '01/2024');
    assert.equal(await roleline(), '01/2023 - Present');
    await toggle('Show experience location above dates');
    assert.deepEqual([await roleline(), await subline()], ['Vancouver, BC, Canada', '01/2023 - Present'], 'the place moves up beside the company, the dates down');
    await toggle('Show country in locations');
    assert.equal(await roleline(), 'Vancouver, BC');
    await choose('Bullet Icon', 'Arrow');
    assert.equal(await style(`${cv} [data-section="experience"] .doc-bullets li`, 'content', '::before'), '"»"');
    await choose('Skills Layout', 'Not Listed');
    assert.equal(await style(`${cv} [data-section="skills"] .doc-bullets li`, 'content', '::before'), 'none', 'skills lines without a mark');
    assert.equal(await style(`${cv} [data-section="experience"] .doc-bullets li`, 'content', '::before'), '"»"', 'bullets keep theirs');
    const education = () => page.$eval(`${cv} .doc-education`, node => [...node.children].map(line => line.textContent.trim()));
    assert.deepEqual(await education(), ['Original University09/2013 - 06/2017', 'BSc, Computer Science'], 'Education on two lines first');
    await choose('Education Layout', 'One Line');
    assert.deepEqual(await education(), ['BSc, Computer Science, Original University09/2013 - 06/2017'], 'then on one line');
    assert.deepEqual(await page.$eval(`${cv} .doc-edu-line .doc-title`, node => [getComputedStyle(node).fontStyle, getComputedStyle(node).fontWeight]), ['italic', '400'], 'the degree in plain italics');

    // Section Order & Display
    await openGroup('Section Order & Display');
    await page.evaluate(() => [...document.querySelectorAll('.dp-sections label')].find(label => label.textContent.trim() === 'Summary').click());
    await page.waitForFunction(selector => !document.querySelector(`${selector} [data-section="summary"]`), {}, cv);

    await page.screenshot({ path: '/private/tmp/job-agent-design-panel.png' });
    for (let i = 0; i < 60 && !(themes.at(-1)?.hiddenSections ?? []).includes('summary'); i++) await new Promise(r => setTimeout(r, 100));
    const { sectionOrder, ...rest } = themes.at(-1);
    assert.deepEqual(rest, {
      template: 'professional', accent: '#000000', fontFamily: 'Georgia, serif', fontSize: 11, lineHeight: 1.4, sectionGap: 12, nameSize: 20,
      hiddenSections: ['summary'], headerAlign: 'left', margins: 'wide', pageSize: 'letter', nameCaps: false, dateFormat: 'numeric',
      locationAboveDates: true, showCountry: false, bulletIcon: 'arrow', skillsListed: false, educationLayout: 'one-line', version: 2,
    }, 'saved with the CV');

    // A change just before leaving the editor is saved at once, not lost with the wait.
    await page.focus('.dp-range');
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => [...document.querySelectorAll('a')].find(link => link.textContent.trim() === 'Dashboard').click());
    await page.waitForFunction(() => !document.querySelector('.design-panel'));
    for (let i = 0; i < 4 && themes.at(-1).lineHeight !== 1.45; i++) await new Promise(r => setTimeout(r, 100));
    assert.equal(themes.at(-1).lineHeight, 1.45, 'saved on leaving, well before the 0.6s wait ends');

    // The PDF's page: the saved design, on a Letter sheet with wide margins.
    const print = await browser.newPage();
    await print.setRequestInterception(true);
    print.on('request', request => {
      const p = new URL(request.url()).pathname;
      if (p === '/api/print/resumes/r1') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ resume, theme: saved }) });
      return void request.continue();
    });
    await print.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/print/resumes/r1?token=t`);
    await print.waitForFunction(() => window.__resumeReady === true);
    await print.emulateMediaType('print');
    assert.equal(await print.$eval('.page', node => getComputedStyle(node).page), 'pro-letter-wide');
    assert.equal(await print.$eval('.page .doc-role .doc-roleline .doc-place', node => node.textContent), 'Vancouver, BC');
    assert.equal(await print.$eval('.page', node => getComputedStyle(node).fontFamily), 'Georgia, serif');
    assert.equal(await print.$eval('.page .doc-education', node => node.textContent), 'BSc, Computer Science, Original University09/2013 - 06/2017', 'Education on one line in the PDF too');
    await print.close();

    assert.deepEqual(errors, []);
    console.log('PASS Design tab: template, sections, layout, typography and content format change the CV, save with it and print the same');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
