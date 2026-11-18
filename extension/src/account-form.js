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
    // Counted on the whole form (its <form>, else the page), never only the box around the
    // password: Lululemon's application has Password and Confirm in a small box of their own.
    const others = [...(passwords[0].closest('form') ?? document.body).querySelectorAll(OTHER_FIELDS)].filter(visible);
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
    const submit = submitOf(box, kind);
    return { kind, email, name, password: passwords[0], verify: passwords[1] ?? null, agreement, submit, other: otherSide(kind, submit) };
  }

  /**
   * The link to the other form: Workday's Create Account page has "Sign In" for
   * someone who already has an account there, its Sign In page "Create Account".
   */
  const OTHER = {
    create: { id: 'signInLink', text: /^\s*(sign ?in|log ?in)\s*$/i },
    signin: { id: 'createAccountLink', text: /^\s*(create (an )?account|sign ?up|register)\s*$/i },
  };
  function otherSide(kind, submit) {
    const { id, text } = OTHER[kind];
    const own = document.querySelector(`[data-automation-id="${id}"]`);
    if (own && visible(own)) return own;
    return [...document.querySelectorAll('a, button, [role="button"]')]
      .find((link) => link !== submit && !submit?.contains(link) && !link.contains(submit) && visible(link) && text.test(link.textContent || link.getAttribute('aria-label') || '')) ?? null;
  }

  /** Opens the other form ("Sign In" on Create Account); true when there was one to press. */
  function switchForm() {
    const other = find()?.other;
    if (!other) return false;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) other.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    other.click();
    return true;
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

  // ─── A password that worked ───────────────────────────────────────────
  // Signing in (or creating an account) with a password other than the saved
  // one, after a change on the site: once it worked, the login is kept on the
  // account, as a password manager does. A wrong password shows an error and is
  // never kept. Only on job sites.
  //
  // Workday often loads a new page after signing in, which ends this script.
  // So the attempt goes to the background (memory only) as it is sent, and
  // whichever page comes next says whether it worked: the same page once the
  // form is gone, or the next page when it has no sign-in form and no new error.
  const onJobSite = () => Boolean(window.CVAutofillSites?.siteForPage?.());
  const ERROR = /wrong|incorrect|invalid|not match|doesn'?t match|try again|failed|locked|error/i;
  const ERROR_NODES = '[role="alert"], [aria-live="assertive"], [data-automation-id="errorMessage"], [data-automation-id*="error" i], [class*="error" i]';
  /** Error messages on screen. Only a new one counts: Workday keeps "Errors Found" headings around. */
  const errorTexts = () => [...document.querySelectorAll(ERROR_NODES)].filter((node) => node.getClientRects().length && ERROR.test(node.textContent)).map((node) => node.textContent.trim());
  /** On the next page only a sign-in's own errors count, not an application form's "Errors Found". */
  const SIGN_IN_ERROR = /wrong|incorrect|invalid|not match|doesn'?t match|try again|locked/i;
  const tell = (message) => { try { return chrome.runtime.sendMessage(message).catch(() => null); } catch { return Promise.resolve(null); } };
  let pending = null;

  async function watchOutcome(attempt) {
    for (let waited = 0; waited < 15000; waited += 500) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (pending !== attempt) return;
      if (errorTexts().some((text) => !attempt.before.has(text))) { pending = null; void tell({ type: 'site-login-failed' }); return; }
      if (!attempt.password.isConnected || !visible(attempt.password)) {
        pending = null;
        void tell({ type: 'site-login-used', email: attempt.email, password: attempt.value, kind: attempt.kind });
        return;
      }
    }
    if (pending === attempt) pending = null;
  }

  /** The person sent the account form: hand the attempt to the background, then see whether it worked. */
  function sent() {
    if (!onJobSite()) return;
    const form = find();
    const email = form?.email?.value.trim(), value = form?.password.value;
    if (!form || !email || !value || (form.verify && form.verify.value !== value)) return;
    pending = { email, value, kind: form.kind, password: form.password, before: new Set(errorTexts()) };
    void tell({ type: 'site-login-attempt', email, password: value, kind: form.kind });
    void watchOutcome(pending);
  }

  /** A page loaded right after a sign-in was sent here: it worked unless the form or a new error is back. */
  async function confirmAfterLoad() {
    if (window !== window.top || !onJobSite()) return;
    const reply = await tell({ type: 'site-login-check' });
    if (!reply?.pending) return;
    let clear = 0;
    for (let waited = 0; waited < 10000; waited += 500) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      // The sign-in form back with its own error ("Wrong email address or password"): it did not work.
      if (find() && errorTexts().some((text) => SIGN_IN_ERROR.test(text))) { void tell({ type: 'site-login-failed' }); return; }
      if (find() || errorTexts().some((text) => SIGN_IN_ERROR.test(text))) clear = 0;
      // A second, with no sign-in form and no error: signed in.
      else if (++clear >= 2) { void tell({ type: 'site-login-confirmed' }); return; }
    }
    void tell({ type: 'site-login-failed' });
  }

  const onButton = (form, event) => {
    if (!form?.submit) return false;
    if (form.submit.contains(event.target)) return true;
    // Workday covers its button with a clear layer that takes the click.
    const box = form.submit.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  };
  document.addEventListener('submit', () => sent(), true);
  document.addEventListener('click', (event) => { if (onJobSite() && event.isTrusted && onButton(find(), event)) sent(); }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.isTrusted && onJobSite() && event.target?.type === 'password') sent(); }, true);
  void confirmAfterLoad();

  window.CVAutofillAccount = { find, fill, switchForm };
})();
