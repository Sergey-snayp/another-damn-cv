const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// A CV's flat skills list, sorted into groups from the Skills heading:
// one line per group ("Core: TypeScript, Node.js"), then saved. Synthetic data.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [], saves = [], sorts = [];
    const skill = (name, position) => ({ lineageId: `s${position}`, name, category: '', position });
    const resume = { contact: { lineageId: 'c', firstName: 'Sam', lastName: 'Lee' }, summaries: {}, experiences: [], educations: [],
      skills: ['Docker', 'TypeScript', 'Claude', 'Node.js', 'Postman'].map(skill), projects: [], certifications: [], customSections: [] };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const p = new URL(request.url()).pathname;
      if (!p.startsWith('/api/')) return void request.continue();
      const reply = value => void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      if (p === '/api/auth/me') return reply({ id: 'o', name: 'Sam Lee', email: 's@e.com' });
      if (p === '/api/resumes') return reply([{ id: 'r1', name: 'CV', updatedAt: '2026-11-13T00:00:00Z' }]);
      if (p === '/api/resumes/r1') return reply(resume);
      if (p.endsWith('/theme')) return reply({ theme: null });
      if (p === '/api/profile/career/skills/group') {
        sorts.push(JSON.parse(request.postData()).skills);
        return reply({ groups: [{ name: 'Core', skills: ['TypeScript', 'Node.js', 'Docker'] }, { name: 'AI', skills: ['Claude'] }, { name: 'Other', skills: ['Postman'] }] });
      }
      if (p === '/api/resumes/r1/save') { const body = JSON.parse(request.postData()); saves.push(body); return reply(body); }
      return reply([]);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/documents/r1`);
    const section = '.studio-zoom [data-section="skills"]';
    await page.waitForSelector(section);
    const lines = () => page.$$eval(`${section} li[data-edit-item="skill-group"]`, nodes => nodes.map(node => node.textContent.replace(/\s+/g, ' ').trim()));
    await page.hover(`${section} h2`);
    await page.click(`${section} .pro-sort-skills`);
    await page.waitForFunction(selector => document.querySelectorAll(`${selector} li[data-edit-item="skill-group"]`).length === 3, {}, section);
    assert.deepEqual(sorts[0], ['Docker', 'TypeScript', 'Claude', 'Node.js', 'Postman']);
    const shown = await lines();
    assert.match(shown[0], /^Core:\s*TypeScript.*Node\.js.*Docker/);
    assert.match(shown[1], /^AI:\s*Claude/);
    assert.match(shown[2], /^Postman/, '"Other" is a line without a name');
    for (let i = 0; i < 100 && !saves.some(body => body.skills?.[0]?.category === 'Core'); i++) await new Promise(r => setTimeout(r, 100));
    await page.mouse.move(5, 5);
    await page.screenshot({ path: '/private/tmp/job-agent-cv-skill-groups.png', clip: await page.$eval(section, node => { const box = node.getBoundingClientRect(); return { x: box.x - 10, y: box.y + window.scrollY - 10, width: box.width + 20, height: box.height + 20 }; }) });
    const saved = saves.at(-1);
    assert.deepEqual(saved.skills.map(item => `${item.category}:${item.name}`), ['Core:TypeScript', 'Core:Node.js', 'Core:Docker', 'AI:Claude', ':Postman'], 'saved with the groups');
    assert.deepEqual(errors, []);
    console.log('PASS CV skills: Sort into groups writes one line per group and saves it');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
