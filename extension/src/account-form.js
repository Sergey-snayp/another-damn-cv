/**
 * A job site's account step (Workday's Create Account and Sign In), found and
 * filled as Simplify does: two visible password boxes are Create Account, one
 * is Sign In, and more than six other fields is an application, not an account
 * form. It fills the name (when creating), the email, the password and its
 * verify box, and ticks the privacy agreement. It never presses the button:
 * it shows it, and the person presses it.
 */
(() => {
  if (window.CVAutofillAccount) return;

  const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.disabled;
  const describe = (element) => [
    window.CVAutofillFields?.labelOf?.(element), element.name, element.id, element.placeholder,
    element.getAttribute('autocomplete'), element.getAttribute('aria-label'), element.getAttribute('data-automation-id'),
  ].filter(Boolean).join(' ').toLowerCase();
  const OTHER_FIELDS = 'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select';
  const SUBMIT = { create: /create account|sign ?up|register|create/i, signin: /sign ?in|log ?in/i };

  /** The form around the password box: a <form>, else the nearest box with fields and a button. */
  function containerOf(input) {
    const form = input.closest('form');
    if (form) return form;
    for (let node = input.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node.querySelectorAll('input').length >= 2 && node.querySelector('button, [role="button"], input[type="submit"]')) return node;
    }
    return document.body;
  }

  function submitOf(box, kind) {
    const buttons = [...box.querySelectorAll('button, [role="button"], input[type="submit"]')].filter(visible);
    const text = (button) => button.textContent || button.value || button.getAttribute('aria-label') || '';
    return buttons.find((button) => SUBMIT[kind].test(text(button))) ?? buttons.find((button) => button.type === 'submit') ?? null;
  }

  /** The account form's parts, or null when the page has none. */
  function find() {
    const passwords = [...document.querySelectorAll('input[type="password"]')].filter(visible);
    if (!passwords.length) return null;
    const box = containerOf(passwords[0]);
    const others = [...box.querySelectorAll(OTHER_FIELDS)].filter(visible);
    const choices = [...box.querySelectorAll('[role="combobox"]:not(input), [role="radiogroup"], input[type="file"]')].filter(visible);
    if (others.length + choices.length > 6) return null;
    const kind = passwords.length >= 2 ? 'create' : 'signin';
    const inputs = others.filter((element) => element.tagName === 'INPUT');
    const email = inputs.find((element) => element.type === 'email') ?? inputs.find((element) => /e-?mail|user/.test(describe(element))) ?? null;
    const name = kind === 'create'
      ? inputs.find((element) => element !== email && /\bname\b/.test(describe(element)) && !/user ?name|e-?mail/.test(describe(element))) ?? null
      : null;
    const agreement = kind === 'create'
      ? [...box.querySelectorAll('input[type="checkbox"]')].find((element) => /agree|consent|privacy|terms/.test(`${describe(element)} ${element.closest('label')?.textContent ?? ''} ${element.closest('[data-automation-id]')?.getAttribute('data-automation-id') ?? ''}`.toLowerCase())) ?? null
      : null;
    return { kind, email, name, password: passwords[0], verify: passwords[1] ?? null, agreement, submit: submitOf(box, kind) };
  }

  /** The button the person presses next, shown for a few seconds. */
  function show(button) {
    if (!button) return;
    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const { outline, outlineOffset } = button.style;
    button.style.outline = '3px solid #f59e0b';
    button.style.outlineOffset = '2px';
    setTimeout(() => { button.style.outline = outline; button.style.outlineOffset = outlineOffset; }, 3500);
  }

  /**
   * Fills the form; { status, kind, filled }: 'done', 'needs-password' (signing in
   * without a saved password), 'password-rejected' (the box did not take it) or 'no-form'.
   */
  async function fill({ email, password, fullName } = {}) {
    const form = find();
    if (!form) return { status: 'no-form', filled: [] };
    const filled = [];
    const pause = () => new Promise((resolve) => setTimeout(resolve, 150));
    const type = (element, value) => window.CVAutofillFiller.typeText(element, value, { leave: true });
    if (form.name && fullName) { type(form.name, fullName); filled.push('name'); await pause(); }
    if (form.email && email) { type(form.email, email); filled.push('email'); await pause(); }
    if (!password) return { status: 'needs-password', kind: form.kind, filled };
    type(form.password, password);
    if (form.password.value !== password) return { status: 'password-rejected', kind: form.kind, filled };
    filled.push('password');
    await pause();
    if (form.verify) { type(form.verify, password); filled.push('verify'); await pause(); }
    if (form.agreement) { if (!form.agreement.checked) form.agreement.click(); filled.push('agreement'); }
    show(form.submit);
    return { status: 'done', kind: form.kind, filled };
  }

  window.CVAutofillAccount = { find, fill };
})();
