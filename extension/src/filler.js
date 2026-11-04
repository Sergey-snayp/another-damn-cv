/**
 * Writing values into fields.
 *
 * Finding the field is the easy half. The hard half is convincing React that a
 * human typed in it: assigning `element.value` updates the DOM but not React's
 * internal state, so the form submits empty. That single bug is why most
 * hand-rolled autofill "works" on screen and fails on submit.
 */

function nativeSetter(element) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;

  return Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
}

function setValue(element, value) {
  const setter = nativeSetter(element);

  if (setter) setter.call(element, value);
  else element.value = value;

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Typing ───────────────────────────────────────────────────────────────
// Text goes in through the browser's own editing ("insert text"), so the page
// gets the same input events as from typing or pasting. React, Angular and
// plain pages all register it. Fields that refuse it get a keyboard-like
// sequence instead: key down, key press, the value, input, key up, change.

const EDITABLE = new Set(['text', 'email', 'tel', 'url', 'search', 'number', 'password', '']);
let typing = false;
/** True while Autofill types: its input events are trusted, but they are not the person's edits. */
const isTyping = () => typing;

function keyboardSequence(element, text) {
  const key = String(text).slice(-1) || 'a';
  const options = { bubbles: true, cancelable: true, key };
  element.dispatchEvent(new KeyboardEvent('keydown', options));
  element.dispatchEvent(new KeyboardEvent('keypress', options));
  setValue(element, text);
  element.dispatchEvent(new KeyboardEvent('keyup', options));
}

/**
 * Replaces a text field's value as typing would. Returns how: 'insert' or
 * 'events'. With `leave`, focus moves on inside the same typing window: the
 * browser's own change event on leaving is Autofill's, not the person's edit.
 */
function typeText(element, value, { leave = false } = {}) {
  const text = String(value);
  const editable = element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && EDITABLE.has(element.type));
  const x = scrollX, y = scrollY;
  typing = true;
  try {
    element.focus({ preventScroll: true });
    let how = 'events';
    if (editable && document.activeElement === element) {
      try {
        element.select();
        if (document.execCommand('insertText', false, text) && element.value === text) {
          element.dispatchEvent(new Event('change', { bubbles: true }));
          how = 'insert';
        }
      } catch { /* not allowed here: fall back to events */ }
    }
    if (how === 'events') keyboardSequence(element, text);
    if (leave) element.blur();
    return how;
  } finally {
    typing = false;
    // Inserting text can scroll to the caret; the follow-along decides where the page is.
    if (scrollX !== x || scrollY !== y) scrollTo({ left: x, top: y, behavior: 'instant' });
  }
}

function fillText(element, value) {
  if (!value) return false;

  typeText(element, value, { leave: true });

  return true;
}

/**
 * Native <select>: pick the option whose text or value matches.
 *
 * Matching is loose because forms disagree on wording — "Canada" against
 * "CA", "Yes" against "yes, I am authorized". An exact match is preferred and
 * a contains-match is the fallback.
 */
function fillSelect(element, value) {
  if (!value) return false;

  const wanted = String(value).toLowerCase().trim();
  const options = [...element.options];

  const exact = options.find((option) =>
    option.value.toLowerCase() === wanted || option.text.toLowerCase().trim() === wanted);

  const loose = options.find((option) => {
    const text = option.text.toLowerCase();
    return text.includes(wanted) || wanted.includes(text.trim());
  });

  const chosen = exact ?? loose;
  if (!chosen) return false;

  element.focus({ preventScroll: true });
  setValue(element, chosen.value);
  element.blur();

  return true;
}

/** Checkboxes and radios need a click, not a value — React listens for it. */
function fillChoice(element, value) {
  const wanted = String(value).toLowerCase();
  const truthy = wanted === 'true' || wanted === 'yes' || wanted === '1';

  if (element.type === 'checkbox') {
    if (element.checked === truthy) return false;
    element.click();
    return true;
  }

  const label = (element.labels?.[0]?.textContent ?? element.value ?? '').toLowerCase();
  if (!label.includes(wanted)) return false;

  element.click();
  return true;
}

/**
 * File inputs are read-only by design — `.files` cannot be assigned. A
 * DataTransfer is the one supported route, which is why the resume is stored as
 * a data URL: a content script cannot read a path off the disk.
 */
async function attachFile(element, fileUrl, fileName) {
  if (!fileUrl) return false;

  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Could not read the file (${response.status})`);

  const blob = await response.blob();
  const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });

  const transfer = new DataTransfer();
  transfer.items.add(file);

  element.files = transfer.files;
  element.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normal = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A number field takes only the number in a profile value: "$120,000 CAD" → 120000. */
function fillNumber(element, value) {
  const digits = String(value).replace(/[\s,]/g, '').match(/\d+(\.\d+)?/);
  return digits ? fillText(element, digits[0]) : false;
}

function visible(element) {
  return element.getClientRects().length > 0;
}

/** The suggestion list a combobox controls, or every open option list on the page. */
function optionsFor(element) {
  const ids = [element.getAttribute('aria-controls'), element.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const lists = ids.map((id) => document.getElementById(id)).filter(Boolean);
  const scope = lists.length ? lists : [document];
  // react-select options have ids like react-select-3-option-0 and no role.
  return scope.flatMap((list) => [...list.querySelectorAll('[role="option"], [id*="-option-"]')]).filter(visible);
}

function press(element) {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  element.click();
}

const optionText = (option) => normal(option.textContent);

/**
 * Types into a suggestion box the way a keyboard does: key down, the text,
 * key up. Some dropdowns open their list only on key-up; Greenhouse's
 * Location (City) searches on the text but shows results after a key-up.
 */
function typeInto(element, text) {
  const key = String(text).slice(-1) || 'a';
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
  typeText(element, text);
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key }));
}

/** The suggestion list once it stops changing: search results often arrive in stages and are redrawn. */
async function settledOptions(element, timeout = 4500) {
  let last = '', steady = 0;
  for (let waited = 0; waited < timeout; waited += 150) {
    await wait(150);
    const options = optionsFor(element);
    const key = options.map((option) => option.textContent).join('|');
    if (options.length && key === last) { if (++steady >= 2) return options; } else steady = 0;
    last = key;
  }
  return optionsFor(element);
}

/** Whether the box now shows the chosen option, not just the text that was typed. */
function choiceShown(element, chosen, typed) {
  const same = (text) => text === chosen || text.includes(chosen) || chosen.includes(text);
  // react-select: the choice is shown beside the input.
  const picked = normal(window.CVAutofillFields.chosenValue(element));
  if (picked) return same(picked);
  // Plain suggestion boxes put the choice in the input. If that is just the typed
  // text ("Canada" picking "Canada"), it counts once the list has closed.
  const text = normal(element.value);
  if (!text) return false;
  return text !== normal(typed) ? same(text) : text === chosen && optionsFor(element).length === 0;
}

/**
 * The text of the option the list highlights (aria-activedescendant, or
 * react-select's "is-focused" class), '' when none is, and null when the list
 * does not show its highlight at all.
 */
function highlighted(element) {
  const id = element.getAttribute('aria-activedescendant');
  const node = (id && document.getElementById(id)) || optionsFor(element).find((item) => /(^|[\s_-])(is-)?focused\b/.test(item.className));
  if (node) return optionText(node);
  return element.hasAttribute('aria-activedescendant') ? '' : null;
}

/**
 * Last resort for React dropdowns: asks the page-world script (page-world.js)
 * to call the option's own React click handler. Only a tag on the option
 * element is sent. Resolves whether the handler was found and called.
 */
let pickCount = 0;
function reactPick(option) {
  return new Promise((resolve) => {
    const token = `pick-${++pickCount}`;
    option.setAttribute('data-adcv-pick', token);
    const finish = (ok) => {
      document.removeEventListener('adcv:react-picked', onReply);
      clearTimeout(timer);
      option.removeAttribute('data-adcv-pick');
      resolve(ok);
    };
    const onReply = (event) => {
      try { const reply = JSON.parse(event.detail); if (reply.token === token) finish(Boolean(reply.ok)); } catch { /* not ours */ }
    };
    document.addEventListener('adcv:react-picked', onReply);
    const timer = setTimeout(() => finish(false), 600);
    document.dispatchEvent(new CustomEvent('adcv:react-pick', { detail: token }));
  });
}

/**
 * Selects one suggestion the way a person does with the keyboard: highlight
 * it, then Enter in the box (react-select selects its highlighted option).
 * If that does not take, click a fresh copy of it (the list may have been
 * redrawn). Returns whether the box shows the choice afterwards.
 */
async function pickOption(element, option, typed = '') {
  const chosen = optionText(option);
  // mousemove first: react-select ignores hovering right after keyboard moves until the mouse moves.
  for (const type of ['mousemove', 'mouseover', 'mousemove']) option.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  // Some pages ignore the simulated hover (Greenhouse), and Enter would then pick
  // the first option. Where the list shows its highlight, walk to the option with
  // the arrow keys; Enter only once it is the highlighted one.
  if (highlighted(element) !== null) {
    const steps = optionsFor(element).length;
    for (let step = 0; step < steps && highlighted(element) !== chosen; step++) {
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40 }));
      await wait(0);
    }
  }
  const highlight = highlighted(element);
  if (highlight === null || highlight === chosen) {
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
    await wait(200);
  }
  if (choiceShown(element, chosen, typed)) return true;
  const fresh = () => optionsFor(element).find((item) => optionText(item) === chosen) ?? (option.isConnected ? option : null);
  const clickable = fresh();
  if (clickable) { press(clickable); await wait(200); }
  if (choiceShown(element, chosen, typed)) return true;
  // React dropdowns that ignore simulated events: the option's own handler.
  const target = fresh();
  if (target && (await reactPick(target))) await wait(200);
  return choiceShown(element, chosen, typed);
}

/**
 * Suggestion boxes: address pickers and React-style dropdowns. Type, wait for
 * the list to settle, pick the best match, and check the box shows it. If the
 * full text finds nothing, try again with its first part ("Vancouver").
 */
async function fillCombobox(element, value) {
  const wanted = normal(value);
  if (!wanted) return { filled: false };
  // "Vancouver, Canada" should pick "Vancouver, British Columbia, Canada": an option whose
  // first part is the wanted first part wins over "North Vancouver…", then the most parts shared.
  const parts = wanted.split(',').map((part) => part.trim()).filter(Boolean);
  const first = parts[0];
  const score = (option) => {
    const text = optionText(option);
    if (text === wanted) return 100;
    if (!text.includes(first) && !(first.includes(text) && text.length > 1)) return 0;
    return 1 + parts.filter((part) => text.includes(part)).length + (text.split(',')[0].trim() === first ? 2 : 0);
  };
  // The city alone first: location searches (Greenhouse) find "Vancouver" but not
  // "Vancouver, Canada". The country still decides between the results.
  const queries = parts.length > 1 ? [String(value).split(',')[0].trim(), String(value)] : [String(value)];
  for (const query of queries) {
    element.focus({ preventScroll: true });
    typeInto(element, query);
    const ranked = (await settledOptions(element)).map((option) => ({ option, score: score(option) })).filter((entry) => entry.score > 0);
    if (!ranked.length) continue;
    const best = ranked.reduce((top, entry) => (entry.score > top.score ? entry : top)).option;
    if (await pickOption(element, best, query)) return { filled: true };
  }
  // Nothing picked. A plain box keeps the typed text (yellow: pick a suggestion);
  // react-select clears it when the field loses focus, and it then shows as empty.
  return normal(element.value)
    ? { filled: true, note: 'typed, pick the matching suggestion' }
    : { filled: false, note: 'could not pick a suggestion, choose one from the list' };
}

/**
 * Drag-and-drop upload boxes (Dropzone and similar). A file input cannot be
 * reached, so the PDF is dropped on the box the way a person would drop it,
 * then the box is watched until the site reports the upload finished.
 */
async function dropFile(zone, fileUrl, fileName) {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Could not read the file (${response.status})`);
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const target = zone.querySelector('.dz-message') ?? zone;
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }
  for (let waited = 0; waited < 30000; waited += 250) {
    await wait(250);
    const error = zone.querySelector('.dz-error [data-dz-errormessage], .dz-error-message');
    if (error?.textContent.trim()) throw new Error(error.textContent.trim());
    if (window.CVAutofillFields.zoneDone(zone)) return { filled: true, note: 'uploaded' };
  }
  return { filled: true, note: 'upload started, check that it finished' };
}

/** Dispatches on control type so callers do not have to care. */
async function fillField(field, value, resumeFileName) {
  switch (field.kind) {
    case 'file':
      return { filled: await attachFile(field.element, value, resumeFileName ?? 'Resume.pdf') };
    case 'drop':
      return dropFile(field.element, value, resumeFileName ?? 'Resume.pdf');
    case 'combobox':
      return fillCombobox(field.element, value);
    case 'select':
      return { filled: fillSelect(field.element, value) };
    case 'checkbox':
    case 'radio':
      return { filled: fillChoice(field.element, value) };
    default:
      return { filled: field.element.type === 'number' ? fillNumber(field.element, value) : fillText(field.element, value) };
  }
}

// ─── Diversity questions (opt-in) ─────────────────────────────────────────

const DECLINE = /decline|prefer not|don.?t wish|do not wish|rather not|choose not|not to (answer|disclose|say|self)|not specified|do not want|don.?t want/;

/**
 * Whether a form's option says the same as the person's saved choice. Forms
 * word these differently ("Decline to self-identify", "I don't wish to
 * answer"), so each choice is a pattern, not exact text.
 */
function diversityOptionMatches(key, choice, optionText) {
  const text = normal(optionText);
  if (!text) return false;
  if (choice === 'Prefer not to answer') return DECLINE.test(text);
  if (DECLINE.test(text)) return false;
  const yes = /^yes\b/.test(text), no = /^no\b/.test(text);
  switch (`${key}:${choice}`) {
    case 'eeoGender:Woman': return /\b(female|woman|women)\b/.test(text);
    case 'eeoGender:Man': return /\b(male|man|men)\b/.test(text) && !/female|woman|women/.test(text);
    case 'eeoGender:Non-binary': return /non.?binary|genderqueer|gender queer/.test(text);
    case 'eeoHispanic:Yes': return yes;
    case 'eeoHispanic:No': return no;
    case 'eeoVeteran:I am not a protected veteran': return no || (/\bnot\b/.test(text) && /veteran/.test(text));
    case 'eeoVeteran:I am a protected veteran': return yes || (/veteran/.test(text) && !/\bnot\b/.test(text));
    case 'eeoDisability:No': return no || /do not have|don.?t have/.test(text);
    case 'eeoDisability:Yes': return yes || (/have a disability/.test(text) && !/do not|don.?t/.test(text));
    case 'eeoRace:Asian': return /\basian\b/.test(text);
    case 'eeoRace:Black or African American': return /black|african/.test(text);
    case 'eeoRace:White': return /\bwhite\b/.test(text);
    case 'eeoRace:Hispanic or Latino': return /hispanic|latin/.test(text);
    case 'eeoRace:American Indian or Alaska Native': return /american indian|alaska/.test(text);
    case 'eeoRace:Native Hawaiian or Other Pacific Islander': return /hawaiian|pacific/.test(text);
    case 'eeoRace:Two or more races': return /two or more|multi/.test(text);
    default: return text === normal(choice);
  }
}

/** Fills one diversity question with the person's saved choice, whatever the control. */
async function fillDiversity(field, choice) {
  const { element, key, kind } = field;
  const matches = (text) => diversityOptionMatches(key, choice, text);
  const labelText = (input) => window.CVAutofillFields.labelOf(input.labels?.[0] ?? input);
  if (kind === 'select') {
    const option = [...element.options].find((item) => item.value !== '' && matches(item.textContent));
    if (!option) return { filled: false, note: 'no option matched your answer' };
    element.focus({ preventScroll: true }); setValue(element, option.value); element.blur();
    return { filled: true };
  }
  if (kind === 'radio' || kind === 'checkbox') {
    // Each option is its own field: only the matching one is clicked.
    if (!matches(labelText(element)) || element.checked) return { filled: false };
    element.click();
    return { filled: true };
  }
  if (kind === 'combobox') {
    element.focus({ preventScroll: true });
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    press(element);
    const option = (await settledOptions(element, 3000)).find((item) => matches(item.textContent));
    if (!option) return { filled: false, note: 'no option matched your answer' };
    return (await pickOption(element, option)) ? { filled: true } : { filled: false, note: 'could not pick the option, choose it from the list' };
  }
  return { filled: false };
}

const LOCATION_KEYS = new Set(['location', 'city', 'addressLine']);

const ELIGIBILITY = new Set(['requiresSponsorship', 'workAuthorization']);

/**
 * Sponsorship and work authorization depend on the country asked about. A
 * per-country answer wins; the profile's general answer is used only for
 * questions about the profile's own country, or naming none.
 */
function eligibilityValue(field, profile) {
  const answers = profile.eligibility ?? {};
  if (field.country) {
    const wanted = `${field.key}:${field.country}`.toLowerCase();
    const own = Object.entries(answers).find(([key]) => key.toLowerCase() === wanted)?.[1];
    if (own) return own;
    const home = String(profile.country ?? '').trim().toLowerCase();
    return home && home === field.country.toLowerCase() ? answers[field.key] || profile[field.key] : '';
  }
  return answers[field.key] || profile[field.key];
}

// ─── "How did you hear about this job?" ────────────────────────────────
// Settings → "How did you hear" (on by default): answered with the link to
// another-damn.cv. A list of sources has no such option, so "Other" is
// chosen and the link goes in the "If other, please specify" box below; the
// closest source (job board, website…) when there is no "Other".

const OTHER_OPTION = /^\s*other\b/i;
const NEAR_OPTION = /job ?board|job site|website|web site|internet|online|web\b|search engine|job search|career site|careers page/i;
const DETAILS_LABEL = /\bother\b|specify|details?\b|please (provide|explain|describe|tell)|elaborate|which one/i;

/** The "If other, please specify" box after the question: one of the next few empty text fields. */
function detailsBoxAfter(element) {
  const scope = element.closest('form') ?? document.body;
  const boxes = [...scope.querySelectorAll('input:not([type]), input[type="text"], textarea')]
    .filter((box) => box !== element && !window.CVAutofillFields.isCombobox?.(box) && (element.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING))
    .filter((box) => box.getClientRects().length && !box.disabled && !box.readOnly)
    .slice(0, 3);
  return boxes.find((box) => DETAILS_LABEL.test(window.CVAutofillFields.labelOf(box)) && window.CVAutofillFields.isEmpty(box)) ?? null;
}

/** The option to choose among `texts`: "Other" first, else the closest source. */
function heardAboutOption(texts) {
  const other = texts.findIndex((text) => OTHER_OPTION.test(text));
  if (other >= 0) return { index: other, other: true };
  const near = texts.findIndex((text) => NEAR_OPTION.test(text));
  return near >= 0 ? { index: near, other: false } : null;
}

/**
 * Fills one "How did you hear" question with `link`. Returns { filled,
 * element, also, mark }: `also` is the details box it typed into.
 */
async function fillHeardAbout(field, link, state = {}) {
  const { element, kind } = field;
  const done = (status, reason, extra = {}) => ({ filled: status !== 'missing', mark: { status, reason }, ...extra });
  if (kind === 'text' || kind === 'textarea') {
    fillText(element, link);
    return done('ok', `Filled with ${link}`);
  }
  let chosen = null, chosenElement = element;
  if (kind === 'select') {
    const options = [...element.options].filter((option) => option.value !== '' && !option.disabled);
    const pick = heardAboutOption(options.map((option) => option.text.trim()));
    if (pick) {
      element.focus({ preventScroll: true }); setValue(element, options[pick.index].value); element.blur();
      chosen = { text: options[pick.index].text.trim(), other: pick.other };
    }
  } else if (kind === 'radio') {
    if (state.heardGroups?.has(element.name)) return { filled: false, skipped: true };
    (state.heardGroups ??= new Set()).add(element.name);
    const radios = radiosOf(element);
    const pick = heardAboutOption(radios.map(radioText));
    if (pick) {
      chosenElement = radios[pick.index];
      if (!chosenElement.checked) chosenElement.click();
      chosen = { text: radioText(chosenElement), other: pick.other };
    }
  } else if (kind === 'combobox') {
    element.focus({ preventScroll: true });
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    press(element);
    const options = await settledOptions(element, 3000);
    const pick = heardAboutOption(options.map((option) => option.textContent.trim()));
    if (pick && (await pickOption(element, options[pick.index]))) chosen = { text: options[pick.index].textContent.trim(), other: pick.other };
    else if (!pick) element.blur();
  } else {
    return { filled: false };
  }
  if (!chosen) return done('missing', `None of the options is "Other" or a job board, so ${link} could not go in. Choose one yourself.`);
  const box = detailsBoxAfter(element);
  if (box) fillText(box, link);
  const also = box ? [{ element: box, status: 'ok', reason: `Filled with ${link}` }] : [];
  if (chosen.other && box) return done('ok', `Chose "${chosen.text}" and typed ${link} below.`, { element: chosenElement, also });
  if (chosen.other) return done('check', `Chose "${chosen.text}". The form has no box for the link ${link}.`, { element: chosenElement });
  return done('check', `No "Other" option, so chose "${chosen.text}"${box ? ` and typed ${link} below` : ''}. Check it.`, { element: chosenElement, also });
}

// ─── Work type and relocation ─────────────────────────────────────────
// The profile lists the types of work accepted ("remote,hybrid"). Relocation
// is answered per country (profile.relocation: { Poland: 'Yes', '': 'No' }),
// and needs no answer for the country the person already lives in.

const WORK_KINDS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
const KIND_OF_TEXT = [['hybrid', /\bhybrid\b/i], ['onsite', /on-?site|in[- ]office|in the office|office[- ]based|in[- ]person/i], ['remote', /\bremote\b/i]];
const kindOfText = (text) => KIND_OF_TEXT.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
const FULLY_ONSITE = /fully on-?site|on-?site full|full[- ]time (in|at|from) (the )?office|5 days|five days|every day|daily/i;
const YES_NO_QUESTION = /^\s*(are|do|does|would|will|can|could|is|have|has|did|were|was|should)\b/i;

function accepted(profile) {
  return String(profile.workArrangements ?? '').split(',').map((kind) => kind.trim()).filter((kind) => WORK_KINDS[kind]);
}
const kindsText = (kinds) => kinds.map((kind) => WORK_KINDS[kind]).join(kinds.length > 2 ? ', ' : ' or ').replace(/, ([^,]+)$/, ', or $1');

/** The relocation answer for a country: its own, else the general one only for questions naming no country. */
function relocationFor(profile, country) {
  const answers = profile.relocation ?? {};
  if (!country) return answers[''] ?? '';
  return Object.entries(answers).find(([key]) => key.toLowerCase() === country.toLowerCase())?.[1] ?? '';
}

/**
 * What to answer for a work-type or relocation question: { value, list,
 * reason } or { value: '', why: 'types' | 'relocation', country }.
 */
function workDecision(field, profile) {
  const kinds = accepted(profile);
  const question = window.CVAutofillFields.labelOf(field.element);
  const country = field.country ?? null;
  if (field.key === 'willingToRelocate') {
    const home = String(profile.country ?? '').trim().toLowerCase();
    const livesThere = Boolean(country && home && home === country.toLowerCase());
    const relocate = livesThere ? 'Yes' : relocationFor(profile, country);
    if (field.office) {
      if (!kinds.length) return { value: '', why: 'types', country };
      const officeOk = FULLY_ONSITE.test(question) ? kinds.includes('onsite') : kinds.includes('hybrid') || kinds.includes('onsite');
      if (!officeOk) return { value: 'No', reason: `You accept ${kindsText(kinds).toLowerCase()} work, not this office schedule, so "No".` };
      if (!relocate) return { value: '', why: 'relocation', country };
      return { value: relocate, reason: livesThere ? `You live in ${country} and accept office work.` : `You accept office work, and your relocation answer${country ? ` for ${country}` : ''} is "${relocate}".` };
    }
    if (!relocate) return { value: '', why: 'relocation', country };
    return { value: relocate, reason: livesThere ? `You live in ${country}.` : country ? `Your answer for ${country}.` : 'Your relocation answer.' };
  }
  if (!kinds.length) return { value: '', why: 'types' };
  const asks = FULLY_ONSITE.test(question) ? 'onsite' : /hybrid|office|on-?site|commut|in[- ]person|days? (a|per) week/i.test(question) ? 'office' : /remote/i.test(question) ? 'remote' : null;
  const yes = asks === 'onsite' ? kinds.includes('onsite') : asks === 'office' ? kinds.includes('hybrid') || kinds.includes('onsite') : asks === 'remote' ? kinds.includes('remote') : true;
  return { value: yes ? 'Yes' : 'No', list: kindsText(kinds), kinds, reason: `You accept ${kindsText(kinds).toLowerCase()} work.` };
}

/** Option texts and how to choose one, for a select, radio group or dropdown. */
async function optionsOf(element, kind) {
  if (kind === 'select') {
    const options = [...element.options].filter((option) => option.value !== '' && !option.disabled);
    return { texts: options.map((option) => option.text.trim()), choose: async (i) => { element.focus({ preventScroll: true }); setValue(element, options[i].value); element.blur(); return { ok: true }; } };
  }
  if (kind === 'radio') {
    const radios = radiosOf(element);
    return { texts: radios.map(radioText), choose: async (i) => { if (!radios[i].checked) radios[i].click(); return { ok: radios[i].checked, element: radios[i] }; } };
  }
  if (kind === 'combobox') {
    element.focus({ preventScroll: true });
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    press(element);
    const options = await settledOptions(element, 3000);
    return { texts: options.map((option) => option.textContent.trim()), choose: async (i) => ({ ok: await pickOption(element, options[i]) }), close: () => element.blur() };
  }
  return null;
}

/** Fills one work-type or relocation question from the decision. Returns { filled, element, mark }. */
async function fillWork(field, decision, state = {}) {
  const { element, kind } = field;
  const done = (status, reason, extra = {}) => ({ filled: status !== 'missing', mark: { status, reason }, ...extra });
  if (kind === 'radio') {
    if (state.workGroups?.has(element.name)) return { filled: false, skipped: true };
    (state.workGroups ??= new Set()).add(element.name);
  }
  if (kind === 'checkbox') {
    // A list of checkboxes, one per type of work: tick each type accepted.
    const own = kindOfText(window.CVAutofillFields.labelOf(element.labels?.[0] ?? element));
    if (own && decision.kinds) {
      const want = decision.kinds.includes(own);
      if (element.checked !== want) element.click();
      return want ? done('ok', `You accept ${WORK_KINDS[own].toLowerCase()} work.`) : { filled: false, skipped: true };
    }
    if (element.checked !== (decision.value === 'Yes')) element.click();
    return done('ok', decision.reason);
  }
  if (kind === 'text' || kind === 'textarea') {
    const question = window.CVAutofillFields.labelOf(element);
    fillText(element, field.key === 'workArrangement' && !YES_NO_QUESTION.test(question) && decision.list ? decision.list : decision.value);
    return done('ok', decision.reason);
  }
  const list = await optionsOf(element, kind);
  if (!list) return { filled: false };
  // Options naming types of work ("Remote", "Hybrid", "On-site"): the first one accepted, in the order you ranked them.
  const kinds = list.texts.map(kindOfText);
  let index = -1;
  if (field.key === 'workArrangement' && decision.kinds && kinds.filter(Boolean).length >= 2) {
    for (const wanted of decision.kinds) { index = kinds.indexOf(wanted); if (index >= 0) break; }
  } else {
    const wanted = decision.value.toLowerCase();
    index = list.texts.findIndex((text) => new RegExp(`^\\s*${wanted}\\b`, 'i').test(text));
  }
  if (index < 0) { list.close?.(); return done('missing', `None of the options fits your answer "${decision.list ?? decision.value}". Choose one yourself.`); }
  const chosen = await list.choose(index);
  return chosen.ok ? done('ok', decision.reason, { element: chosen.element }) : done('missing', 'Could not pick the option. Choose it yourself.');
}

/** The value for one field from the profile the panel sent. */
function valueFor(field, profile) {
  if (field.key === 'resume') return profile.resumeDataUrl;
  if (field.key === 'workArrangement' || field.key === 'willingToRelocate') return workDecision(field, profile).value;
  if (ELIGIBILITY.has(field.key)) return eligibilityValue(field, profile);
  // Address pickers search by place: "Toronto, Canada" finds a suggestion where
  // a full street address often does not.
  if (field.kind === 'combobox' && LOCATION_KEYS.has(field.key)) {
    return [profile.city, profile.country].filter(Boolean).join(', ') || profile.location;
  }
  // "City, State/Province, Country and Zip Code" asks for every part.
  if (field.compound) {
    return [profile.city, profile.state, profile.country, profile.postalCode].filter(Boolean).join(', ') || profile.location;
  }
  return profile[field.key];
}

/**
 * Fills every detected field that has a value. One upload per file: a form
 * that shows its CV box twice gets the PDF once.
 */
/** Icon status and hover text for one field Autofill touched (see marks.js). */
function markFor(field, result, profile) {
  if (!result.filled) return result.note ? { status: 'missing', reason: `Not filled: ${result.note}` } : null;
  if (field.key === 'resume') {
    return result.note === 'uploaded' || !result.note
      ? { status: 'ok', reason: `Your CV attached: ${profile.resumeFileName ?? 'Resume.pdf'}` }
      : { status: 'check', reason: `Your CV: ${result.note}` };
  }
  if (result.note) return { status: 'check', reason: `Check this: ${result.note}` };
  // Worked here before: answered from the CV's employers, which may be incomplete.
  if (field.key === 'workedHereBefore') return { status: profile.workedHereBeforeSaved ? 'ok' : 'check', reason: profile.workedHereBeforeReason || 'From your CV. Check it.' };
  return { status: 'ok', reason: field.diversity ? 'From your diversity answers' : ELIGIBILITY.has(field.key) && field.country ? `Your answer for ${field.country}` : 'From your profile' };
}

const pageOrder = (a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

/**
 * `hooks` (optional, from marks.js) animate the fill: before(field) scrolls to
 * it, after(field, mark, token) shows its result. Fields fill in page order,
 * so the page moves down the form like a person would.
 */
/**
 * Fills one detected field. `state` carries what a whole pass shares (one CV
 * upload per form). Returns { filled, mark, note, failure, skipped }.
 */
async function fillOne(field, profile, state = {}) {
  const value = valueFor(field, profile);
  if (!value || (field.key === 'resume' && state.uploaded)) return { filled: false, skipped: true };
  const label = window.CVAutofillFields.labelOf(field.element.matches?.('input, select, textarea') ? field.element : field.element.querySelector('label') ?? field.element);
  if (field.key === 'workArrangement' || field.key === 'willingToRelocate') {
    try {
      const result = await fillWork(field, workDecision(field, profile), state);
      if (result.skipped) return result;
      return { filled: result.filled, mark: result.mark ? { element: result.element ?? field.element, ...result.mark } : null };
    } catch (err) {
      return { filled: false, failure: `${label}: ${err.message}`, mark: { element: field.element, status: 'missing', reason: `Not filled: ${err.message}` } };
    }
  }
  if (field.key === 'heardAbout') {
    try {
      const result = await fillHeardAbout(field, value, state);
      if (result.skipped) return result;
      return { filled: result.filled, also: result.also, mark: result.mark ? { element: result.element ?? field.element, ...result.mark } : null, ...(result.mark?.status === 'check' && { note: `${label}: ${result.mark.reason}` }) };
    } catch (err) {
      return { filled: false, failure: `${label}: ${err.message}`, mark: { element: field.element, status: 'missing', reason: `Not filled: ${err.message}` } };
    }
  }
  try {
    const result = field.diversity ? await fillDiversity(field, value) : await fillField(field, value, profile.resumeFileName);
    if (field.key === 'resume' && result.filled) state.uploaded = true;
    const status = markFor(field, result, profile);
    return { filled: Boolean(result.filled), note: result.note ? `${label}: ${result.note}` : null, mark: status ? { element: field.element, ...status } : null };
  } catch (err) {
    return { filled: false, failure: `${label}: ${err.message}`, mark: { element: field.element, status: 'missing', reason: `Not filled: ${err.message}` } };
  }
}

async function fillAll(found, profile, hooks = null) {
  let filled = 0;
  const failures = [], notes = [], marks = [], state = {};
  for (const field of [...found].sort(pageOrder)) {
    if (!valueFor(field, profile)) continue;
    const token = await hooks?.before?.(field);
    const result = await fillOne(field, profile, state);
    if (result.filled) filled++;
    if (result.note) notes.push(result.note);
    if (result.failure) failures.push(result.failure);
    if (result.mark) marks.push(result.mark);
    await hooks?.after?.(field, result.mark, token);
  }
  // `marks` holds page elements: the page script keeps it and never sends it on.
  return { filled, failures, notes, marks };
}

/**
 * A saved answer into the field it was matched to. Fields the person already
 * filled are left alone. For choices the value is the option's exact text.
 */
async function fillAnswer(element, kind, value) {
  if (!value) return { filled: false };
  if (kind === 'radio') {
    const radios = [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)];
    if (radios.some((radio) => radio.checked)) return { filled: false };
    const option = radios.find((radio) => normal(window.CVAutofillFields.labelOf(radio.labels?.[0] ?? radio)) === normal(value));
    if (!option) return { filled: false };
    option.click();
    return { filled: true, element: option };
  }
  if (kind === 'checkbox') {
    if (element.checked || !/^(yes|true|1)$/i.test(String(value).trim())) return { filled: false };
    element.click();
    return { filled: true };
  }
  if (!window.CVAutofillFields.isEmpty(element)) return { filled: false };
  if (kind === 'select') return { filled: fillSelect(element, value) };
  if (kind === 'combobox') return fillCombobox(element, value);
  if (kind === 'number') return { filled: fillNumber(element, value) };
  return { filled: fillText(element, value) };
}

/**
 * A required acknowledgement (Settings → "Acknowledge required privacy
 * notices"): tick it, or pick the option that acknowledges. Never a refusal.
 */
async function fillAcknowledgement(item) {
  const { element, kind } = item;
  const acknowledges = window.CVAutofillFields.acknowledges;
  if (kind === 'checkbox') {
    if (element.checked) return { filled: false };
    element.click();
    return { filled: element.checked };
  }
  if (kind === 'radio') {
    const radios = [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)];
    const option = radios.find((radio) => acknowledges(window.CVAutofillFields.labelOf(radio.labels?.[0] ?? radio)));
    if (!option) return { filled: false };
    option.click();
    return { filled: option.checked, element: option };
  }
  if (kind === 'select') {
    const option = [...element.options].find((item) => item.value !== '' && acknowledges(item.textContent));
    if (!option) return { filled: false };
    element.focus({ preventScroll: true }); setValue(element, option.value); element.blur();
    return { filled: true };
  }
  if (kind === 'combobox') {
    element.focus({ preventScroll: true });
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    press(element);
    const option = (await settledOptions(element, 3000)).find((item) => acknowledges(item.textContent));
    if (!option) return { filled: false, note: 'no acknowledging option found' };
    return { filled: await pickOption(element, option) };
  }
  return { filled: false };
}

// ─── A value chosen from a field's icon (marks.js) ───────────────────────
// The person picked it themselves, so unlike saved answers it replaces what
// the field holds.

/** What kind of control the element is, in the detector's terms ("number" for number inputs). */
function controlKind(element) {
  const kind = window.CVAutofillFields.kindOf(element);
  return kind === 'text' && element.type === 'number' ? 'number' : kind;
}

const radiosOf = (element) => [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)];
const radioText = (radio) => window.CVAutofillFields.labelOf(radio.labels?.[0] ?? radio).trim();
const PLACEHOLDER = /^(select|choose|please select|pick)\b|^[-—–]+/i;

/** The options a person can choose from, or null when the field takes text (or hides its options, like react-select). */
function choicesFor(element) {
  const kind = controlKind(element);
  if (kind === 'select') {
    return [...element.options].filter((option) => option.value !== '' && !option.disabled && !PLACEHOLDER.test(option.text.trim())).map((option) => option.text.trim()).filter(Boolean);
  }
  if (kind === 'radio') return radiosOf(element).map(radioText).filter(Boolean);
  if (kind === 'checkbox') return ['Yes', 'No'];
  return null;
}

/** Fills the element with the chosen value, replacing what it holds. Returns { filled, element, note }. */
async function applyChoice(element, value) {
  const kind = controlKind(element);
  if (kind === 'radio') {
    const radios = radiosOf(element);
    const option = radios.find((radio) => normal(radioText(radio)) === normal(value))
      ?? radios.find((radio) => normal(radioText(radio)).startsWith(normal(value)));
    if (!option) return { filled: false, note: 'that option is not on this form' };
    if (!option.checked) option.click();
    return { filled: option.checked, element: option };
  }
  if (kind === 'checkbox') {
    const wanted = /^(yes|true|1)$/i.test(String(value).trim());
    if (element.checked !== wanted) element.click();
    return { filled: element.checked === wanted };
  }
  if (kind === 'select') return { filled: fillSelect(element, value) };
  if (kind === 'combobox') return fillCombobox(element, value);
  if (kind === 'number') return { filled: fillNumber(element, value) };
  return { filled: fillText(element, value) };
}

/**
 * The person's saved diversity choice for a form's option text: "Decline to
 * self-identify" is "Prefer not to answer". Same choices as the panel's
 * diversity dialog (DIVERSITY_CHOICES in sidepanel.js).
 */
const DIVERSITY_VOCABULARY = {
  eeoGender: ['Prefer not to answer', 'Woman', 'Man', 'Non-binary'],
  eeoHispanic: ['Prefer not to answer', 'Yes', 'No'],
  eeoRace: ['Prefer not to answer', 'American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or more races'],
  eeoVeteran: ['Prefer not to answer', 'I am not a protected veteran', 'I am a protected veteran'],
  eeoDisability: ['Prefer not to answer', 'No', 'Yes'],
};
function diversityChoiceFor(key, optionText) {
  return (DIVERSITY_VOCABULARY[key] ?? []).find((choice) => diversityOptionMatches(key, choice, optionText)) ?? null;
}

window.CVAutofillFiller = { workDecision, controlKind, choicesFor, applyChoice, diversityChoiceFor, isTyping, fillAcknowledgement, fillOne, valueFor, typeText, fillField, fillAll, fillAnswer, fillDiversity, diversityOptionMatches, fillText, fillSelect, fillChoice, fillCombobox, attachFile, dropFile };
