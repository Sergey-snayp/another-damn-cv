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

  element.focus();
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

  element.focus();
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
  element.focus();
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

const LOCATION_KEYS = new Set(['location', 'city', 'addressLine']);

/** The value for one field from the profile the panel sent. */
function valueFor(field, profile) {
  if (field.key === 'resume') return profile.resumeDataUrl;
  // Address pickers search by place: "Toronto, Canada" finds a suggestion where
  // a full street address often does not.
  if (field.kind === 'combobox' && LOCATION_KEYS.has(field.key)) {
    return [profile.city, profile.country].filter(Boolean).join(', ') || profile.location;
  }
  return profile[field.key];
}

/**
 * Fills every detected field that has a value. One upload per file: a form
 * that shows its CV box twice gets the PDF once.
 */
async function fillAll(found, profile) {
  let filled = 0;
  const failures = [], notes = [];
  let uploaded = false;
  for (const field of found) {
    const value = valueFor(field, profile);
    if (!value) continue;
    if (field.key === 'resume' && uploaded) continue;
    const label = window.CVAutofillFields.labelOf(field.element.matches?.('input, select, textarea') ? field.element : field.element.querySelector('label') ?? field.element);
    try {
      const result = await fillField(field, value, profile.resumeFileName);
      if (result.filled) filled++;
      if (field.key === 'resume' && result.filled) uploaded = true;
      if (result.note) notes.push(`${label}: ${result.note}`);
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
    }
  }
  return { filled, failures, notes };
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
    return { filled: true };
  }
  if (kind === 'checkbox') {
    if (element.checked || !/^(yes|true|1)$/i.test(String(value).trim())) return { filled: false };
    element.click();
    return { filled: true };
  }
  if (String(element.value ?? '').trim()) return { filled: false };
  if (kind === 'select') return { filled: fillSelect(element, value) };
  if (kind === 'combobox') return fillCombobox(element, value);
  if (kind === 'number') return { filled: fillNumber(element, value) };
  return { filled: fillText(element, value) };
}

window.CVAutofillFiller = { fillField, fillAll, fillAnswer, fillText, fillSelect, fillChoice, fillCombobox, attachFile, dropFile };
