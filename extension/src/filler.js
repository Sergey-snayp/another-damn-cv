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

function fillText(element, value) {
  if (!value) return false;

  element.focus({ preventScroll: true });
  setValue(element, value);
  element.blur();

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

/**
 * Suggestion boxes: address pickers and React-style dropdowns. Type the value,
 * wait for the list, then click the option that contains it. When nothing
 * matches, the typed text stays and the person picks a suggestion.
 */
async function fillCombobox(element, value) {
  const wanted = normal(value);
  if (!wanted) return { filled: false };
  element.focus({ preventScroll: true });
  setValue(element, value);
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  // "Toronto, Canada" should pick "Toronto, ON, Canada" over "Toronto, OH, United States":
  // the option sharing the most parts wins, and it must contain the first part.
  const parts = wanted.split(',').map((part) => part.trim()).filter(Boolean);
  const first = parts[0];
  const score = (option) => {
    const text = normal(option.textContent);
    if (text === wanted) return 100;
    if (!text.includes(first) && !(first.includes(text) && text.length > 1)) return 0;
    return 1 + parts.filter((part) => text.includes(part)).length;
  };
  for (let waited = 0; waited < 4000; waited += 150) {
    await wait(150);
    const ranked = optionsFor(element).map((option) => ({ option, score: score(option) })).filter((entry) => entry.score > 0);
    if (ranked.length) {
      press(ranked.reduce((best, entry) => (entry.score > best.score ? entry : best)).option);
      return { filled: true };
    }
  }
  return { filled: true, note: 'typed, pick the matching suggestion' };
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
    for (let waited = 0; waited < 3000; waited += 150) {
      await wait(150);
      const option = optionsFor(element).find((item) => matches(item.textContent));
      if (option) { press(option); return { filled: true }; }
    }
    return { filled: false, note: 'no option matched your answer' };
  }
  return { filled: false };
}

const LOCATION_KEYS = new Set(['location', 'city', 'addressLine']);

/** The value for one field from the profile the panel sent. */
function valueFor(field, profile) {
  if (field.key === 'resume') return profile.resumeDataUrl;
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
  return { status: 'ok', reason: field.diversity ? 'From your diversity answers' : 'From your profile' };
}

const pageOrder = (a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

/**
 * `hooks` (optional, from marks.js) animate the fill: before(field) scrolls to
 * it, after(field, mark, token) shows its result. Fields fill in page order,
 * so the page moves down the form like a person would.
 */
async function fillAll(found, profile, hooks = null) {
  let filled = 0;
  const failures = [], notes = [], marks = [];
  let uploaded = false;
  for (const field of [...found].sort(pageOrder)) {
    const value = valueFor(field, profile);
    if (!value) continue;
    if (field.key === 'resume' && uploaded) continue;
    const label = window.CVAutofillFields.labelOf(field.element.matches?.('input, select, textarea') ? field.element : field.element.querySelector('label') ?? field.element);
    const token = await hooks?.before?.(field);
    let mark = null;
    try {
      const result = field.diversity ? await fillDiversity(field, value) : await fillField(field, value, profile.resumeFileName);
      if (result.filled) filled++;
      if (field.key === 'resume' && result.filled) uploaded = true;
      if (result.note) notes.push(`${label}: ${result.note}`);
      const status = markFor(field, result, profile);
      if (status) { mark = { element: field.element, ...status }; marks.push(mark); }
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
      mark = { element: field.element, status: 'missing', reason: `Not filled: ${err.message}` };
      marks.push(mark);
    }
    await hooks?.after?.(field, mark, token);
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

window.CVAutofillFiller = { fillField, fillAll, fillAnswer, fillDiversity, diversityOptionMatches, fillText, fillSelect, fillChoice, fillCombobox, attachFile, dropFile };
