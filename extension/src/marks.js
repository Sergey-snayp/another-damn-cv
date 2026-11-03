/**
 * Fill-status icons beside form fields after Autofill.
 *
 *   ✓ green   filled from the profile or an exact saved answer
 *   ! yellow  filled, but check it: AI draft, similar saved answer, an
 *             unpicked suggestion, an upload still finishing
 *   × red     required and still empty, or could not be filled
 *
 * Drawn in a shadow root over the page, so the site's layout and styles are
 * untouched. Hovering an icon shows why. A green or yellow icon goes when the
 * person edits that field; a red one goes once the field has a value. Settings
 * → "Show fill status icons" (on by default) turns them off.
 */
(() => {
  if (window.CVAutofillMarks) return;

  const LOOK = {
    ok: { color: '#16a34a', glyph: '✓' },
    check: { color: '#d97706', glyph: '!' },
    missing: { color: '#dc2626', glyph: '×' },
  };
  const SIZE = 18;
  const host = document.createElement('div');
  host.id = 'adcv-fill-marks';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { all: initial; position: absolute !important; left: 0 !important; top: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483645 !important; }
    .mark { position: absolute; display: grid; place-items: center; width: ${SIZE}px; height: ${SIZE}px; border-radius: 50%; border: 2px solid #fff;
      color: #fff; font: 700 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.3); cursor: help; box-sizing: content-box; }
    .mark[hidden] { display: none; }
    .glow { position: absolute; pointer-events: none; border-radius: 10px; border: 2px solid var(--c);
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 22%, transparent), 0 0 18px color-mix(in srgb, var(--c) 35%, transparent);
      animation: glow-fade .9s ease-out forwards; }
    .glow.ok { --c: #16a34a; } .glow.check, .glow.pending { --c: #d97706; } .glow.missing { --c: #dc2626; } .glow.submit { --c: #2563eb; }
    .glow.pulse { animation: glow-pulse 1s ease-in-out infinite; }
    .glow.still { animation: none; }
    @keyframes glow-fade { 0% { opacity: 0; transform: scale(.98); } 15% { opacity: 1; transform: none; } 70% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes glow-pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
  </style>`;

  /** element → { node, status } */
  const marks = new Map();
  let ticker = 0, frame = 0;

  const Fields = () => window.CVAutofillFields;
  const isZone = (element) => !element.matches('input, select, textarea');

  function isEmpty(element) {
    return isZone(element) ? !Fields().zoneDone(element) : Fields().isEmpty(element);
  }

  // Choices sit beside their label; a dropdown's icon goes at the right of
  // its visible box, not of react-select's few-pixel input.
  function anchorFor(element) {
    return element.type === 'radio' || element.type === 'checkbox' ? element.closest('label') ?? element
      : element.getAttribute('role') === 'combobox' ? Fields().controlFor(element) : element;
  }

  const fieldsIn = (node) => [...node.querySelectorAll('input, select, textarea')]
    .filter((input) => input.type !== 'hidden' && input.getAttribute('aria-hidden') !== 'true').length;

  /** Whether the element draws a visible frame: a border, an outline, an outer shadow, or one on ::before/::after. */
  function framed(node) {
    const style = getComputedStyle(node);
    if (parseFloat(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none') return true;
    if (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none') return true; // Greenhouse
    if (style.boxShadow !== 'none' && !style.boxShadow.includes('inset')) return true;
    return ['::before', '::after'].some((pseudo) => {
      const part = getComputedStyle(node, pseudo);
      return part.content !== 'none' && part.position === 'absolute' && parseFloat(part.borderRightWidth) > 0 && part.borderRightStyle !== 'none';
    });
  }

  /**
   * The box a person sees as the field. Many forms draw the frame on a wrapper
   * around the label and input (Greenhouse uses an outline), so the nearest
   * framed ancestor holding only this field is used; otherwise the field itself.
   */
  function boxFor(element) {
    const anchor = anchorFor(element);
    if (element.type === 'radio' || element.type === 'checkbox') return anchor;
    let node = element;
    for (let depth = 0; depth < 7 && node && node !== document.body; depth++, node = node.parentElement) {
      if (node !== element && fieldsIn(node) > 1) break;
      if (framed(node)) return node;
    }
    return anchor;
  }

  /**
   * Whether an icon at (left, top) would sit on another field: side-by-side
   * fields (Country next to Phone) leave only a narrow gap. Checked on screen;
   * off screen counts as free.
   */
  function clashes(element, left, top) {
    const points = [[left + SIZE / 2, top + SIZE / 2], [left + 1, top + SIZE / 2], [left + SIZE + 3, top + SIZE / 2]];
    host.style.setProperty('pointer-events', 'none', 'important');
    try {
      return points.some(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === document.documentElement || hit === document.body || hit.contains(element)) return false;
        return Boolean(hit.closest('input, select, textarea, button, a, [role="combobox"]')) || fieldsIn(hit) > 0;
      });
    } finally { host.style.removeProperty('pointer-events'); }
  }

  /**
   * Where the icon sits: just outside the field's box and level with its
   * middle, on the right; on the left when the right is off the page or on
   * another field; inside the right edge only when neither side is free.
   */
  function place(element, node) {
    const rect = boxFor(element).getBoundingClientRect();
    node.hidden = !rect.width && !rect.height;
    if (node.hidden) return;
    const width = document.documentElement.clientWidth;
    const top = rect.top + (rect.height - SIZE) / 2 - 2; // The middle of the box.
    const right = rect.right + 8, left = rect.left - SIZE - 12;
    const spot = right + SIZE + 4 <= width && !clashes(element, right, top) ? right
      : left >= 0 && !clashes(element, left, top) ? left
        : rect.right - SIZE - 12;
    node.style.left = `${spot + scrollX}px`;
    node.style.top = `${top + scrollY}px`;
  }

  function reposition() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const [element, mark] of marks) place(element, mark.node);
    });
  }

  function remove(element) {
    marks.get(element)?.node.remove();
    marks.delete(element);
    if (!marks.size) stop();
  }

  function stop() {
    clearInterval(ticker); ticker = 0;
    removeEventListener('scroll', reposition, true);
    removeEventListener('resize', reposition);
    if (!shadow.querySelector('.glow')) host.remove();
  }

  function start() {
    if (!host.isConnected) document.documentElement.append(host);
    if (ticker) return;
    addEventListener('scroll', reposition, { capture: true, passive: true });
    addEventListener('resize', reposition);
    // Layout shifts and fields filled later: follow the fields, and drop red
    // icons once their field has a value, however it got one.
    ticker = setInterval(() => {
      reattach();
      for (const [element, mark] of marks) {
        if (!element.isConnected || (mark.status === 'missing' && !isEmpty(element))) remove(element);
      }
      reposition();
    }, 500);
  }

  function add(element, status, reason) {
    if (!element?.isConnected || !LOOK[status]) return;
    remove(element);
    const node = document.createElement('span');
    node.className = 'mark';
    node.style.background = LOOK[status].color;
    node.textContent = LOOK[status].glyph;
    node.title = reason;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', reason);
    shadow.append(node);
    marks.set(element, { node, status });
    start();
    place(element, node);
  }

  async function enabled() {
    try { return (await chrome.storage.local.get('fillMarks')).fillMarks !== false; } catch { return false; }
  }

  /** Icons for the fields one fill touched: [{ element, status, reason }]. */
  async function show(entries) {
    if (!(await enabled())) return;
    for (const entry of entries) add(entry.element, entry.status, entry.reason);
  }

  /** Red icons for required fields still empty: ids from findMissingRequired. */
  async function showMissing(missing) {
    if (!(await enabled())) return;
    const ids = new Set(missing.map((item) => String(item.id)));
    for (const [element, mark] of marks) if (mark.status === 'missing' && !ids.has(element.dataset.adcvField)) remove(element);
    for (const item of missing) {
      const element = document.querySelector(`[data-adcv-field="${CSS.escape(String(item.id))}"]`);
      if (element && marks.get(element)?.status !== 'missing') add(element, 'missing', 'Required, still empty');
    }
  }

  function clear() {
    for (const element of [...marks.keys()]) remove(element);
  }

  // Only the person's own edits clear an icon: Autofill's events are not trusted.
  function onEdit(event) {
    // Autofill's own typing goes through the browser's editing, so its events
    // are trusted; it flags itself while typing.
    if (!event.isTrusted || window.CVAutofillFiller?.isTyping?.()) return;
    const target = event.target;
    for (const [element, mark] of marks) {
      const same = element === target || (target.type === 'radio' && element.type === 'radio' && element.name === target.name) || (isZone(element) && element.contains(target));
      if (same && (mark.status !== 'missing' || !isEmpty(element))) remove(element);
    }
  }
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);
  try {
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.fillMarks?.newValue === false) clear(); });
  } catch { /* extension reloaded */ }

  // ─── Follow-along while filling ──────────────────────────────────────────
  // Settings → "Animate filling" (on by default). The page scrolls to each
  // field that is off screen, and the field glows in its result colour. With
  // the system's "Reduce motion" on, nothing scrolls and the glow does not
  // move. Scrolling by hand during a fill stops the follow-along for that fill.
  const motion = { mode: 'off', tookOver: false };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Only the person's own scrolling counts. Autofill sends key presses itself
  // (ArrowDown and Enter open and pick dropdown options); those are not trusted.
  const takeOver = (event) => {
    if (!event.isTrusted) return;
    if (event.type !== 'keydown' || ['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(event.key)) motion.tookOver = true;
  };

  async function animationMode() {
    try {
      if ((await chrome.storage.local.get('animateFill')).animateFill === false) return 'off';
    } catch { return 'off'; }
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
  }

  function scrolled() {
    return new Promise((resolve) => {
      const done = () => { removeEventListener('scrollend', done); clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 650);
      addEventListener('scrollend', done, { once: true });
    });
  }

  const onScreen = (box) => box.top >= 60 && box.bottom <= innerHeight - 60;

  async function follow(element) {
    if (motion.mode !== 'full' || motion.tookOver) return;
    const anchor = anchorFor(element);
    const rect = anchor.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    if (onScreen(rect)) return; // Already on screen: no jump.
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await scrolled();
    // A smooth scroll the page interrupted (or a browser without one): go there directly.
    // 'instant' overrides pages that set CSS scroll-behavior: smooth (Greenhouse does).
    if (!motion.tookOver && !onScreen(anchor.getBoundingClientRect())) anchor.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  /** A ring around the field in its result colour. Returns a function that removes it. */
  function glow(element, status, { pulse = false } = {}) {
    const rect = boxFor(element).getBoundingClientRect();
    if (!rect.width && !rect.height) return () => {};
    if (!host.isConnected) document.documentElement.append(host);
    const node = document.createElement('div');
    node.className = `glow ${status}${pulse ? ' pulse' : ''}${motion.mode === 'reduced' ? ' still' : ''}`;
    Object.assign(node.style, { left: `${rect.left + scrollX - 4}px`, top: `${rect.top + scrollY - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
    shadow.append(node);
    const removeGlow = () => { node.remove(); if (!marks.size && !shadow.querySelector('.glow')) host.remove(); };
    if (!pulse) setTimeout(removeGlow, motion.mode === 'reduced' ? 500 : 900);
    return removeGlow;
  }

  /**
   * Hooks for one fill: before each field (scroll to it, pulse an upload) and
   * after it (glow, its icon, a short pause). Null when animation is off.
   */
  function fillHooks(mode) {
    motion.mode = mode;
    motion.tookOver = false;
    if (mode === 'off') return null;
    for (const type of ['wheel', 'touchmove', 'keydown']) addEventListener(type, takeOver, { capture: true, passive: true });
    return {
      async before(field) {
        await follow(field.element);
        return field.kind === 'drop' || field.kind === 'file' ? glow(field.element, 'pending', { pulse: true }) : null;
      },
      async after(field, mark, stopPending) {
        stopPending?.();
        if (!mark) return;
        glow(mark.element ?? field.element, mark.status);
        await show([{ element: mark.element ?? field.element, status: mark.status, reason: mark.reason }]);
        if (motion.mode === 'full' && !motion.tookOver) await wait(180);
      },
      /**
       * The end of a fill: scroll on to the form's Submit button (or Next /
       * Continue on a step without one) and ring it in blue. It is only shown,
       * never pressed. Only buttons inside the form that holds the fields count,
       * so a page's "Apply" button at the top is not chosen.
       */
      async finish(fields) {
        if (motion.mode !== 'full' || motion.tookOver) return;
        const form = fields.map((field) => field.element.closest('form')).find(Boolean);
        const buttons = [...(form ?? document).querySelectorAll('button, input[type="submit"], [role="button"]')]
          .filter((button) => button.getClientRects().length && !button.disabled);
        const text = (button) => (button.value || button.textContent || button.getAttribute('aria-label') || '').trim();
        const target = buttons.filter((button) => button.type === 'submit' || /\b(submit|send application|apply now|finish)\b/i.test(text(button))).at(-1)
          ?? buttons.filter((button) => /\b(next|continue|review)\b/i.test(text(button))).at(-1);
        if (!target) return;
        await wait(250);
        if (!onScreen(target.getBoundingClientRect())) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await scrolled();
          if (!motion.tookOver && !onScreen(target.getBoundingClientRect())) target.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
        if (!motion.tookOver) glow(target, 'submit');
      },
      end() {
        for (const type of ['wheel', 'touchmove', 'keydown']) removeEventListener(type, takeOver, { capture: true });
      },
    };
  }

  /** Icons go back on the page if the page rebuilt its document. */
  function reattach() {
    if (marks.size && !host.isConnected) { document.documentElement.append(host); reposition(); }
  }

  /** What a person's own scroll does during a fill: stop following. Also used by tests, which cannot send trusted events. */
  const stopFollowing = () => { motion.tookOver = true; };

  window.CVAutofillMarks = { show, showMissing, clear, reattach, animationMode, fillHooks, stopFollowing, glowing: () => shadow.querySelectorAll('.glow').length, count: () => marks.size, statusOf: (element) => marks.get(element)?.status ?? null, reasonOf: (element) => marks.get(element)?.node.title ?? null };
})();
