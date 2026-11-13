/**
 * Detect application fields and expose the page-edge launcher.
 *
 * The panel is an extension frame with no access to the page's DOM, so it asks
 * this script to look at the form and to fill it. Everything below answers one
 * of those two questions.
 */

/**
 * Every file in a content-script bundle shares ONE top-level scope, so
 * destructuring `detectFields` here would redeclare the function fields.js
 * already defines and break the whole bundle. Keep the namespaces intact.
 */
const Fields = window.CVAutofillFields;
const Sites = window.CVAutofillSites;
const Filler = window.CVAutofillFiller;

/** Kept between messages so "fill" acts on exactly what "scan" reported. */
let lastScan = { found: [], skipped: [] };

/**
 * The employer's name: a company element, the site name, the page title on a
 * job board ("Job Application for … at Box"), the board's logo ("Box Logo"),
 * or the domain ("careers.zexter.com" → "Zexter"). A job board's own domain
 * (job-boards.greenhouse.io) never names the employer.
 */
const BOARD_HOST = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|myworkdayjobs\.com|bamboohr\.com|recruitee\.com|teamtailor\.com|jobvite\.com|icims\.com|breezy\.hr|personio\.(de|com)|pinpointhq\.com|rippling\.com)$/i;
function companyName() {
  if (window.CVAutofillLinkedIn?.isPage()) return window.CVAutofillLinkedIn.read()?.company ?? '';
  const named = document.querySelector('.company-name, [data-testid="company-name"]')?.textContent?.trim()
    || document.querySelector('meta[property="og:site_name"]')?.content?.trim();
  if (named) return named.slice(0, 100);
  if (BOARD_HOST.test(location.hostname)) {
    const fromTitle = document.title.match(/^.*\bat\s+([^|–—]+?)\s*(?:[|–—].*)?$/i)?.[1]?.trim();
    if (fromTitle) return fromTitle.slice(0, 100);
    const logo = document.querySelector('img[alt$=" logo" i]')?.alt.replace(/\s+logo$/i, '').trim();
    if (logo) return logo.slice(0, 100);
    return '';
  }
  const core = location.hostname.replace(/^(www|careers|jobs|apply|join)\./, '').split('.')[0] ?? '';
  return core ? core[0].toUpperCase() + core.slice(1) : '';
}

/** The company a "have you worked here before" question names ("employed at Box, including…"), else the page's. */
function companyAskedAbout(element) {
  const question = Fields.groupQuestion?.(element) || Fields.labelOf(element);
  const named = question.match(/\b(?:employed|worked|work(?:ing)?)\s+(?:at|for|by|with)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/)?.[1];
  return (named && !/^(?:any|this|our|the|us)$/i.test(named) ? named : companyName()).replace(/[.,]+$/, '');
}

function scan() {
  lastScan = Fields.detectFields();

  // One entry per category (and country, for eligibility): a form may repeat a field across steps.
  const unique = [...new Map(lastScan.found.map((f) => [`${f.key}|${f.country ?? ''}`, f])).values()];

  const site = Sites.siteForPage();
  const linkedin = window.CVAutofillLinkedIn?.isPage();
  const selected = linkedin ? window.CVAutofillLinkedIn.read() : null;
  const ruleCount = Object.keys(site?.byId ?? {}).length + Object.keys(site?.byName ?? {}).length;

  return {
    url: location.href,
    host: location.hostname,
    site: site?.name ?? null,
    ruleCount,
    context: {
      title: linkedin ? selected?.title || (selected ? 'LinkedIn job' : 'Open a LinkedIn job') : (document.querySelector('h1')?.innerText || document.title || 'Application form').trim().slice(0, 180),
      company: linkedin ? selected?.company ?? '' : companyName(),
      ...(selected && { jobUrl: selected.url, isJobPosting: true }),
    },
    fields: unique.map((field) => ({
      key: field.key,
      ...(field.country && { country: field.country }),
      ...(field.key === 'workedHereBefore' && { company: companyAskedAbout(field.element) }),
      // A cover letter the form insists on is written for it when there is none yet.
      ...(field.key === 'coverLetter' && { required: Fields.isRequired(field.element) }),
      kind: field.kind,
      group: Fields.groupOf(field.key),
      source: field.source,
    })),
    skippedSensitive: lastScan.skipped.filter((item) => item.reason === 'sensitive').length,
    consentCount: lastScan.skipped.filter((item) => item.reason === 'consent').length,
    // The job page has an Apply button that opens a form not loaded yet.
    canOpenForm: Boolean(Sites.formOpener()) && !lastScan.found.length,
  };
}

const Marks = window.CVAutofillMarks;



// ─── Why a required field is still empty ───────────────────────────────
// Each red icon (and the panel's "Still empty" list) says why Autofill did not
// fill the field and what fixes it. The context is the last fill: its profile
// values, the groups switched off, and the reasons fields failed.
let lastFill = { profile: {}, failed: new Map(), answers: new Map() };
// Fields whose default can be set from the icon (same list as the server's EXTENSION_PROFILE_KEYS).
const PROFILE_DEFAULTS = new Set(['preferredName', 'phone', 'location', 'city', 'state', 'country', 'postalCode', 'linkedin', 'github', 'portfolio', 'website', 'telegram', 'salaryExpectation', 'noticePeriod']);
const ELIGIBILITY_FIELDS = new Set(['requiresSponsorship', 'workAuthorization']);
const WORK_FIELDS = new Set(['workArrangement', 'willingToRelocate']);
const WORK_OPTIONS = [{ value: 'remote', label: 'Remote' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'onsite', label: 'On-site' }];

function explain(element) {
  const { profile, failed } = lastFill;
  if (failed.has(element)) return failed.get(element);
  let field = lastScan.found.find((item) => item.element === element || (element.type === 'radio' && item.element.name === element.name && item.element.type === 'radio'));
  // "How did you hear" with its setting off is the company's own question again.
  if (field?.key === 'heardAbout' && !profile.heardAbout) field = null;
  const label = Fields.labelOf(element).replace(/\?$/, '');
  if (field) {
    const off = profile.offKeys?.[field.key];
    if (off) return `Off in Settings → Fields to fill (${off}).`;
    if (field.diversity) return 'Diversity questions are off in Settings → Fields to fill.';
    if (WORK_FIELDS.has(field.key)) {
      const decision = Filler.workDecision(field, profile);
      if (decision.why === 'types') return 'Choose the types of work you accept: remote, hybrid, on-site. Click to choose.';
      if (decision.why === 'relocation') return decision.country ? `Would you relocate to ${decision.country}? Click to answer: it is saved for ${decision.country} only.` : 'Would you relocate? Click to answer.';
    }
    if (ELIGIBILITY_FIELDS.has(field.key)) {
      const what = field.key === 'requiresSponsorship' ? 'sponsorship' : 'work authorization';
      return field.country ? `No answer yet about ${what} for ${field.country}. Click to answer: it is saved for ${field.country} only.` : `No answer yet about ${what}. Click to answer.`;
    }
    if (field.key === 'resume') return profile.resumeDataUrl ? 'Your CV upload did not finish. Try Autofill again or upload it yourself.' : 'No CV chosen. Choose one in the Resume tab.';
    if (field.key === 'workedHereBefore') return 'Could not tell from your CV. Click to answer once for every company.';
    if (field.kind === 'select' || field.kind === 'radio' || field.kind === 'combobox') return `None of the options matched your profile answer for "${label}". Click to choose one.`;
    return PROFILE_DEFAULTS.has(field.key) ? `Your profile has no value for "${label}". Click to add it.` : `Your profile has no value for "${label}". Add it in the app's Profile.`;
  }
  const kind = Fields.leftAlone(element);
  if (kind === 'never') return 'A personal question Autofill never answers.';
  if (kind === 'consent') {
    return profile.acknowledgeRequired
      ? 'Not a routine acknowledgement, so it is left for you. Read it and choose.'
      : 'Consent is yours to give. Choose it, or switch on Settings → Acknowledge required privacy notices.';
  }
  if (Fields.detectQuestions().some((question) => question.id === element.dataset.adcvField)) {
    return 'The company\'s own question. Click to answer it and save the answer for next time.';
  }
  return 'Autofill did not recognise this field. Fill it yourself.';
}

/** Required fields still empty, each with why. */
function missingWithReasons() {
  return Fields.findMissingRequired(Fields.detectFields().found).map((item) => {
    const element = Fields.byTag(item.id);
    return { ...item, reason: element ? explain(element) : 'Required, still empty.' };
  });
}


const byTag = (id) => Fields.byTag(id);
const stopOrder = (a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

/**
 * One pass down the form, in page order. Each stop gets its icon the moment
 * it is done: profile fields, saved answers and (when switched on) required
 * acknowledgements are filled; other required fields still empty get a red
 * icon saying why. `explainIf` limits which empty fields are explained (a
 * later step explains only its new fields).
 */
async function runPass({ found, profile, answers = [], hooks, explainIf = () => true }) {
  const result = { filled: 0, fromAnswers: 0, acknowledged: 0, failures: [], notes: [] };
  const stops = [], covered = new Set(), groups = new Set(), state = {};
  const cover = (element) => { covered.add(element); if (element.type === 'radio' && element.name) groups.add(element.name); };
  const isCovered = (element) => covered.has(element) || (element.type === 'radio' && groups.has(element.name));
  for (const field of found) if (Filler.valueFor(field, profile)) stops.push({ kind: 'field', element: field.element, field });
  stops.forEach((stop) => cover(stop.element));
  for (const item of answers) {
    const element = byTag(item.id);
    if (element && !isCovered(element)) { stops.push({ kind: 'answer', element, item }); cover(element); }
  }
  if (profile.acknowledgeRequired) {
    for (const ack of Fields.detectAcknowledgements(found)) if (!isCovered(ack.element)) { stops.push({ kind: 'ack', element: ack.element, ack }); cover(ack.element); }
  }
  for (const item of Fields.findMissingRequired(found)) {
    const element = byTag(item.id);
    if (element && !isCovered(element) && explainIf(element)) { stops.push({ kind: 'explain', element }); cover(element); }
  }
  stops.sort(stopOrder);

  for (const stop of stops) {
    if (stop.kind === 'explain' && !Fields.isEmpty(stop.element)) continue;
    const field = stop.field ?? { element: stop.element, kind: stop.item?.kind ?? stop.ack?.kind };
    const token = await hooks?.before?.(field);
    let mark = null, also = [];
    try {
      if (stop.kind === 'field') {
        const done = await Filler.fillOne(stop.field, profile, state);
        also = done.also ?? []; // The "If other, please specify" box filled with it.
        if (done.filled) result.filled++;
        if (done.note) result.notes.push(done.note);
        if (done.failure) result.failures.push(done.failure);
        mark = done.mark;
        if (mark?.status === 'missing') lastFill.failed.set(mark.element, mark.reason);
      } else if (stop.kind === 'answer') {
        const done = await Filler.fillAnswer(stop.element, stop.item.kind, stop.item.value);
        if (done.filled) {
          result.filled++; result.fromAnswers++;
          mark = stop.item.match === 'similar'
            ? { element: done.element ?? stop.element, status: 'check', reason: `From your answer to "${stop.item.savedQuestion ?? 'a similar question'}". Check it fits.` }
            : { element: done.element ?? stop.element, status: 'ok', reason: 'From your saved answers' };
        }
      } else if (stop.kind === 'ack') {
        const done = await Filler.fillAcknowledgement(stop.ack);
        if (done.filled) {
          result.filled++; result.acknowledged++;
          mark = { element: done.element ?? stop.element, status: 'check', reason: 'Acknowledged for you (Settings). Read it before submitting.' };
        }
      } else {
        mark = { element: stop.element, status: 'missing', reason: explain(stop.element) };
      }
    } catch (err) {
      result.failures.push(`${Fields.labelOf(stop.element)}: ${err.message}`);
    }
    await hooks?.after?.(field, mark, token);
    if (also.length) await Marks?.show(also);
  }
  if (result.acknowledged) result.notes.push(`${result.acknowledged} required acknowledgement${result.acknowledged === 1 ? '' : 's'} ticked for you: read ${result.acknowledged === 1 ? 'it' : 'them'} before submitting`);
  return result;
}

/**
 * Gray "+" icons: fields the form asks for that the Profile has no value for
 * (LinkedIn's "Website"), so a click can add one, for later forms or just here.
 * Required ones already have a red icon; groups switched off in Settings stay quiet.
 */
function fieldsToAdd(profile, missing) {
  const required = new Set(missing.map((item) => String(item.id)));
  return lastScan.found
    .filter((field) => PROFILE_DEFAULTS.has(field.key) && !profile.offKeys?.[field.key] && !Filler.valueFor(field, profile))
    .filter((field) => field.element.matches('input, textarea, select') && Fields.isEmpty(field.element) && !required.has(field.element.dataset.adcvField))
    .map((field) => ({ element: field.element, status: 'empty', reason: 'Not in your Profile yet. Click to add it.' }))
    // The company's own questions with no answer yet: write one, or have it drafted.
    .concat(Fields.detectQuestions(lastScan.found)
      .filter((question) => !question.value && !required.has(String(question.id)))
      .map((question) => Fields.byTag(question.id))
      .filter((element) => element?.matches('input, textarea, select'))
      .map((element) => ({ element, status: 'empty', reason: 'Not answered yet. Click to write an answer or generate one.' })));
}

async function fill(profile, answers = []) {
  scan(); // Forms can replace controls between the preview and a click.
  lastFill = { profile, failed: new Map(), answers: new Map(answers.map((item) => [String(item.id), item])) };
  // Settings → "Animate filling": the page follows each field as it fills. Icons appear as each field is done either way.
  const hooks = Marks?.fillHooks(await Marks.animationMode());
  const result = await runPass({ found: lastScan.found, profile, answers, hooks });
  await hooks?.finish?.(lastScan.found);
  hooks?.end();
  rememberStep();
  // A last check for anything the pass could not reach (fields that appeared meanwhile).
  const missing = missingWithReasons();
  await Marks?.showMissing(missing);
  await Marks?.show(fieldsToAdd(profile, missing));
  keepAnswers();
  return {
    ...result,
    skippedSensitive: lastScan.skipped.filter((item) => item.reason === 'sensitive').length,
    missing,
  };
}

// ─── Defaults chosen from a field's icon ────────────────────────────────
// Clicking an icon opens a popover (marks.js). What it offers depends on the
// field, and each choice fills the field now and is saved for later forms:
//
//   sponsorship / work authorization  Yes or No, saved for that country only
//   worked here before                Yes or No, saved for this company only
//   a profile value (phone, links…)   saved to the Profile in the app
//   the company's own question        saved as an answer
//   a diversity question              kept in this browser only
//
// Saving goes through the background script, which holds the sign-in.
const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const yesNo = (text) => (/^\s*yes\b/i.test(text) ? 'Yes' : /^\s*no\b/i.test(text) ? 'No' : String(text ?? '').trim());
const sameGroup = (a, b) => a === b || (a.type === 'radio' && b.type === 'radio' && a.name && a.name === b.name);

function fieldOf(element) {
  const match = (list) => list.find((item) => sameGroup(item.element, element));
  return match(lastScan.found) ?? match(Fields.detectFields().found) ?? null;
}
function questionOf(element) {
  return Fields.detectQuestions().find((question) => { const tagged = byTag(question.id); return tagged && sameGroup(tagged, element); }) ?? null;
}

async function saveRemotely(type, target, value) {
  try { return (await chrome.runtime.sendMessage({ type, target, value })) ?? { ok: false, message: 'Not saved: the extension did not answer.' }; }
  catch { return { ok: false, message: 'Not saved: reload this page, the extension was updated.' }; }
}

/** Fills the field with the chosen value and updates its icon. */
async function fillChosen(element, value) {
  try { return await Filler.applyChoice(element, value); } catch (error) { return { filled: false, note: error.message }; }
}

async function finishChoice(element, done, saved, reason) {
  const target = done.element ?? element;
  if (done.filled && saved.ok) {
    await Marks.show([{ element: target, status: 'ok', reason }]);
    return { ok: true, message: 'Saved. Used on later forms too.' };
  }
  if (saved.ok) {
    await Marks.show([{ element: target, status: 'missing', reason: `Your default is saved, but it could not be filled here${done.note ? ` (${done.note})` : ''}. Choose it yourself.` }]);
    return { ok: true, message: 'Saved, but not filled here. Choose it in the form.' };
  }
  if (done.filled) await Marks.show([{ element: target, status: 'check', reason: 'Filled from your choice, but not saved as a default.' }]);
  return { ok: false, message: saved.message };
}

/** Answers the AI drafted in a popover, kept until used: the popover redraws from scratch. */
const drafts = new WeakMap();
/** Simplify's size for a written answer: at least 400 × 80 on screen. */
function canDraft(element) {
  const box = element.getBoundingClientRect();
  return element.matches('textarea, input[type="text"], input:not([type])') && box.width >= 400 && box.height >= 80;
}
/** Asks the background for Claude's draft, with what the page says about the job. */
async function askDraft(element, question, kind) {
  const linkedin = window.CVAutofillLinkedIn?.isPage() ? window.CVAutofillLinkedIn.read() : null;
  const job = {
    title: linkedin?.title || (document.querySelector('h1')?.innerText || document.title || '').trim(),
    company: linkedin?.company || companyName(),
    text: String(linkedin?.description || document.body?.innerText || '').slice(0, 20000),
  };
  const maxLength = element.maxLength > 0 ? element.maxLength : undefined;
  try {
    return (await chrome.runtime.sendMessage({ type: 'answer-draft', question, kind, ...(maxLength && { maxLength }), job, jobUrl: linkedin?.url ?? (IS_TOP ? location.href : null) }))
      ?? { ok: false, message: 'The extension did not answer. Try again.' };
  } catch { return { ok: false, message: 'Reload this page: the extension was updated.' }; }
}

/** What the icon's popover offers for this element, or null when it has no default (consent, CV, name…). */
async function editorFor(element) {
  if (!chrome.runtime?.id || !element.matches?.('input, select, textarea')) return null;
  let field = fieldOf(element);
  if (field?.key === 'heardAbout') {
    // Always answered with the link while its setting is on: nothing to choose.
    if (lastFill.profile.heardAbout) return null;
    field = null; // Off: the company's own question, with a saved answer.
  }
  const question = field ? null : questionOf(element);
  if (!field && !question) return null;
  if (field?.key === 'resume' || Fields.leftAlone(element)) return null;
  const { autofillDefaults = [], profile = {}, diversityAnswers = {} } = await chrome.storage.local.get(['autofillDefaults', 'profile', 'diversityAnswers']);
  const kind = Filler.controlKind(element);
  const formChoices = Filler.choicesFor(element);
  const inForm = () => Fields.currentAnswer(element, kind);
  const fromForm = kind === 'combobox' || kind === 'select' || kind === 'radio';
  const company = companyName();

  if (field && WORK_FIELDS.has(field.key)) return workEditor(element, field, autofillDefaults, profile);

  if (field && (ELIGIBILITY_FIELDS.has(field.key) || field.key === 'workedHereBefore')) {
    // "Worked here before" is one answer for every company; eligibility is per country.
    const scope = field.key === 'workedHereBefore' ? '' : field.country ?? '';
    const target = { type: 'default', kind: field.key, scope };
    const current = autofillDefaults.find((row) => row.kind === field.key && sameText(row.scope, scope))?.value ?? '';
    const what = { requiresSponsorship: 'Sponsorship', workAuthorization: 'Work authorization', workedHereBefore: 'Worked here before' }[field.key];
    const reason = field.key === 'workedHereBefore' ? 'Your answer for every company. Click to change it.' : scope ? `Your answer for ${scope}. Click to change it.` : 'Your answer. Click to change it.';
    const choose = async (value) => {
      const answer = yesNo(value);
      const done = await fillChosen(element, answer);
      return finishChoice(element, done, await saveRemotely('default-save', target, answer), reason);
    };
    return {
      heading: scope ? `${what} · ${scope}` : what,
      currentLabel: field.key === 'workedHereBefore' ? 'Your answer for every company' : scope ? `Your answer for ${scope}` : 'Your answer',
      current,
      choices: ['Yes', 'No'],
      fromForm: kind === 'combobox',
      canReset: Boolean(current),
      note: field.key === 'workedHereBefore' ? 'Used for every company, except one your CV lists as an employer.' : scope ? `Saved for ${scope} only. Other countries are asked separately.` : 'Used when a question names no country.',
      choose,
      saveFromForm: async () => {
        const value = yesNo(inForm());
        if (!value) return { ok: false, message: 'Choose an option in the form first.' };
        return finishChoice(element, { filled: true }, await saveRemotely('default-save', target, value), reason);
      },
      reset: async () => {
        const result = await saveRemotely('default-reset', target);
        return result.ok ? { ok: true, message: 'Forgotten. The field keeps its value.' } : result;
      },
    };
  }

  if (field?.diversity) {
    const current = diversityAnswers[field.key] ?? '';
    const store = async (choice) => {
      const { diversityAnswers: saved = {} } = await chrome.storage.local.get('diversityAnswers');
      await chrome.storage.local.set({ diversityAnswers: { ...saved, [field.key]: choice } });
      return { ok: true };
    };
    const canonical = (text) => Filler.diversityChoiceFor(field.key, text) ?? String(text).trim();
    return {
      heading: Fields.labelOf(element).slice(0, 60),
      current,
      choices: formChoices,
      fromForm: kind === 'combobox',
      canReset: Boolean(current),
      note: 'Kept in this browser only. Diversity answers fill only when switched on in Settings → Fields to fill.',
      choose: async (value) => finishChoice(element, await fillChosen(element, value), await store(canonical(value)), 'From your diversity answers'),
      saveFromForm: async () => { const value = inForm(); return value ? finishChoice(element, { filled: true }, await store(canonical(value)), 'From your diversity answers') : { ok: false, message: 'Choose an option in the form first.' }; },
      reset: async () => {
        const { diversityAnswers: saved = {} } = await chrome.storage.local.get('diversityAnswers');
        const { [field.key]: _gone, ...rest } = saved;
        await chrome.storage.local.set({ diversityAnswers: rest });
        return { ok: true, message: 'Forgotten. "Prefer not to answer" is used again.' };
      },
    };
  }

  if (field) {
    if (!PROFILE_DEFAULTS.has(field.key)) return null;
    const target = { type: 'profile', key: field.key };
    const current = String(profile[field.key] ?? '').trim();
    const save = async (value, done) => finishChoice(element, done, await saveRemotely('default-save', target, value), 'From your profile');
    return {
      heading: Fields.labelOf(element).slice(0, 60),
      currentLabel: 'In your profile',
      current,
      choices: formChoices,
      text: formChoices ? null : { value: current || inForm() },
      fromForm,
      canReset: false,
      note: current ? 'Saved to your Profile in the app. Change or clear it there too.' : 'Save to Profile fills it on later forms too. Just this time fills only this one.',
      choose: async (value) => (String(value).trim() ? save(String(value).trim(), await fillChosen(element, value)) : { ok: false, message: 'Type a value first.' }),
      // Typed values only: fills this field and saves nothing.
      once: formChoices ? null : async (value) => {
        const text = String(value).trim();
        if (!text) return { ok: false, message: 'Type a value first.' };
        const done = await fillChosen(element, text);
        if (!done.filled) return { ok: false, message: done.note || 'This field could not be filled. Type it in the form.' };
        await Marks.show([{ element: done.element ?? element, status: 'ok', reason: 'Filled for this form only. Not saved to your Profile.' }]);
        return { ok: true, message: 'Filled for this form only.' };
      },
      saveFromForm: async () => { const value = inForm(); return value ? save(value, { filled: true }) : { ok: false, message: 'Fill it in the form first.' }; },
    };
  }

  // The company's own question: saved as an answer, found again on the next form that asks it.
  const target = { type: 'answer', question: question.question, company };
  const used = lastFill.answers.get(String(question.id));
  const current = used?.value ?? '';
  const save = async (value, done) => finishChoice(element, done, await saveRemotely('default-save', target, value), 'From your saved answers');
  const multiline = kind === 'textarea';
  return {
    heading: '',
    currentLabel: 'Your saved answer',
    current: current.length > 80 ? `${current.slice(0, 80)}…` : current,
    choices: formChoices,
    text: formChoices ? null : { value: drafts.get(element) ?? (current || inForm()), multiline },
    // Typed answers only: fills this field and saves nothing.
    once: formChoices ? null : async (value) => {
      const answer = String(value).trim();
      if (!answer) return { ok: false, message: 'Type an answer first.' };
      const done = await fillChosen(element, answer);
      if (!done.filled) return { ok: false, message: done.note || 'This field could not be filled. Type it in the form.' };
      drafts.delete(element);
      await Marks.show([{ element: done.element ?? element, status: 'check', reason: 'Your answer for this form only. Not saved for later forms.' }]);
      return { ok: true, message: 'Filled for this form only.' };
    },
    // As Simplify does: a box big enough for a written answer (at least 400 × 80) can have one drafted.
    generate: formChoices || !canDraft(element) ? null : async () => {
      const reply = await askDraft(element, question.question, kind);
      if (!reply.ok) return reply;
      const asks = reply.needsInput?.length ? reply.needsInput.join('; ') : '';
      if (!reply.answer) return { ok: false, message: asks ? `Only you can answer this: ${asks}` : 'Your CV does not answer this. Write it yourself.' };
      drafts.set(element, reply.answer);
      return { ok: true, message: asks ? `Written from your CV. Check: ${asks}` : 'Written from your CV and the job. Read it, then save it or use it just this time.' };
    },
    fromForm,
    canReset: Boolean(used),
    note: 'Saved to your answers in the app, and used when another form asks this question.',
    choose: async (value) => (String(value).trim() ? save(String(value).trim(), await fillChosen(element, value)) : { ok: false, message: 'Type an answer first.' }),
    saveFromForm: async () => { const value = inForm(); return value ? save(value, { filled: true }) : { ok: false, message: 'Answer it in the form first.' }; },
    reset: async () => {
      const result = await saveRemotely('default-reset', { type: 'answer', question: used?.savedQuestion || question.question });
      if (result.ok) lastFill.answers.delete(String(question.id));
      return result.ok ? { ok: true, message: 'Forgotten. The field keeps its value.' } : result;
    },
  };
}
/**
 * Office, hybrid, remote and relocation questions. The types of work you
 * accept go to the Profile; relocation is saved per country. Each change
 * answers the question again from the new preferences.
 */
function workEditor(element, field, defaults, profile) {
  const kinds = String(profile.workArrangements ?? '').split(',').filter(Boolean);
  const relocation = (rows) => Object.fromEntries(rows.filter((row) => row.kind === 'willingToRelocate').map((row) => [row.scope, row.value]));
  // Answers the question again from what is saved now.
  const refill = async () => {
    const stored = await chrome.storage.local.get(['profile', 'autofillDefaults']);
    const latest = { ...lastFill.profile, workArrangements: stored.profile?.workArrangements ?? '', country: stored.profile?.country ?? lastFill.profile.country, relocation: relocation(stored.autofillDefaults ?? []) };
    lastFill.profile = latest;
    const done = await Filler.fillOne(field, latest, {});
    const decision = Filler.workDecision(field, latest);
    const mark = done.mark ?? (decision.why ? { element, status: 'missing', reason: explain(element) } : null);
    if (mark) await Marks.show([mark]);
    return done.filled;
  };
  const multi = (!kinds.length || field.key === 'workArrangement' || field.office) && {
    label: kinds.length ? 'Types of work you accept' : 'Choose the types of work you accept',
    options: WORK_OPTIONS,
    selected: kinds,
    save: async (values) => {
      if (!values.length) return { ok: false, message: 'Choose at least one.' };
      const saved = await saveRemotely('default-save', { type: 'profile', key: 'workArrangements' }, WORK_OPTIONS.map((item) => item.value).filter((value) => values.includes(value)).join(','));
      if (!saved.ok) return saved;
      return { ok: true, message: (await refill()) ? 'Saved to your Profile, and answered.' : 'Saved to your Profile.' };
    },
  };
  const named = WORK_OPTIONS.filter((item) => kinds.includes(item.value)).map((item) => item.label).join(', ');
  if (field.key === 'workArrangement') {
    return { heading: 'Types of work', currentLabel: 'You accept', current: named, multi, canReset: false, note: 'Saved to your Profile in the app. Used for every office, hybrid and remote question.' };
  }
  const scope = field.country ?? '';
  const target = { type: 'default', kind: 'willingToRelocate', scope };
  const current = defaults.find((row) => row.kind === 'willingToRelocate' && sameText(row.scope, scope))?.value ?? '';
  return {
    heading: scope ? `Relocate · ${scope}` : 'Relocate',
    currentLabel: scope ? `Relocate to ${scope}` : 'Relocate',
    current,
    choices: ['Yes', 'No'],
    multi,
    canReset: Boolean(current),
    note: `${scope ? `Saved for ${scope} only. Other countries are asked separately.` : 'Used when a question names no country.'}${field.office ? ' This question also asks about office work, so the types of work you accept count too.' : ''}`,
    choose: async (value) => {
      const saved = await saveRemotely('default-save', target, yesNo(value));
      if (!saved.ok) return saved;
      return { ok: true, message: (await refill()) ? 'Saved, and answered.' : 'Saved. Choose the types of work you accept too.' };
    },
    reset: async () => {
      const result = await saveRemotely('default-reset', target);
      return result.ok ? { ok: true, message: 'Forgotten. The field keeps its value.' } : result;
    },
  };
}
Marks?.setEditor(editorFor);

/** Scrolls to a field from the panel's "still empty" list and outlines it briefly. */
function focusField(id) {
  const element = Fields.byTag(id);
  if (!element) return false;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const target = element.matches('input, select, textarea') && element.getClientRects().length ? element : element.closest('label') ?? element;
  target.focus?.({ preventScroll: true });
  const before = target.style.outline;
  target.style.outline = '3px solid #e6ff00';
  setTimeout(() => { target.style.outline = before; }, 1800);
  // Once the scroll settles, show why it is empty beside it.
  setTimeout(() => Marks?.point(element), 450);
  return true;
}

// ─── Next steps of a multi-step form ────────────────────────────────────
// Settings → "Keep filling the next steps" (off by default). After the person
// presses Autofill, the panel arms this tab in the background script for 30
// minutes on this site. Fields that appear later (the next step, or the next
// page) are filled from that same data. Fields already seen are never touched
// again, so anything the person cleared or changed stays as they left it.
const seenFields = new WeakSet(), seenQuestions = new Set();
let stepsArmed = false, stepBusy = false, stepTimer;

function rememberStep() {
  for (const field of Fields.detectFields().found) seenFields.add(field.element);
  for (const question of Fields.detectQuestions()) seenQuestions.add(question.id);
}

function isBlank(field) {
  const element = field.element;
  if (field.kind === 'drop') return !Fields.zoneDone(element);
  if (field.kind === 'file') return !element.files?.length;
  if (field.kind === 'radio') return !Fields.radiosOf(element).some((radio) => radio.checked);
  if (field.kind === 'checkbox') return !element.checked;
  return Fields.isEmpty(element);
}

function scheduleStep() {
  if (!stepsArmed) return;
  clearTimeout(stepTimer);
  stepTimer = setTimeout(() => void fillNextStep(), 900);
}

async function fillNextStep() {
  if (stepBusy || !chrome.runtime?.id) return;
  const found = Fields.detectFields().found.filter((field) => !seenFields.has(field.element));
  const questions = Fields.detectQuestions().filter((question) => !seenQuestions.has(question.id) && !question.value);
  found.forEach((field) => seenFields.add(field.element));
  questions.forEach((question) => seenQuestions.add(question.id));
  const fresh = found.filter(isBlank);
  if (!fresh.length && !questions.length) return;
  // Only this step's new fields are explained, so the page never jumps back up to earlier ones.
  const isNew = new Set([...found.map((field) => field.element), ...questions.map((question) => byTag(question.id))]);
  stepBusy = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'step-request', questions });
    if (!reply?.armed) { stepsArmed = false; return; }
    const hooks = Marks?.fillHooks(await Marks.animationMode());
    lastFill = { profile: reply.profile, failed: lastFill.failed, answers: new Map([...lastFill.answers, ...(reply.answers ?? []).map((item) => [String(item.id), item])]) };
    const result = await runPass({ found: fresh, profile: reply.profile, answers: reply.answers ?? [], hooks, explainIf: (element) => isNew.has(element) });
    await hooks?.finish?.(fresh);
    hooks?.end();
    await Marks?.showMissing(missingWithReasons());
    if (result.filled) void chrome.runtime.sendMessage({ type: 'step-filled', filled: result.filled, notes: result.notes }).catch(() => {});
  } catch { /* extension reloaded or background unavailable: leave the step for the person */ }
  finally { stepBusy = false; }
}

const fromPanel = (sender) => Boolean(sender.url?.startsWith(chrome.runtime.getURL('src/sidepanel.html')));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The background script, after the panel armed this tab for next steps.
  if (message.type === 'steps-armed' && sender.id === chrome.runtime.id && !sender.tab) {
    stepsArmed = true;
    return false;
  }
  if (message.type === 'scan') {
    // The logo only for the panel: finding it reads the page's images, too much for every page change.
    const result = scan();
    const { logo, domain } = window.CVAutofillLogo?.find(result.context.company) ?? {};
    sendResponse({ ...result, context: { ...result.context, postedAt: window.CVAutofillJobDetails?.postedAt?.() ?? null, logo: logo ?? null, logoDomain: domain ?? null } });
    return false;
  }

  // Filling happens only when the person presses "Autofill This Page" in the
  // panel. Nothing else may ask for it: not page loads, scans or the launcher.
  if (message.type === 'fill') {
    if (!fromPanel(sender)) return false;
    // Async reply: returning true keeps the message channel open.
    fill(message.profile, message.answers).then(sendResponse);
    return true;
  }

  if (!fromPanel(sender)) return false;
  if (message.type === 'questions') {
    sendResponse({ questions: Fields.detectQuestions(Fields.detectFields().found) });
    return false;
  }
  if (message.type === 'replace-cv') {
    // The person chose another CV after Autofill uploaded one: put the new one in its place.
    // A file field takes the new file; an upload box that already holds a file is left alone
    // (most only add files), and its icon says to replace the CV by hand.
    void (async () => {
      let replaced = 0, kept = 0;
      for (const field of Fields.detectFields().found.filter((item) => item.key === 'resume')) {
        try {
          if (field.kind === 'file') {
            if (await Filler.attachFile(field.element, message.dataUrl, message.fileName)) {
              replaced++;
              await Marks?.show([{ element: field.element, status: 'ok', reason: `Your CV attached: ${message.fileName}` }]);
            }
          } else if (field.kind === 'pick') {
            if ((await Filler.pickFile(field.element, message.dataUrl, message.fileName)).filled) {
              replaced++;
              await Marks?.show([{ element: field.element, status: 'ok', reason: `Your CV attached: ${message.fileName}` }]);
            }
          } else if (field.kind === 'drop') {
            if (Fields.zoneDone(field.element)) {
              kept++;
              await Marks?.show([{ element: field.element, status: 'check', reason: `This upload box keeps the old CV. Remove it, then upload ${message.fileName}.` }]);
            } else if ((await Filler.dropFile(field.element, message.dataUrl, message.fileName)).filled) {
              replaced++;
              await Marks?.show([{ element: field.element, status: 'ok', reason: `Your CV attached: ${message.fileName}` }]);
            }
          }
        } catch { /* leave this field as it is */ }
      }
      sendResponse({ replaced, kept });
    })();
    return true;
  }
  if (message.type === 'job-details') {
    // For the panel's "Save job" form: what the page says about the job, checked by the person before saving.
    const context = scan().context;
    let details = {};
    try { details = window.CVAutofillJobDetails?.read() ?? {}; } catch { /* the form opens with what is known */ }
    sendResponse({ title: context.title, company: context.company, url: context.jobUrl || location.href, ...details });
    return false;
  }
  if (message.type === 'check-required') {
    const missing = missingWithReasons();
    void Marks?.showMissing(missing);
    sendResponse({ missing });
    return false;
  }
  if (message.type === 'focus-field') {
    sendResponse({ ok: focusField(message.id) });
    return false;
  }
  if (message.type === 'open-form') {
    // Only when the person presses "Open application form" in the panel.
    const opener = Sites.formOpener();
    opener?.click();
    sendResponse({ ok: Boolean(opener) });
    return false;
  }
  return false;
});

// Show the launcher on application forms and selected LinkedIn postings.
// Ordinary pages without inputs are skipped.
const KNOWN_BOARD = Boolean(Sites.siteFor(location.hostname)) || location.protocol === 'file:';

// This script also runs in iframes, where an embedded application form may
// live (a Greenhouse form on a company's careers page). Tiny frames (ads,
// trackers) are left alone. A frame with a form tells the top page, which
// opens the one panel for the tab.
const IS_TOP = window === window.top;
const TINY_FRAME = !IS_TOP && (innerWidth < 250 || innerHeight < 150);
const framesWithForms = new Set();
let frameVerdict = null;
/**
 * What this page last found, kept so a frame's report reuses it instead of
 * guessing: show the button; form, the form itself is here (the panel may open
 * by itself); frames, whether forms in iframes count (not on LinkedIn, where
 * only Easy Apply opens it); reason, said in the console when it opens.
 */
let own = { show: false, form: false, frames: true, reason: '', closeWhenGone: false };
let lastOwnForm = false;
function showLauncher(next) {
  if (next) { own = { form: true, frames: true, reason: '', closeWhenGone: false, ...next }; lastOwnForm = own.show; }
  if (IS_TOP) {
    const framed = own.frames && framesWithForms.size > 0;
    window.CVAutofillLauncher?.update(own.show || framed, {
      form: (own.show && own.form) || framed,
      reason: own.show && own.form ? own.reason : 'an application form in a frame',
      closeWhenGone: own.closeWhenGone,
    });
    return;
  }
  if (own.show === frameVerdict) return;
  frameVerdict = own.show;
  window.top.postMessage({ adcvFrameForm: own.show }, '*');
}
if (IS_TOP) {
  // Announces a form only: opening the panel never fills or submits anything.
  addEventListener('message', (event) => {
    if (typeof event.data?.adcvFrameForm !== 'boolean' || event.source === window) return;
    if (event.data.adcvFrameForm) framesWithForms.add(event.source); else framesWithForms.delete(event.source);
    showLauncher();
  });
}
let lastLinkedInContext;
/** On screen for real: a box of some size in the viewport, and nothing above it hides it. */
function shown(element) {
  const box = element.getBoundingClientRect();
  if (box.width < 40 || box.height < 40 || box.bottom <= 0 || box.right <= 0 || box.top >= innerHeight || box.left >= innerWidth) return false;
  for (let node = element; node; node = node.parentElement ?? node.getRootNode().host) {
    if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  }
  return true;
}
/** Matches inside an element, its descendants and the shadow roots within, skipping our own elements. */
function within(box, selector) {
  const roots = [box, ...(box.shadowRoot ? [box.shadowRoot] : [])];
  for (let i = 0; i < roots.length; i++)
    for (const element of roots[i].querySelectorAll('*')) if (element.shadowRoot && !OWN_NODES.has(element.id)) roots.push(element.shadowRoot);
  return roots.flatMap((root) => [...root.querySelectorAll(selector)]);
}
/**
 * Easy Apply in this box: its upload boxes or header ids, its "Apply to …"
 * heading, or fields with a Next / Review / Submit button. Other LinkedIn
 * windows (sign-in, job alerts, sharing) have none of these; a password field
 * rules a box out.
 */
const EASY_APPLY_BUTTON = /^(next|review|submit application|continue to next step|review your application)$/i;
function looksLikeEasyApply(box) {
  if (within(box, 'input[type="password"]').length) return false;
  if (within(box, '[id^="easyApply"], .jobs-easy-apply-content, .jobs-easy-apply-modal, #jobs-apply-header').length) return true;
  if (within(box, 'h1, h2, h3, [role="heading"]').some((heading) => /^apply to\b/i.test(heading.textContent.trim()))) return true;
  return within(box, 'input:not([type="hidden"]), textarea, select').length > 0
    && within(box, 'button').some((button) => EASY_APPLY_BUTTON.test(button.textContent.replace(/\s+/g, ' ').trim()));
}
/**
 * LinkedIn's Easy Apply on screen, or null. LinkedIn shows it as a window in
 * Chrome's top layer (a page-sized popover or a modal <dialog>, its form inside
 * #interop-outlet's shadow root), so the open top-layer window is checked
 * first; then any dialog drawn where Easy Apply is (older pages: .jobs-easy-apply-modal).
 */
function easyApplyDialog() {
  const top = window.CVAutofillTopLayer?.window();
  if (top && !OWN_NODES.has(top.id) && looksLikeEasyApply(top)) return top;
  // The whole page: this is what finds the window the field scope narrows to.
  return Fields.deepAll('[role="dialog"]', Fields.allRoots()).find((dialog) => {
    const root = dialog.getRootNode();
    if (!dialog.matches('.jobs-easy-apply-modal') && !(root instanceof ShadowRoot && root.host.id === 'interop-outlet')) return false;
    return shown(dialog) && looksLikeEasyApply(dialog);
  }) ?? null;
}
// On LinkedIn the only application form is the Easy Apply window: fields are looked for
// there and nowhere else, so its search filters never get filled or marked.
if (window.CVAutofillLinkedIn?.isPage()) Fields.setScope(() => easyApplyDialog());

function updateLauncher() {
  if (TINY_FRAME) return;
  scheduleStep();
  // Before anything returns: LinkedIn's Easy Apply changes steps inside a shadow root.
  watchShadowRoots();
  if (window.CVAutofillLinkedIn?.isPage()) {
    const job = window.CVAutofillLinkedIn.read();
    const context = JSON.stringify([job?.url, job?.title, job?.company, job?.location, job?.description]);
    if (IS_TOP && context !== lastLinkedInContext) {
      lastLinkedInContext = context;
      try { void chrome.runtime.sendMessage({ type: 'job-context-changed' }).catch(() => {}); } catch { /* extension reloaded */ }
    }
    // A selected posting shows the button; the panel opens by itself only for
    // Easy Apply, and closes again when Easy Apply goes away. Nothing else on
    // LinkedIn opens it: not its search boxes, not its iframes.
    const dialog = easyApplyDialog();
    const heading = dialog && within(dialog, 'h1, h2, h3')[0]?.textContent.replace(/\s+/g, ' ').trim();
    showLauncher({ show: Boolean(job || dialog), form: Boolean(dialog), frames: false, closeWhenGone: true,
      reason: `LinkedIn Easy Apply${heading ? ` ("${heading.slice(0, 60)}")` : ''}` });
    if (lastOwnForm) formChanged();
    return;
  }
  if (!Fields.deepOne('input, textarea, select')) {
    // A job page whose form is one click away (Ashby's Overview tab, Lever's posting):
    // the button shows, and the panel offers to open the form. It opens by itself once
    // the form is on the page.
    showLauncher({ show: Boolean(Sites.formOpener()), form: false });
    lastOwnForm = false;
    return;
  }
  scan();
  // Teamtailor and other boards on company domains are known by page structure.
  const verdict = window.CVAutofillJobForm.assess(lastScan.found, { knownSite: KNOWN_BOARD || Boolean(Sites.siteForPage()) });
  // Always passed on: update() also puts the button back if the page removed it.
  showLauncher({ show: verdict.show, reason: verdict.reason });
}

/**
 * React and Remix pages (Greenhouse's job boards) can throw away the whole
 * <html> element while starting up, taking the D! button, panel and icons with
 * it. After any change, each puts itself back if it should be on the page.
 */
function reattachOwnElements() {
  window.CVAutofillLauncher?.reattach?.();
  window.CVAutofillPanel?.reattach?.();
  window.CVAutofillMarks?.reattach?.();
}
let scanTimer;
const scheduleScan = () => {
  if (window.CVAutofillLinkedIn?.isPage()) {
    // Busy search pages keep mutating; coalesce changes without postponing a
    // new selection indefinitely. React also updates text nodes in place.
    if (!scanTimer) scanTimer = setTimeout(() => { scanTimer = null; updateLauncher(); }, 300);
  } else { clearTimeout(scanTimer); scanTimer = setTimeout(updateLauncher, KNOWN_BOARD ? 140 : 600); }
};
const OWN_NODES = new Set(['adcv-autofill-launcher', 'adcv-autofill-panel', 'adcv-fill-marks']);
const pageWatcher = new MutationObserver(records => {
  reattachOwnElements();
  const changed = records.some(record => {
    if (OWN_NODES.has(record.target.id)) return false;
    if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => OWN_NODES.has(node.id))) return false;
    return true;
  });
  if (changed) scheduleScan();
});
// The document, not <html>: a page that replaces its <html> element would
// otherwise leave this watching a detached copy. Tiny frames are not watched.
if (!TINY_FRAME) pageWatcher.observe(document, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: Boolean(window.CVAutofillLinkedIn?.isPage()),
  // class/style change constantly on busy sites; job boards need them to spot step changes.
  attributeFilter: window.CVAutofillLinkedIn?.isPage() ? ['hidden', 'disabled', 'type', 'class', 'style', 'data-job-id', 'href', 'aria-expanded', 'open', 'popover']
    : KNOWN_BOARD ? ['hidden', 'disabled', 'readonly', 'type', 'class', 'style'] : ['hidden', 'disabled', 'type'],
});

/**
 * The person's own click on the form's Submit button ("Submit application" on
 * LinkedIn): the saved job moves to Applied in the app. Only a real click,
 * never Autofill's; only with no required field left empty, so a form that
 * will not send does not count; and the background moves only a job still
 * Saved, so a later stage is never undone.
 */
/**
 * What this application said, kept step by step: a multi-step form (LinkedIn's
 * Easy Apply) shows one step at a time, so each step is read before it goes.
 * Sent to the saved job when the person submits; the app shows it on the job
 * as "Your answers". Diversity answers are left out.
 */
const applicationAnswers = new Map();
const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
function keepAnswers() {
  try {
    const { found } = Fields.detectFields();
    const add = (question, answer) => {
      const q = clip(question, 500).replace(/\s*\*\s*$/, ''), a = clip(answer, 5000);
      if (q && a) applicationAnswers.set(q.toLowerCase(), { question: q, answer: a });
    };
    for (const field of found) {
      if (field.diversity) continue;
      const element = field.element;
      if (field.kind === 'pick') { if (element.dataset.adcvPicked && element.dataset.adcvPicked !== '1') add(field.key === 'coverLetter' ? 'Cover letter' : 'Resume', element.dataset.adcvPicked); continue; }
      if (field.kind === 'file') { if (element.files?.[0]) add(field.key === 'coverLetter' ? 'Cover letter' : 'Resume', element.files[0].name); continue; }
      if (field.kind === 'drop') continue;
      add(Fields.labelOf(element), Fields.currentAnswer(element, Filler.controlKind(element)));
    }
    for (const item of Fields.detectQuestions(found)) add(item.question, item.value);
  } catch { /* a page mid-change: the next read catches up */ }
}
const keptAnswers = () => [...applicationAnswers.values()].slice(0, 200);

// Any of the person's clicks on a button (Next, Review): read the step before it changes.
addEventListener('click', (event) => {
  if (!event.isTrusted || TINY_FRAME) return;
  if (event.composedPath().some((node) => node instanceof Element && node.matches('button, [role="button"], input[type="submit"]'))) keepAnswers();
}, true);

const SUBMIT_TEXT = /^(?:submit|(?:submit|send|complete|finish)(?: (?:your|my|the))? application)$/i;
let submittedAt = 0;
addEventListener('click', (event) => {
  if (!event.isTrusted || TINY_FRAME || Date.now() - submittedAt < 10_000) return;
  const button = event.composedPath().find((node) => node instanceof Element && node.matches('button, input[type="submit"], [role="button"]'));
  const text = String(button?.matches('input') ? button.value : button?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!button || !SUBMIT_TEXT.test(text)) return;
  const linkedin = window.CVAutofillLinkedIn?.isPage() ? window.CVAutofillLinkedIn.read() : null;
  if (!linkedin && !lastOwnForm && !Fields.detectFields().found.length) return;
  if (Fields.findMissingRequired().length) return;
  submittedAt = Date.now();
  keepAnswers();
  // An embedded form's own address is not the job's: the background uses the tab's then.
  try { void chrome.runtime.sendMessage({ type: 'application-submitted', jobUrl: linkedin?.url ?? (IS_TOP ? location.href : null), answers: keptAnswers() }).catch(() => {}); } catch { /* extension reloaded */ }
}, true);

/**
 * Tells the panel when the form's fields change while the page stays the same
 * (the next step of LinkedIn's Easy Apply), so its list and Autofill are current.
 */
let lastFormFields = '';
function formChanged() {
  if (!IS_TOP) return;
  const fields = Fields.detectFields().found.map((field) => `${field.key}:${field.kind}`).sort().join(',');
  if (fields === lastFormFields) return;
  lastFormFields = fields;
  try { void chrome.runtime.sendMessage({ type: 'form-changed' }).catch(() => {}); } catch { /* extension reloaded */ }
}

/**
 * Forms inside open shadow roots (LinkedIn's Easy Apply) change where the
 * document watcher cannot see. Each root found by a scan is watched as well.
 */
const watchedRoots = new WeakSet();
function watchShadowRoots() {
  if (TINY_FRAME) return;
  for (const root of Fields.allRoots()) { // The whole page: the Easy Apply window appears inside one.
    if (root === document || watchedRoots.has(root)) continue;
    watchedRoots.add(root);
    pageWatcher.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'type', 'class', 'style', 'aria-checked', 'aria-selected'] });
  }
}
addEventListener('resize', scheduleScan);
// Opening a popover or a modal <dialog> (LinkedIn's Easy Apply) can change
// nothing the watcher sees: catch their events on the way down.
for (const type of ['toggle', 'close']) document.addEventListener(type, scheduleScan, true);
addEventListener('popstate', scheduleScan);
addEventListener('hashchange', scheduleScan);
addEventListener('adcv-job-ready', scheduleScan);
updateLauncher();

// A new page of an armed multi-step form fills once its fields are on screen.
try {
  chrome.runtime.sendMessage({ type: 'steps-state' }).then((state) => { if (state?.armed) { stepsArmed = true; scheduleStep(); } }).catch(() => {});
} catch { /* extension reloaded */ }
