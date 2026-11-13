const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));

// Profile skills in groups, as a CV writes them ("Core: TypeScript, Node.js"):
// one chip row per group, rename, move, add and remove a group. Synthetic data.
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width: 1200, height: 900 });
    const errors = [], writes = [], sorts = [];
    const source = { kind: 'file', name: 'cv.pdf' }, importedAt = '2026-11-13T12:00:00Z';
    let state = { revision: 1, data: {
      summary: { value: 'Backend engineer.', source, importedAt },
      experiences: { value: [], source, importedAt },
      skills: { value: ['TypeScript', 'Node.js', 'Claude', 'Docker'], source, importedAt },
      skillTypes: { value: { TypeScript: 'Core', 'Node.js': 'Core', Claude: 'AI' }, source, importedAt },
    } };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return void request.continue();
      const reply = (value, status = 200) => void request.respond({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (pathname === '/api/auth/me') return reply({ id: 'owner', name: 'Sam Lee', email: 'sam@example.com' });
      if (pathname === '/api/profile') return reply({ firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' });
      if (pathname === '/api/resumes' || pathname === '/api/answers' || pathname === '/api/defaults') return reply([]);
      if (pathname === '/api/profile/career/collect') return reply({ revision: 1, jobs: [] });
      if (pathname === '/api/profile/career/skills/group') {
        sorts.push(JSON.parse(request.postData()).skills);
        return reply({ groups: [{ name: 'Core', skills: ['TypeScript', 'Node.js'] }, { name: 'AI', skills: ['Claude', 'MCP'] }, { name: 'Other', skills: ['Docker'] }] });
      }
      if (pathname === '/api/profile/career') {
        if (request.method() === 'GET') return reply(state);
        const input = JSON.parse(request.postData());
        writes.push(input.sections);
        state = { revision: state.revision + 1, data: { ...state.data } };
        for (const [key, value] of Object.entries(input.sections)) state.data[key] = { value, source: { kind: 'profile' }, importedAt };
        return reply(state);
      }
      return reply({ message: `Unexpected ${request.method()} ${pathname}` }, 500);
    });
    const panel = '[aria-labelledby="profile-skills-heading"]';
    const rows = () => page.$$eval(`${panel} .skill-group`, nodes => nodes.map(node =>
      `${node.querySelector('.skill-group-label')?.textContent ?? ''}: ${[...node.querySelectorAll('.tag-chip span')].map(chip => chip.textContent).join(', ')}`));
    const waitWrites = async count => { for (let i = 0; i < 100 && writes.length < count; i++) await new Promise(r => setTimeout(r, 50)); assert.equal(writes.length, count); };
    const group = name => `${panel} .skill-group:has(.skill-group-label[title="Rename"]:is(:not(.is-other))):nth-child(${name})`;

    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`);
    await page.waitForSelector(`${panel} .skill-group`);
    assert.deepEqual(await rows(), ['Core: TypeScript, Node.js', 'AI: Claude', 'Other: Docker'], 'one row per group, ungrouped last');
    await page.screenshot({ path: '/private/tmp/job-agent-skill-groups.png', clip: await page.$eval(panel, node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y + window.scrollY, width: box.width, height: box.height }; }) });

    // Adding to a group saves the skill with its group.
    await page.click(`${panel} .skill-group:nth-child(2) .tag-add`);
    await page.keyboard.type('MCP');
    await page.keyboard.press('Enter');
    await waitWrites(1);
    assert.deepEqual(writes[0].skills, ['TypeScript', 'Node.js', 'Claude', 'MCP', 'Docker']);
    assert.deepEqual(writes[0].skillTypes, { TypeScript: 'Core', 'Node.js': 'Core', Claude: 'AI', MCP: 'AI' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('tag-add-input') && !document.activeElement.disabled);
    await page.keyboard.press('Escape');

    // Typing a skill another group has moves it.
    await page.click(`${panel} .skill-group:nth-child(1) .tag-add`);
    await page.keyboard.type('Docker');
    await page.keyboard.press('Enter');
    await waitWrites(2);
    assert.deepEqual(writes[1].skillTypes.Docker, 'Core');
    await page.waitForFunction(() => document.activeElement?.classList.contains('tag-add-input') && !document.activeElement.disabled);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[aria-labelledby="profile-skills-heading"] .skill-group').length === 2);
    assert.deepEqual(await rows(), ['Core: TypeScript, Node.js, Docker', 'AI: Claude, MCP'], 'the empty Other row is gone');

    // Rename: click the name.
    await page.click(`${panel} .skill-group:nth-child(2) .skill-group-label`);
    await page.waitForFunction(() => document.activeElement?.selectionStart === 0 && document.activeElement?.selectionEnd === 2, {}); // the name is selected
    await page.keyboard.type('AI & LLMs');
    await page.keyboard.press('Enter');
    await waitWrites(3);
    assert.deepEqual(writes[2].skillTypes, { TypeScript: 'Core', 'Node.js': 'Core', Docker: 'Core', Claude: 'AI & LLMs', MCP: 'AI & LLMs' });

    // A new group: named, then its field opens; it is saved with its first skill.
    await page.click(`${panel} .skill-group-add`);
    await page.keyboard.type('Cloud');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${panel} .skill-group:nth-child(3) .tag-add-input`);
    assert.equal(writes.length, 3, 'an empty group saves nothing');
    await page.focus(`${panel} .skill-group:nth-child(3) .tag-add-input`);
    await page.keyboard.type('AWS Lambda, S3');
    await page.keyboard.press('Enter');
    await waitWrites(4);
    assert.deepEqual(writes[3].skills, ['TypeScript', 'Node.js', 'Docker', 'Claude', 'MCP', 'AWS Lambda', 'S3']);
    assert.equal(writes[3].skillTypes.S3, 'Cloud');
    await page.waitForFunction(() => document.activeElement?.classList.contains('tag-add-input') && !document.activeElement.disabled);
    await page.keyboard.press('Escape');

    // Removing a group asks first, then removes it and its skills.
    await page.hover(`${panel} .skill-group:nth-child(3) .skill-group-name`);
    await page.click(`${panel} [aria-label="Remove the group Cloud"]`);
    await page.waitForSelector('.confirm-dialog');
    assert.match(await page.$eval('.confirm-dialog', node => node.textContent), /AWS Lambda, S3/);
    await page.locator('.confirm-dialog ::-p-text(Remove group)').click();
    await waitWrites(5);
    assert.deepEqual(writes[4].skills, ['TypeScript', 'Node.js', 'Docker', 'Claude', 'MCP']);

    assert.equal(sorts.length, 0, 'a grouped list is never sorted by itself');

    // A list that never had groups is sorted once, by itself, with Undo.
    state = { revision: state.revision + 1, data: { ...state.data, skills: { value: ['TypeScript', 'Node.js', 'Claude', 'MCP', 'Docker'], source, importedAt } } };
    delete state.data.skillTypes;
    await page.reload();
    await page.waitForSelector(`${panel} .tag-undo`);
    assert.deepEqual(sorts[0], ['TypeScript', 'Node.js', 'Claude', 'MCP', 'Docker']);
    await waitWrites(6);
    assert.deepEqual(writes[5].skills, ['TypeScript', 'Node.js', 'Claude', 'MCP', 'Docker']);
    assert.deepEqual(writes[5].skillTypes, { TypeScript: 'Core', 'Node.js': 'Core', Claude: 'AI', MCP: 'AI' }, '"Other" is the row without a group');
    assert.deepEqual(await rows(), ['Core: TypeScript, Node.js', 'AI: Claude, MCP', 'Other: Docker']);
    assert.equal(await page.$(`${panel} .skill-group-add[title], ${panel} ::-p-text(Sort into groups)`), null, 'no button to press');
    await page.locator(`${panel} .tag-undo ::-p-text(Undo)`).click();
    await waitWrites(7);
    assert.deepEqual(writes[6].skillTypes, {}, 'Undo keeps the plain list');
    await page.reload();
    await page.waitForSelector(`${panel} .skill-group`);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(sorts.length, 1, 'and it is not sorted again');

    assert.deepEqual(errors, []);
    console.log('PASS Profile skills in groups: rows, add, move, rename, new group, remove with a question; a list without groups sorted once by itself, with Undo');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
