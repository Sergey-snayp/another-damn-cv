/**
 * Workday's "My Experience" step, filled as Simplify fills it (its Workday
 * rules, 3.1.10): Work Experience and Education are lists behind an "Add"
 * button, one panel per job or school; Skills is a search box that adds one
 * skill at a time; Websites is another "Add" list.
 *
 * For each job and school of the CV or Profile Autofill uses, the panel is
 * added when it is not there yet, and its empty fields are filled. A field
 * that already holds something is never overwritten, and nothing is submitted.
 */
(() => {
  if (window.CVAutofillHistory) return;

  const Fields = () => window.CVAutofillFields;
  const Filler = () => window.CVAutofillFiller;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const shown = (node) => Boolean(node) && node.getClientRects().length > 0 && !node.disabled;
  const normal = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const first = (root, selectors) => [...root.querySelectorAll(selectors)].find(shown) ?? null;
  const press = (element) => {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    element.click();
  };

  /** Each list: its Add button, and its panels in page order (Simplify's addButtonPath and containerPath). */
  const LISTS = {
    work: {
      add: 'button[aria-label^="Add Another Work Experience"], button[aria-label^="Add Work Experience"], button[aria-label^="Add Another Work History"], button[aria-label^="Add Work History"], [data-automation-id="workExperienceSection"] button[data-automation-id="add-button"], [role="group"][aria-labelledby*="Experience-section"] button[data-automation-id="add-button"], [role="group"][aria-labelledby*="Work-History-section"] button[data-automation-id="add-button"], [role="group"][aria-labelledby*="Employment-History-section"] button[data-automation-id="add-button"]',
      panel: /^workExperience-\d+$|(Experience|Work-History|Employment-History|Employment-Detail)-\d+-panel/,
    },
    education: {
      add: 'button[aria-label^="Add Another Education"], button[aria-label^="Add Education"], [data-automation-id="educationSection"] button[data-automation-id="add-button"], [role="group"][aria-labelledby*="Education-section"] button[data-automation-id="add-button"]',
      panel: /^education-\d+$|Education-\d+-panel/,
    },
    websites: {
      add: 'button[aria-label^="Add Another Websites"], button[aria-label^="Add Websites"], [role="group"][aria-labelledby*="Websites-section"] button[data-automation-id="add-button"]',
      panel: /^websitePanelSet-\d+$|Websites-\d+-panel/,
    },
  };

  function panels(list) {
    return [...document.querySelectorAll('[data-automation-id], [role="group"][aria-labelledby]')]
      .filter((node) => LISTS[list].panel.test(node.getAttribute('data-automation-id') ?? '') || LISTS[list].panel.test(node.getAttribute('aria-labelledby') ?? ''))
      .filter((node) => node.querySelector('input, textarea, button') && !node.parentElement?.closest?.('[data-automation-id^="workExperience-"], [data-automation-id^="education-"], [data-automation-id^="websitePanelSet-"]'));
  }

  /** The list's panel number `index` (0-based), pressing Add until it is there. */
  async function panelAt(list, index) {
    for (let tries = 0; panels(list).length <= index && tries < 3; tries++) {
      const add = first(document, LISTS[list].add);
      if (!add) return null;
      const before = panels(list).length;
      press(add);
      for (let waited = 0; panels(list).length === before && waited < 5000; waited += 150) await wait(150);
    }
    return panels(list)[index] ?? null;
  }

  /** A field of a panel: by Workday's own names first, then by its label. */
  function field(panel, selectors, label) {
    return first(panel, selectors) ?? (label ? [...panel.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea')]
      .find((input) => shown(input) && label.test(Fields().labelOf(input))) ?? null : null);
  }

  const marks = [];
  const filledMark = (element, reason) => marks.push({ element, status: 'ok', reason });
  const checkMark = (element, reason) => marks.push({ element, status: 'check', reason });

  /** Types `value` into an empty field; true when it went in. */
  function type(element, value, reason) {
    if (!element || value === undefined || value === null || value === '' || !Fields().isEmpty(element)) return false;
    Filler().typeText(element, String(value), { leave: true });
    filledMark(element, reason);
    return true;
  }

  /** A Workday date: its Month and Year boxes (or one box) from "2023-04". */
  function date(panel, which, value, reason) {
    const match = String(value ?? '').match(/^(\d{4})(?:-(\d{2}))?/);
    if (!match) return 0;
    const box = panel.querySelector(`[data-automation-id="formField-${which}"], [id*="${which}"], [id*="${which === 'startDate' ? 'firstYear' : 'lastYear'}"]`) ?? null;
    if (!box) return 0;
    const month = first(box, 'input[aria-label="Month"], input[data-automation-id="dateSectionMonth-input"]');
    const year = first(box, 'input[aria-label="Year"], input[data-automation-id="dateSectionYear-input"]') ?? (month ? null : first(box, 'input'));
    let count = 0;
    if (month && match[2] && type(month, match[2], reason)) count++;
    if (year && type(year, match[1], reason)) count++;
    return count;
  }

  /**
   * A Workday search box (school, field of study, a skill): types the text,
   * presses Enter as Workday wants, and picks the option that matches.
   */
  async function searchPick(input, text, matches) {
    if (!input || !text) return null;
    input.focus({ preventScroll: true });
    Filler().typeText(input, text);
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
    let options = [];
    for (let waited = 0; waited < 3000 && !options.length; waited += 150) {
      await wait(150);
      options = [...document.querySelectorAll('[data-automation-activepopup="true"] [data-automation-id="promptOption"], [data-automation-activepopup="true"] [role="option"], [role="listbox"] [role="option"]')].filter(shown);
    }
    const label = (option) => normal(option.getAttribute('data-automation-label') || option.textContent);
    const pick = options.find((option) => matches(label(option)));
    if (!pick) {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      Filler().typeText(input, '');
      return null;
    }
    press(pick.closest('[data-automation-id="promptLeafNode"]') ?? pick);
    await wait(200);
    return label(pick);
  }

  /** Workday's degree names for a CV's ("BSc" → "Bachelor's Degree"), most specific first. */
  function degreeChoices(degree) {
    const text = normal(degree);
    const kinds = [
      [/\b(ph\.?d|doctor|doctorate)/, ['Doctorate', 'Doctoral Degree', 'PhD', 'Ph.D.']],
      [/\b(master|msc|m\.sc|ma\b|m\.a\b|mba|meng|m\.eng)/, ["Master's Degree", 'Masters Degree', 'Masters', 'Master']],
      [/\b(bachelor|bsc|b\.sc|ba\b|b\.a\b|beng|b\.eng|bs\b|b\.s\b)/, ["Bachelor's Degree", 'Bachelors Degree', 'Bachelors', 'Bachelor']],
      [/\b(associate)/, ["Associate's Degree", 'Associate Degree', 'Associates']],
      [/\b(diploma)/, ['Diploma']],
      [/\b(certificate|certification)/, ['Certificate']],
    ];
    const found = kinds.find(([pattern]) => pattern.test(text));
    return [degree, ...(found ? found[1] : [])].filter(Boolean);
  }

  async function fillWork(experiences, source) {
    let count = 0;
    for (const [index, role] of experiences.entries()) {
      const panel = await panelAt('work', index);
      if (!panel) break;
      count += Number(type(field(panel, 'input[data-automation-id="jobTitle"], input[name="jobTitle"]', /job title|title/i), role.title, source));
      count += Number(type(field(panel, 'input[data-automation-id="company"], input[name="companyName"]', /company|employer/i), role.company, source));
      count += Number(type(field(panel, 'input[data-automation-id="location"], input[name="location"]', /location/i), role.location, source));
      const current = first(panel, 'input[data-automation-id="currentlyWorkHere"], input[name="currentlyWorkHere"]');
      if (current && role.current && !current.checked) { press(current); filledMark(current, source); count++; }
      count += date(panel, 'startDate', role.from, source);
      if (!role.current) count += date(panel, 'endDate', role.to, source);
      count += Number(type(field(panel, 'textarea[data-automation-id="description"], textarea[id*="roleDescription"]', /description/i), role.description, source));
    }
    return count;
  }

  async function fillEducation(educations, source) {
    let count = 0;
    for (const [index, school] of educations.entries()) {
      const panel = await panelAt('education', index);
      if (!panel) break;
      const named = field(panel, 'input[data-automation-id="school"], input[name="schoolName"]', null);
      if (named) count += Number(type(named, school.institution, source));
      else {
        const search = first(panel, '[data-automation-id="formField-schoolItem"] input, [data-automation-id="formField-school"] input, [data-automation-id*="school" i] input[placeholder]');
        if (search && Fields().isEmpty(search) && school.institution) {
          const got = await searchPick(search, school.institution, (option) => option === normal(school.institution) || option.startsWith(normal(school.institution)));
          if (got) { filledMark(search, source); count++; } else checkMark(search, `"${school.institution}" is not in its list. Choose it yourself.`);
        }
      }
      const degree = first(panel, 'button[data-automation-id="degree"], button[name="degree"]');
      if (degree && school.degree && /^\s*(select one|select)\s*$/i.test(degree.textContent)) {
        const result = await Filler().fillListbox(degree, degreeChoices(school.degree));
        if (result.filled) { filledMark(degree, source); count++; } else checkMark(degree, `"${school.degree}" is not one of its degrees. Choose the closest.`);
      }
      const study = first(panel, '[data-automation-id="formField-field-of-study"] input, [data-automation-id="formField-fieldOfStudy"] input, [data-automation-id*="fieldOfStudy" i] input');
      if (study && school.field && Fields().isEmpty(study)) {
        const wanted = normal(school.field);
        const got = await searchPick(study, school.field, (option) => option === wanted || option.startsWith(wanted) || wanted.startsWith(option));
        if (got) { filledMark(study, source); count++; } else checkMark(study, `"${school.field}" is not in its list. Choose the closest.`);
      }
      count += date(panel, 'startDate', school.from, source);
      count += date(panel, 'endDate', school.to, source);
    }
    return count;
  }

  async function fillSkills(skills, source) {
    const input = first(document, '[data-automation-id="formField-skills"] input, [data-automation-id="skillsSection"] input, [data-automation-id="formField-skillsPrompt"] input');
    if (!input || !skills.length) return 0;
    const box = input.closest('[data-automation-id^="formField"], [data-automation-id="skillsSection"]') ?? input.parentElement;
    const have = new Set([...box.querySelectorAll('[data-automation-id="selectedItem"]')].map((item) => normal(item.textContent)));
    let added = 0;
    for (const skill of skills.slice(0, 30)) {
      const wanted = normal(skill);
      if (!wanted || have.has(wanted)) continue;
      const got = await searchPick(input, skill, (option) => option === wanted);
      if (got) { have.add(got); added++; }
    }
    if (added) filledMark(input, `${added} skill${added === 1 ? '' : 's'} added from ${source.replace(/^From /, '')}`);
    return added;
  }

  async function fillWebsites(websites, source) {
    const inputs = () => panels('websites').map((panel) => first(panel, 'input[data-automation-id="website"], input[name="url"]')).filter(Boolean);
    const listed = new Set(inputs().map((input) => normal(input.value)).filter(Boolean));
    let count = 0;
    for (const url of websites) {
      if (listed.has(normal(url))) continue;
      const empty = inputs().find((input) => Fields().isEmpty(input));
      const panel = empty ? null : await panelAt('websites', panels('websites').length);
      const input = empty ?? (panel && first(panel, 'input[data-automation-id="website"], input[name="url"]'));
      if (!input) break;
      if (type(input, url, source)) { listed.add(normal(url)); count++; }
    }
    return count;
  }

  /** Whether this page is Workday's My Experience: one of its lists or its skills box. */
  const here = () => Boolean(window.CVAutofillSites?.siteForPage()?.name === 'workday'
    && (first(document, LISTS.work.add) || first(document, LISTS.education.add) || panels('work').length || first(document, '[data-automation-id="formField-skills"] input')));

  /**
   * Fills the step from `history` ({ experiences, educations, skills, websites, source }).
   * Returns { filled, marks }: the icons for every field it filled or could not.
   */
  async function fill(history) {
    marks.length = 0;
    if (!history || !here()) return { filled: 0, marks: [] };
    const source = history.source === 'resume' ? 'From your CV' : 'From your Profile';
    let filled = 0;
    filled += await fillWork(history.experiences ?? [], source);
    filled += await fillEducation(history.educations ?? [], source);
    filled += await fillSkills(history.skills ?? [], source);
    filled += await fillWebsites(history.websites ?? [], 'From your Profile');
    return { filled, marks: [...marks] };
  }

  /** Whether a field belongs to one of the lists or the skills box: filled here, never by the general fill. */
  const owns = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const id = node.getAttribute?.('data-automation-id') ?? '', by = node.getAttribute?.('aria-labelledby') ?? '';
      if (Object.values(LISTS).some(({ panel }) => panel.test(id) || panel.test(by))) return true;
      if (/^(formField-skills|skillsSection)$/.test(id)) return true;
    }
    return false;
  };

  window.CVAutofillHistory = { fill, here, owns };
})();
