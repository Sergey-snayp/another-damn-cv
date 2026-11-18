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
      heading: /^(work experience|work history|employment history|employment|experience)$/i,
    },
    education: {
      add: 'button[aria-label^="Add Another Education"], button[aria-label^="Add Education"], [data-automation-id="educationSection"] button[data-automation-id="add-button"], [role="group"][aria-labelledby*="Education-section"] button[data-automation-id="add-button"]',
      panel: /^education-\d+$|Education-\d+-panel/,
      heading: /^(education|schooling|schools attended)$/i,
    },
    websites: {
      add: 'button[aria-label^="Add Another Website"], button[aria-label^="Add Website"], [role="group"][aria-labelledby*="Websites-section"] button[data-automation-id="add-button"], [role="group"][aria-labelledby*="Website-section"] button[data-automation-id="add-button"]',
      panel: /^websitePanelSet-\d+$|Websites?-\d+-panel/,
      heading: /^websites?( \(optional\))?$/i,
    },
  };

  function panels(list) {
    if (onAvature()) return avatureRows(list);
    return [...document.querySelectorAll('[data-automation-id], [role="group"][aria-labelledby]')]
      .filter((node) => LISTS[list].panel.test(node.getAttribute('data-automation-id') ?? '') || LISTS[list].panel.test(node.getAttribute('aria-labelledby') ?? ''))
      .filter((node) => node.querySelector('input, textarea, button') && !node.parentElement?.closest?.('[data-automation-id^="workExperience-"], [data-automation-id^="education-"], [data-automation-id^="websitePanelSet-"]'));
  }

  /**
   * The list's Add button: Workday's own names first, else the "Add" or "Add Another"
   * button under the section's heading ("Websites"), as Jobright finds it.
   */
  function addButton(list) {
    if (onAvature()) return avatureAdd(list);
    const named = first(document, LISTS[list].add);
    if (named) return named;
    const heading = [...document.querySelectorAll('h2, h3, h4, [role="heading"], legend')]
      .find((node) => shown(node) && LISTS[list].heading.test(normal(node.textContent).replace(/\*$/, '').trim()));
    for (let box = heading?.parentElement, depth = 0; box && depth < 5; box = box.parentElement, depth++) {
      const add = [...box.querySelectorAll('button, [role="button"]')].find((button) => shown(button) && /^add( another)?$/i.test(normal(button.textContent)));
      if (add) return add;
    }
    return null;
  }

  /** The list's panel number `index` (0-based), pressing Add until it is there. */
  async function panelAt(list, index) {
    for (let tries = 0; panels(list).length <= index && tries < 3; tries++) {
      const add = addButton(list);
      if (!add) return null;
      const before = panels(list).length;
      await visit(add);
      press(add);
      for (let waited = 0; panels(list).length === before && waited < 5000; waited += 150) await wait(150);
    }
    return panels(list)[index] ?? null;
  }

  /**
   * Clean-up, as Simplify and Jobright do it: a list with more panels than the
   * CV has jobs (or schools) loses the extra ones from the end, by their own
   * Delete button. Returns how many went.
   */
  async function trim(list, keep) {
    let removed = 0;
    for (let tries = 0; panels(list).length > keep && tries < 15; tries++) {
      const last = panels(list).at(-1);
      const remove = first(last, 'button[data-automation-id="panel-set-delete-button"], button[aria-label^="Delete"], a.removeDatasetRow, a[name^="removeRowFor"], a[id^="removeRowFor"]')
        // Avature's "remove" is a plain link in each row.
        ?? [...last.querySelectorAll('button, [role="button"], a')].find((button) => shown(button) && /^(delete|remove)\b/i.test(normal(button.textContent)));
      if (!remove) break;
      const before = panels(list).length;
      press(remove);
      for (let waited = 0; panels(list).length === before && waited < 3000; waited += 150) await wait(150);
      if (panels(list).length === before) break;
      removed++;
    }
    return removed;
  }

  /** A field of a panel: by Workday's own names first, then by its label. */
  function field(panel, selectors, label) {
    return first(panel, selectors) ?? (label ? [...panel.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea')]
      .find((input) => shown(input) && label.test(Fields().labelOf(input))) ?? null : null);
  }

  // Each field's icon, and the fill's guide while one section fills as part of
  // the page's one pass (content.js): before a field, the page glides to it;
  // after it, its glow and icon. The icons of a field show before the next one starts.
  const marks = [], pending = [];
  let guide = null;
  const note = (mark) => { marks.push(mark); pending.push(mark); };
  const filledMark = (element, reason) => note({ element, status: 'ok', reason });
  const checkMark = (element, reason) => note({ element, status: 'check', reason });
  async function flush() {
    while (pending.length) { const mark = pending.shift(); await guide?.after?.(mark); }
  }
  /** The next field: the last one's icon first, then the page moves to this one. */
  async function visit(element) {
    await flush();
    if (element) await guide?.before?.(element);
  }

  const fillable = (element, value) => Boolean(element) && value !== undefined && value !== null && value !== '' && Fields().isEmpty(element);
  /** Types `value` into an empty field; true when it went in. */
  function type(element, value, reason) {
    if (!fillable(element, value)) return false;
    Filler().typeText(element, String(value), { leave: true });
    filledMark(element, reason);
    return true;
  }
  /** The same, visited first: 1 when it went in. */
  async function put(element, value, reason) {
    if (!fillable(element, value)) return 0;
    await visit(element);
    return Number(type(element, value, reason));
  }

  /**
   * A value set straight into a box, as Simplify sets Workday's dates: focus, the
   * value, input, change, blur. Typing would set off Workday's own jump from a
   * two-digit month to the year, and the year would be lost.
   */
  async function setDirect(element, value, reason, again = false) {
    if (!element || (!again && !Fields().isEmpty(element))) return false;
    await visit(element);
    await Filler().reactFill(element, String(value));
    filledMark(element, reason);
    await wait(200);
    return true;
  }

  /** A Workday date: its Month and Year boxes (or one box) from "2023-04", year first, as Simplify fills them. */
  async function date(panel, which, value, reason) {
    const match = String(value ?? '').match(/^(\d{4})(?:-(\d{2}))?/);
    if (!match) return 0;
    const box = panel.querySelector(`[data-automation-id="formField-${which}"], [id*="${which}"], [id*="${which === 'startDate' ? 'firstYear' : 'lastYear'}"]`) ?? null;
    if (!box) return 0;
    // A date Workday calls invalid ("Invalid Date: 10/") is set again; a good one is left as it is.
    const again = /invalid date/i.test(box.textContent);
    const month = first(box, 'input[aria-label="Month"], input[data-automation-id="dateSectionMonth-input"]');
    const year = first(box, 'input[aria-label="Year"], input[data-automation-id="dateSectionYear-input"]') ?? (month ? null : first(box, 'input'));
    let count = 0;
    if (year && await setDirect(year, match[1], reason, again)) count++;
    if (month && match[2] && await setDirect(month, String(Number(match[2])), reason, again)) count++;
    return count;
  }

  /**
   * A Workday search box (school, field of study, a skill): types the text,
   * presses Enter as Workday wants, and picks the option that matches.
   */
  async function searchPick(input, text, matches, { patient = false } = {}) {
    if (!input || !text) return null;
    input.focus({ preventScroll: true });
    Filler().typeText(input, text);
    // A real Enter: Chrome drops keyCode from a made-up key event, and Workday searches on keyCode 13.
    const enter = () => {
      for (const type of ['keydown', 'keypress', 'keyup']) {
        const key = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' });
        Object.defineProperty(key, 'keyCode', { get: () => 13 });
        Object.defineProperty(key, 'which', { get: () => 13 });
        input.dispatchEvent(key);
      }
    };
    enter();
    const label = (option) => normal(option.getAttribute('data-automation-label') || option.textContent);
    const NO_ITEMS = /^(no items\.?|no matches found|no results)$/;
    const listed = () => [...document.querySelectorAll('[data-automation-activepopup="true"] [data-automation-id="promptOption"], [data-automation-activepopup="true"] [role="option"], [role="listbox"] [role="option"]')].filter((option) => shown(option) && !NO_ITEMS.test(label(option)));
    // Several tests, best first: the first that any option passes picks it.
    const choose = (options) => [].concat(matches).map((test) => options.find((option) => test(label(option)))).find(Boolean);
    let options = [], pick = null;
    if (patient) {
      // As Jobright: results arrive in stages, so look up to 30 times for a match, searching again at the 12th.
      // Stops early once Workday says "No Items", or after searching again its results stay the same.
      let none = 0, same = 0, last = '';
      for (let poll = 1; poll <= 30 && !pick; poll++) {
        await wait(150);
        options = listed();
        pick = choose(options);
        if (pick) break;
        const empty = [...document.querySelectorAll('[data-automation-activepopup="true"]')].some((popup) => NO_ITEMS.test(normal(popup.textContent)));
        none = empty && !options.length ? none + 1 : 0;
        const now = options.map(label).join('|');
        same = poll > 12 && now && now === last ? same + 1 : 0;
        last = now;
        if (none >= 4 || same >= 6) break;
        if (poll === 12) enter();
      }
    } else {
      for (let waited = 0; waited < 3000 && !options.length; waited += 150) {
        await wait(150);
        options = listed();
      }
      pick = choose(options);
    }
    if (!pick) {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      Filler().typeText(input, '');
      return null;
    }
    press(pick.closest('[data-automation-id="promptLeafNode"]') ?? pick);
    await wait(200);
    return label(pick);
  }

  // Simplify's way of comparing names: no case, apostrophes, dots or plural s ("Bachelor's" = "Bachelors").
  const key = (text) => normal(text).replace(/['’.]/g, '').replace(/([a-z0-9])s\b/g, '$1').replace(/\s+/g, ' ').trim();
  const KINDS = {
    doctor: /\b(phd|doctor|doctorate|doctoral)\b/,
    master: /\b(master|msc|ma|ms|meng|masc|mba)\b/,
    bachelor: /\b(bachelor|baccalaureate|undergraduate|bsc|ba|bs|beng|basc|bcom|bba)\b/,
    associate: /\bassociate\b/,
    diploma: /\bdiploma\b/,
    certificate: /\b(certificate|certification)\b/,
  };
  // Words a degree's name may carry and still be the plain degree ("Bachelor's Degree or Equivalent").
  const PLAIN = new Set(['degree', 'level', 'or', 'equivalent', 'higher', 'university', 'college', 'diploma', 'of', 'a']);
  const kindOf = (text) => Object.keys(KINDS).find((kind) => KINDS[kind].test(key(text))) ?? null;
  const plain = (text, kind) => { const [head, ...rest] = key(text).split(/[^a-z0-9]+/).filter(Boolean); return !!head && KINDS[kind].test(head) && rest.every((word) => PLAIN.has(word)); };
  // Simplify's test for a science degree (BS, not BA) from the field of study.
  const SCIENCE = /\b(engineer\w*|computer|software|informatics|information|data|math\w*|statistic\w*|physic\w*|chemi\w*|biolog\w*|neuro\w*|geolog\w*|astronom\w*|science|technology|security)\b/i;
  const NOT_SCIENCE = /\b(political|social|library|liberal|behavio\w+|sport\w*|exercise|home|religious|domestic)\s+science/i;

  /**
   * The option for a CV's degree, as Simplify picks it: the same name; else the
   * plain degree of its kind ("Bachelor's" → "Bachelor's Degree"); else a named
   * one of its kind, Science or Arts by the field ("BSc - Bachelor of Science").
   */
  function degreeOption(texts, degree, field) {
    const wanted = key(degree);
    if (!wanted) return null;
    const same = texts.findIndex((text) => key(text) === wanted);
    if (same >= 0) return same;
    const kind = kindOf(degree);
    if (!kind) { const starts = texts.findIndex((text) => key(text).startsWith(wanted)); return starts >= 0 ? starts : null; }
    const shortest = (indexes) => indexes.length ? indexes.sort((a, b) => texts[a].length - texts[b].length)[0] : null;
    const all = texts.map((_, index) => index);
    const plainOnes = all.filter((index) => plain(texts[index], kind));
    if (plainOnes.length) return shortest(plainOnes);
    // An MBA or a PhD only for a CV that says so.
    const special = (text) => /\b(mba|phd|md|jd)\b/.test(key(text)) && !/\b(mba|phd|md|jd)\b/.test(wanted);
    const named = all.filter((index) => kindOf(texts[index]) === kind && !special(texts[index]));
    if (!named.length) return null;
    const science = SCIENCE.test(field ?? '') && !NOT_SCIENCE.test(field ?? '');
    const branch = named.filter((index) => (science ? /\b(science|sc|bsc|msc|bs|ms)\b/ : /\b(art|ba|ma)\b/).test(key(texts[index])));
    // Never another discipline's degree ("Bachelor of Dental Surgery"): the person chooses.
    return shortest(branch);
  }

  /**
   * Workday's own list behind a box (fields of study, degrees), read the way
   * the page reads it, with the person's session. Simplify and Jobright do the
   * same. [] when it cannot be read.
   */
  const lists = new Map();
  function apiBase() {
    const seen = (performance.getEntriesByType?.('resource') ?? []).map((entry) => entry.name.match(/^https?:\/\/[^/]+\/wday\/calypso\/cxs\/jobapplication\/[A-Za-z0-9_-]+/)?.[0]).find(Boolean);
    if (seen) return seen;
    const tenant = location.pathname.match(/\/recruiting\/([A-Za-z0-9_-]+)/)?.[1] ?? location.hostname.match(/^([A-Za-z0-9-]+)\.wd\d+\.myworkday(?:jobs|site)\.com$/i)?.[1];
    return tenant ? `${location.origin}/wday/calypso/cxs/jobapplication/${tenant}` : null;
  }
  function workdayList(path) {
    const base = apiBase();
    if (!base) return Promise.resolve([]);
    if (!lists.has(base + path)) {
      lists.set(base + path, fetch(base + path, { credentials: 'include', headers: { accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          const items = Array.isArray(data) ? data : data?.data ?? data?.items ?? data?.results ?? [];
          return [...new Set(items.map((item) => String(typeof item === 'string' ? item : item?.descriptor ?? item?.label ?? item?.name ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
        })
        .catch(() => []));
    }
    return lists.get(base + path);
  }

  const words = (text) => key(text).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !['and', 'the', 'for', 'with'].includes(word));
  /**
   * The name in Workday's list for a CV's field of study: the same name, one
   * that starts with it ("Computer and Information Systems Security/Information
   * Assurance"), else the one sharing most of its words (at least half).
   */
  function studyName(names, field) {
    const wanted = key(field);
    if (!wanted) return null;
    const same = names.find((name) => key(name) === wanted);
    if (same) return same;
    const longer = names.filter((name) => key(name).startsWith(wanted) && /^($|[^a-z0-9])/.test(key(name).slice(wanted.length)));
    if (longer.length) return longer.sort((a, b) => a.length - b.length)[0];
    const want = words(field), lead = key(field).split(/[^a-z0-9]+/).filter(Boolean);
    // How many of the CV's first words the name starts with: "Computer and information sciences…" over "Computer systems analysis…".
    const start = (name) => { const have = key(name).split(/[^a-z0-9]+/).filter(Boolean); let same = 0; while (same < lead.length && have[same] === lead[same]) same++; return same; };
    let best = null, score = null;
    for (const name of names) {
      const have = words(name), shared = want.filter((word) => have.includes(word)).length;
      if (!shared) continue;
      const mine = [shared, start(name), -(have.length - shared)];
      if (!score || mine[0] > score[0] || (mine[0] === score[0] && (mine[1] > score[1] || (mine[1] === score[1] && mine[2] > score[2])))) { best = name; score = mine; }
    }
    return score && score[0] >= Math.ceil(want.length / 2) ? best : null;
  }

  /** Simplify's search terms for a long name: the whole of it, then its longest words, three searches at most. */
  const searchTerms = (text) => [...new Set([String(text).trim(), ...String(text).split(/\s+/).filter((word) => word.length >= 3 && !/^(and|the|for|with)$/i.test(word)).sort((a, b) => b.length - a.length)])].slice(0, 3);

  async function fillWork(experiences, source) {
    let count = 0;
    for (const [index, role] of experiences.entries()) {
      const panel = await panelAt('work', index);
      if (!panel) break;
      count += await put(field(panel, 'input[data-automation-id="jobTitle"], input[name="jobTitle"]', /job title|title/i), role.title, source);
      count += await put(field(panel, 'input[data-automation-id="company"], input[name="companyName"]', /company|employer/i), role.company, source);
      count += await put(field(panel, 'input[data-automation-id="location"], input[name="location"]', /location/i), role.location, source);
      const current = first(panel, 'input[data-automation-id="currentlyWorkHere"], input[name="currentlyWorkHere"]');
      if (current && role.current && !current.checked) { await visit(current); press(current); filledMark(current, source); count++; }
      count += await date(panel, 'startDate', role.from, source);
      if (!role.current) count += await date(panel, 'endDate', role.to, source);
      count += await put(field(panel, 'textarea[data-automation-id="description"], textarea[id*="roleDescription"]', /description/i), role.description, source);
    }
    return count;
  }

  /**
   * As Simplify does on Workday: a school or field of study already chosen
   * that is not the CV's is removed (its chip's delete mark), so the CV's can
   * be chosen. One that matches is kept. True when the box is now empty.
   */
  async function clearWrong(input, keeps) {
    const box = input.closest('[data-automation-id="multiSelectContainer"], [data-uxi-widget-type="multiselect"], [data-automation-id^="formField"]');
    const chips = () => [...(box?.querySelectorAll('[data-automation-id="selectedItem"]') ?? [])].filter((chip) => !/^no items/i.test(chip.textContent.trim()));
    for (const chip of chips()) {
      const text = chip.getAttribute('title') || chip.textContent;
      if (keeps(text)) continue;
      const remove = chip.querySelector('[data-automation-id="DELETE_charm"]');
      if (!remove) continue;
      press(remove);
      for (let waited = 0; chip.isConnected && waited < 1500; waited += 100) await wait(100);
    }
    return !chips().length;
  }
  // "The University of X - Main Campus" is "University of X", as Simplify compares schools.
  const campus = (text) => key(text).replace(/^the /, '').replace(/\s*-?\s*main campus$/, '').trim();
  const sameSchool = (chip, institution) => { const have = campus(chip), want = campus(institution); return !!have && !!want && (have === want || have.startsWith(want) || want.startsWith(have)); };

  const SCHOOL = '[data-automation-id="formField-schoolItem"] input, [data-automation-id="formField-school"] input, [data-automation-id*="school" i] input[placeholder]';
  const STUDY = '[data-automation-id="formField-field-of-study"] input, [data-automation-id="formField-fieldOfStudy"] input, [data-automation-id*="fieldOfStudy" i] input';
  /** The panel's box again, once Workday has drawn it anew. */
  async function again(panel, selector) {
    await wait(200);
    for (let waited = 0; !first(panel, selector) && waited < 1500; waited += 100) await wait(100);
    return first(panel, selector);
  }

  async function fillEducation(educations, source) {
    let count = 0;
    for (const [index, school] of educations.entries()) {
      const panel = await panelAt('education', index);
      if (!panel) break;
      const named = field(panel, 'input[data-automation-id="school"], input[name="schoolName"]', null);
      if (named) count += await put(named, school.institution, source);
      else {
        let search = first(panel, SCHOOL);
        if (search && school.institution && await clearWrong(search, (chip) => sameSchool(chip, school.institution))) {
          search = await again(panel, SCHOOL) ?? search;
          await visit(search);
          const got = await searchPick(search, school.institution, (option) => option === normal(school.institution) || option.startsWith(normal(school.institution)));
          if (got) { filledMark(search, source); count++; } else checkMark(search, `"${school.institution}" is not in its list. Choose it yourself.`);
        }
      }
      const degree = first(panel, 'button[data-automation-id="degree"], button[name="degree"]');
      if (degree && school.degree && /^\s*(select one|select)\s*$/i.test(degree.textContent)) {
        let seen = [];
        await visit(degree);
        const result = await Filler().chooseInListbox(degree, (texts) => { seen = texts; return degreeOption(texts, school.degree, school.field); });
        if (result?.text) { filledMark(degree, source); count++; } else checkMark(degree, seen.length ? `"${school.degree}" matches none of its degrees (${seen.slice(0, 8).join(', ')}${seen.length > 8 ? '…' : ''}). Choose the closest.` : 'Its list of degrees did not open. Choose one.');
      }
      let study = first(panel, STUDY);
      // The same name, one that starts with it, then the one sharing most of its words ("Software Engineering" ~ "Engineering, Software").
      const wanted = key(school.field);
      const close = (option) => { const want = words(school.field), have = words(option); const shared = want.filter((word) => have.includes(word)).length; return shared > 0 && shared >= Math.ceil(want.length / 2); };
      const tests = [(option) => key(option) === wanted, (option) => key(option).startsWith(wanted) || wanted.startsWith(key(option)), close];
      // As Simplify does: Workday's own name for it from its list, typed as it is and chosen exactly.
      const name = study && school.field ? studyName(await workdayList('/values/educations/fieldsOfStudy'), school.field) : null;
      // A choice already made is kept only when it is that name, or the CV's (or starts with it); a closest guess is not enough.
      if (study && school.field && Fields().chosenItem(study) && await clearWrong(study, (chip) => (name ? key(chip) === key(name) : false) || tests.slice(0, 2).some((test) => test(normal(chip))))) {
        // Workday draws the box again once a chip is removed: type into the new one.
        study = await again(panel, STUDY);
      }
      if (study && school.field && Fields().isEmpty(study) && !Fields().chosenItem(study)) {
        let got = null;
        await visit(study);
        if (name) got = await searchPick(study, name, [(option) => key(option) === key(name)]);
        // No list, or the name not found by its search: search with the CV's words.
        if (!got) for (const term of searchTerms(school.field)) if ((got = await searchPick(study, term, tests))) break;
        if (got) { filledMark(study, source); count++; } else checkMark(study, `"${school.field}" is not in its list. Choose the closest.`);
      }
      count += await date(panel, 'startDate', school.from, source);
      count += await date(panel, 'endDate', school.to, source);
    }
    return count;
  }

  // Jobright's ways of comparing a skill with an option: words as typed, letters
  // and digits only, and those plus the characters that make "C#", "C++", "Node.js".
  const plainText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const letters = (text) => plainText(text).replace(/[^a-z0-9]/g, '');
  const marked = (text) => plainText(text).replace(/[^a-z0-9+#.]/g, '');
  const tokens = (text) => plainText(text).split(/[^a-z0-9]+/).filter(Boolean);
  const repeats = (long, short) => !!long && !!short && long.length > short.length && long.length % short.length === 0 && long === short.repeat(long.length / short.length);

  /**
   * Jobright's strict tests for a skill, best first: the same name; one of the
   * option's words ("SQL" in "SQL Server", for a name of several words or of
   * three letters or fewer); an option containing it ("Node.js" in "Node.js
   * (Programming)"). Plus Workday's own qualifier ("TypeScript (Programming)").
   * Never a fuzzy guess.
   */
  function skillTests(skill) {
    const words = plainText(skill), bare = letters(skill), sharp = marked(skill), special = sharp !== bare;
    if (!bare) return [];
    const expanded = tokens(skill).length > 1 || bare.length <= 3;
    const tests = [
      (option) => plainText(option) === words || marked(option) === sharp || repeats(marked(option), sharp)
        || (!special && marked(option) === letters(option) && (letters(option) === bare || repeats(letters(option), bare))),
      (option) => plainText(option).startsWith(`${words} (`),
    ];
    if (!special && expanded) tests.push((option) => tokens(option).includes(bare));
    if ((!special && bare.length <= 3) || !expanded) return tests;
    tests.push((option) => (special ? marked(option) : letters(option)).includes(special ? sharp : bare));
    return tests;
  }

  /**
   * Skills as Jobright fills them: the chips already there removed, then up to
   * 39 of the CV's skills, each typed, searched and chosen only by those tests.
   */
  async function fillSkills(skills, source) {
    const SKILLS = '[data-automation-id="formField-skills"] input, [data-automation-id="skillsSection"] input, [data-automation-id="formField-skillsPrompt"] input';
    let input = first(document, SKILLS);
    if (!input || !skills.length) return 0;
    await visit(input);
    const box = input.closest('[data-automation-id^="formField"], [data-automation-id="skillsSection"]') ?? input.parentElement;
    const chips = () => [...box.querySelectorAll('[data-automation-id="selectedItem"]')];
    for (let tries = 0; chips().length && tries < 60; tries++) {
      const remove = box.querySelector('[data-automation-id="DELETE_charm"]');
      if (!remove) break;
      const before = chips().length;
      press(remove);
      for (let waited = 0; chips().length === before && waited < 1000; waited += 100) await wait(100);
    }
    // The box may be drawn anew after its chips go.
    if (!input.isConnected) input = await again(document, SKILLS);
    if (!input) return 0;
    const seen = new Set();
    let added = 0;
    for (const skill of skills.slice(0, 39)) {
      if (!letters(skill) || seen.has(marked(skill))) continue;
      seen.add(marked(skill));
      const tests = skillTests(skill);
      const got = await searchPick(input, skill, tests, { patient: true });
      if (got) added++;
    }
    if (added) filledMark(input, `${added} skill${added === 1 ? '' : 's'} added from ${source.replace(/^From /, '')}`);
    return added;
  }

  /** A link as Workday compares it: no "https://", "www." or trailing slash ("https://linkedin.com/in/x" = "linkedin.com/in/x/"). */
  const link = (url) => normal(url).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

  async function fillWebsites(websites, source) {
    const inputOf = (panel) => first(panel, 'input[data-automation-id="website"], input[name="url"]');
    const inputs = () => panels('websites').map(inputOf).filter(Boolean);
    // Workday refuses the same link twice ("You can't add duplicate website URLs"): a repeated one's panel is deleted.
    const kept = new Set();
    for (const panel of panels('websites')) {
      const url = link(inputOf(panel)?.value);
      if (!url) continue;
      if (!kept.has(url)) { kept.add(url); continue; }
      const remove = first(panel, 'button[data-automation-id="panel-set-delete-button"], button[aria-label^="Delete"]')
        ?? [...panel.querySelectorAll('button')].find((button) => shown(button) && /^delete\b/i.test(normal(button.textContent)));
      if (!remove) continue;
      press(remove);
      for (let waited = 0; panel.isConnected && waited < 2000; waited += 100) await wait(100);
    }
    const listed = new Set(inputs().map((input) => link(input.value)).filter(Boolean));
    let count = 0;
    for (const url of websites) {
      if (!link(url) || listed.has(link(url))) continue;
      const empty = inputs().find((input) => Fields().isEmpty(input));
      const panel = empty ? null : await panelAt('websites', panels('websites').length);
      const input = empty ?? (panel && inputOf(panel));
      if (!input) break;
      if (await put(input, url, source)) { listed.add(link(url)); count++; }
    }
    return count;
  }

  /** Whether this page is Workday's My Experience: one of its lists or its skills box. */
  // --- Avature ("More about me" at Lululemon) -------------------------------
  // Work History and Education are rows of a list, each added by its "add another"
  // link and removed by its "remove" link: Simplify's Avature rules (containerPath,
  // addButtonPath) and Jobright's dataset entries find them the same way. The
  // fields are found by their labels in the row; dates are month boxes.
  const onAvature = () => window.CVAutofillSites?.siteForPage()?.name === 'avature';
  const ROW = 'div[id^="multipleDatasetEntry_"], fieldset.datasetField__row';
  const ADD = 'a[id^="addRowFor"], a.addDatasetRow';
  const sample = (row) => /(?:_|-)sample(?:$|[_-])/i.test(row.id) || Boolean(row.closest('.TableSampleRow, .datasetField__row--sample'));
  const AVATURE_TITLES = {
    work: /^(work|employment|professional|career) (history|experience)$|^(work|employment|experience)$|^(past|previous) (work|working) experience$/i,
    education: /^(education|academic)( history| background| details)?$/i,
    languages: /^(languages?|languages spoken|spoken languages|language skills)$/i,
  };
  const titleText = (node) => normal(node.textContent).replace(/\*/g, '').trim();
  function avatureSection(list) {
    if (!AVATURE_TITLES[list]) return null;
    const titles = [...document.querySelectorAll('legend, .WizardFieldLabel, h2, h3, h4, label, [role="heading"]')]
      .filter((node) => !node.closest(ROW) && AVATURE_TITLES[list].test(titleText(node)));
    for (const title of titles) {
      for (let box = title.parentElement, depth = 0; box && depth < 6; box = box.parentElement, depth++) {
        if (box.querySelector(`${ROW}, ${ADD}`)) return box;
      }
    }
    return null;
  }
  function avatureRows(list) {
    const section = avatureSection(list);
    return section ? [...section.querySelectorAll(ROW)].filter((row) => !sample(row) && shown(row) && !row.parentElement?.closest(ROW)) : [];
  }
  function avatureAdd(list) {
    const section = avatureSection(list);
    if (!section) return null;
    return [...section.querySelectorAll(ADD)].find((link) => shown(link) && !link.closest(ROW))
      ?? [...section.querySelectorAll('a, button, [role="button"]')].find((link) => shown(link) && !link.closest(ROW) && /^add( another)?$/i.test(normal(link.textContent)));
  }
  /** A row's field by its label: a box, or a select whose widget (select2) is on screen. */
  function control(row, pattern) {
    const widget = (element) => Fields().selectWidget?.(element);
    return [...row.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea')]
      .filter((element) => (element.tagName === 'SELECT' && widget(element) ? shown(widget(element)) : shown(element)))
      .find((element) => pattern.test(normal(Fields().labelOf(element)).replace(/\*/g, '').trim())) ?? null;
  }
  /** An empty select set to the first of `values` it has: its own options, else select2's search. 1 when set. */
  async function choose(select, values, reason) {
    if (!select || !Fields().isEmpty(select)) return 0;
    await visit(select);
    for (const value of values.filter(Boolean)) {
      if (Filler().fillSelect(select, value) || (Fields().selectWidget?.(select)?.matches('.select2-container') && await Filler().select2Search(select, value))) {
        filledMark(select, reason);
        return 1;
      }
    }
    checkMark(select, `"${values.filter(Boolean)[0]}" is not one of its options. Choose the closest.`);
    return 0;
  }
  /** A date box from "2023-04", in its own format: month "2023-04", date "2023-04-01", text "04/01/2023" (Simplify's three). */
  async function avatureDate(input, value, reason) {
    const match = String(value ?? '').match(/^(\d{4})(?:-(\d{2}))?/);
    if (!input || !match || !Fields().isEmpty(input)) return 0;
    const [, year, month = '01'] = match;
    const text = input.type === 'month' ? `${year}-${month}` : input.type === 'date' ? `${year}-${month}-01` : `${month}/01/${year}`;
    await visit(input);
    Filler().setValue(input, text);
    input.parentElement?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    if (input.value !== text) { checkMark(input, `The date ${text} did not go in. Enter it yourself.`); return 0; }
    filledMark(input, reason);
    return 1;
  }
  const textOrChoice = (element, values, reason) => (element?.tagName === 'SELECT' ? choose(element, values, reason) : put(element, values[0], reason));

  async function fillAvatureWork(experiences, source) {
    let count = 0;
    for (const [index, role] of experiences.entries()) {
      const row = await panelAt('work', index);
      if (!row) break;
      count += await textOrChoice(control(row, /^(company|employer)\b/), [role.company], source);
      count += await textOrChoice(control(row, /^(position|job title|title|role)\b/), [role.title], source);
      const current = control(row, /\bcurrent(ly)?\b/);
      if (current?.tagName === 'SELECT') count += await choose(current, [role.current ? 'Yes' : 'No'], source);
      else if (role.current) {
        const box = [...row.querySelectorAll('input[type="checkbox"]')].find((input) => shown(input) && /current/i.test(Fields().labelOf(input)));
        if (box && !box.checked) { await visit(box); press(box); filledMark(box, source); count++; }
      }
      count += await avatureDate(control(row, /^(start date|from|start)\b/), role.from, source);
      // A current job has no end date; Avature hides the box once "current" is Yes.
      if (!role.current) count += await avatureDate(control(row, /^(end date|to|end)\b/), role.to, source);
      const about = control(row, /description|duties|responsibilities/);
      if (about?.tagName === 'TEXTAREA') count += await put(about, role.description, source);
    }
    return count;
  }

  async function fillAvatureEducation(schools, source) {
    let count = 0;
    for (const [index, school] of schools.entries()) {
      const row = await panelAt('education', index);
      if (!row) break;
      count += await textOrChoice(control(row, /^(institute|institution|school|university|college)\b|\b(school|university|institution) name\b/), [school.institution], source);
      // "Type of Qualification" (Lululemon), Degree, Education level: the CV's degree, picked as Simplify picks it.
      const level = control(row, /^(type of qualification|qualification type|degree( type| level)?|education level|level of education|level)$/);
      if (level?.tagName === 'SELECT' && school.degree && Fields().isEmpty(level)) {
        const texts = [...level.options].map((option) => option.text);
        const at = degreeOption(texts, school.degree, school.field);
        count += await choose(level, [at === null ? null : texts[at], school.degree], source);
      } else if (level) count += await put(level, school.degree, source);
      count += await textOrChoice(control(row, /^(field of study|area of study|major|program|degree name|discipline|specialization)\b/), [school.field], source);
      // "Qualification" on its own: the degree and its field, as on the CV.
      count += await textOrChoice(control(row, /^qualification$/), [[school.degree, school.field].filter(Boolean).join(' in ')], source);
      count += await avatureDate(control(row, /^(start date|from)\b/), school.from, source);
      count += await avatureDate(control(row, /^(end date|graduation date|graduation month|to)\b/), school.to, source);
    }
    return count;
  }

  // A level as forms word it: the Profile's level first, then the names other lists use for it.
  const LEVEL_WORDS = {
    native: ['Native', 'Native or bilingual', 'Mother tongue', 'Bilingual', 'Expert', 'Fluent'],
    fluent: ['Fluent', 'Full professional', 'Advanced', 'Expert', 'Proficient'],
    professional: ['Professional', 'Professional working', 'Advanced', 'Proficient', 'Fluent'],
    conversational: ['Conversational', 'Intermediate', 'Limited working', 'Good'],
    basic: ['Basic', 'Elementary', 'Beginner', 'Limited'],
  };
  async function fillAvatureLanguages(languages, reason) {
    let count = 0;
    for (const [index, item] of languages.entries()) {
      const row = await panelAt('languages', index);
      if (!row) break;
      count += await textOrChoice(control(row, /^languages?\b/), [item.language], reason);
      const level = control(row, /proficiency|level|fluency/);
      if (level && item.level) count += await textOrChoice(level, LEVEL_WORDS[normal(item.level)] ?? [item.level], reason);
    }
    return count;
  }

  const here = () => Boolean(onAvature() && (avatureSection('work') || avatureSection('education') || avatureSection('languages'))) || Boolean(window.CVAutofillSites?.siteForPage()?.name === 'workday'
    && (first(document, LISTS.work.add) || first(document, LISTS.education.add) || panels('work').length || first(document, '[data-automation-id="formField-skills"] input')));

  const SKILLS_BOX = '[data-automation-id="formField-skills"] input, [data-automation-id="skillsSection"] input, [data-automation-id="formField-skillsPrompt"] input';

  /**
   * The step's sections from `history` ({ experiences, educations, skills,
   * websites, source }), each with the element it starts at, so content.js
   * fills them in the page's one pass, in page order with the other fields:
   * Work Experience, Education, Skills, then (after the CV box) Websites.
   * `run(guide)` fills one, field by field, top to bottom, calling
   * guide.before(element) before each field and guide.after(mark) after it,
   * and returns { filled, notes, marks }.
   */
  function sections(history) {
    if (!history || !here()) return [];
    const source = history.source === 'resume' ? 'From your CV' : 'From your Profile';
    const where = history.source === 'resume' ? 'your CV' : 'your Profile';
    const jobs = history.experiences ?? [];
    // Schools with a degree: a course (no degree) would leave Workday's required Degree empty.
    const schools = (history.educations ?? []).filter((school) => String(school.degree ?? '').trim());
    const start = (list) => panels(list)[0] ?? addButton(list);
    const removed = (count, name, list, keep) => {
      const left = list ? panels(list).length - keep : 0;
      return [
        ...(count ? [`Removed ${count} ${name} ${count === 1 ? 'entry' : 'entries'} not in ${where}.`] : []),
        ...(left > 0 ? [`${left} extra ${name} ${left === 1 ? 'entry is' : 'entries are'} still on the form: remove ${left === 1 ? 'it' : 'them'} there.`] : []),
      ];
    };
    const list = [];
    const section = (element, work) => {
      if (!element) return;
      list.push({
        element,
        run: async (with_ = null) => {
          guide = with_; marks.length = 0; pending.length = 0;
          try {
            const out = await work();
            await flush();
            return { filled: out.filled, notes: out.notes ?? [], marks: [...marks] };
          } finally { guide = null; }
        },
      });
    };
    // Clean-up first, within its own list: panels beyond the CV's jobs and schools. A list the CV has nothing for is left alone.
    if (onAvature()) {
      if (jobs.length && avatureSection('work')) section(start('work'), async () => ({ notes: removed(await trim('work', jobs.length), 'Work History', 'work', jobs.length), filled: await fillAvatureWork(jobs, source) }));
      if (schools.length && avatureSection('education')) section(start('education'), async () => ({ notes: removed(await trim('education', schools.length), 'Education', 'education', schools.length), filled: await fillAvatureEducation(schools, source) }));
      const languages = history.languages ?? [];
      if (languages.length && avatureSection('languages')) section(start('languages'), async () => ({ notes: removed(await trim('languages', languages.length), 'Language'), filled: await fillAvatureLanguages(languages, 'From your Profile') }));
      return list;
    }
    if (jobs.length) section(start('work'), async () => ({ notes: removed(await trim('work', jobs.length), 'Work Experience'), filled: await fillWork(jobs, source) }));
    if (schools.length) section(start('education'), async () => ({ notes: removed(await trim('education', schools.length), 'Education'), filled: await fillEducation(schools, source) }));
    if ((history.skills ?? []).length) section(first(document, SKILLS_BOX), async () => ({ filled: await fillSkills(history.skills, source) }));
    if ((history.websites ?? []).length || panels('websites').length) section(start('websites'), async () => ({ filled: await fillWebsites(history.websites ?? [], 'From your Profile') }));
    return list;
  }

  /** Fills the whole step at once (no guide). Returns { filled, marks, notes }. */
  async function fill(history) {
    const result = { filled: 0, marks: [], notes: [] };
    for (const part of sections(history)) {
      const done = await part.run();
      result.filled += done.filled; result.marks.push(...done.marks); result.notes.push(...done.notes);
    }
    return result;
  }

  /** Whether a field belongs to one of the lists or the skills box: filled here, never by the general fill. */
  const owns = (element) => {
    if (onAvature()) {
      const row = element.closest?.(ROW);
      return Boolean(row && ['work', 'education', 'languages'].some((list) => avatureSection(list)?.contains(row)));
    }
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const id = node.getAttribute?.('data-automation-id') ?? '', by = node.getAttribute?.('aria-labelledby') ?? '';
      if (Object.values(LISTS).some(({ panel }) => panel.test(id) || panel.test(by))) return true;
      if (/^(formField-skills|skillsSection)$/.test(id)) return true;
    }
    return false;
  };

  window.CVAutofillHistory = { fill, sections, here, owns, degreeOption, searchTerms, studyName, skillTests };
})();
