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

/** Dispatches on control type so callers do not have to care. */
async function fillField(field, value, resumeFileName) {
  switch (field.kind) {
    case 'file':
      return attachFile(field.element, value, resumeFileName ?? 'Resume.pdf');
    case 'select':
      return fillSelect(field.element, value);
    case 'checkbox':
    case 'radio':
      return fillChoice(field.element, value);
    default:
      return fillText(field.element, value);
  }
}

window.CVAutofillFiller = { fillField, fillText, fillSelect, fillChoice, attachFile };
