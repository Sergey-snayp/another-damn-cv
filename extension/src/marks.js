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
    .glow.ok { --c: #16a34a; } .glow.check, .glow.pending { --c: #d97706; } .glow.missing { --c: #dc2626; }
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

  /**
   * The box a person sees as the field. Many forms (Greenhouse) draw the border
   * on a wrapper around the label and input, so the nearest bordered ancestor
   * holding only this field is used; otherwise the field itself.
   */
  function boxFor(element) {
    const anchor = anchorFor(element);
    if (element.type === 'radio' || element.type === 'checkbox') return anchor;
    let node = anchor;
    for (let depth = 0; depth < 5 && node && node !== document.body; depth++, node = node.parentElement) {
      if (node !== anchor && fieldsIn(node) > 1) break;
      const style = getComputedStyle(node);
      const bordered = (parseFloat(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none') || style.boxShadow !== 'none';
      if (bordered) return node;
    }
    return anchor;
  }

  /** Where the icon sits: just outside the field's box, on the right, or on the left when the right has no room. */
  function place(element, node) {
    const rect = boxFor(element).getBoundingClientRect();
    node.hidden = !rect.width && !rect.height;
    if (node.hidden) return;
    const width = document.documentElement.clientWidth;
    const left = rect.right + SIZE + 12 <= width ? rect.right + 8
      : rect.left - SIZE - 12 >= 0 ? rect.left - SIZE - 8
        : rect.right - SIZE - 8; // No room either side: inside the right edge.
    const top = rect.height > 120 ? rect.top + 10 : rect.top + (rect.height - SIZE) / 2 - 2;
    node.style.left = `${left + scrollX}px`;
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
    if (!event.isTrusted) return;
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
  const takeOver = (event) => {
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

  async function follow(element) {
    if (motion.mode !== 'full' || motion.tookOver) return;
    const anchor = anchorFor(element);
    const rect = anchor.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const onScreen = (box) => box.top >= 60 && box.bottom <= innerHeight - 60;
    if (onScreen(rect)) return; // Already on screen: no jump.
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await scrolled();
    // A smooth scroll the page interrupted (or a browser without one): go there directly.
    if (!motion.tookOver && !onScreen(anchor.getBoundingClientRect())) anchor.scrollIntoView({ block: 'center' });
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
      end() {
        for (const type of ['wheel', 'touchmove', 'keydown']) removeEventListener(type, takeOver, { capture: true });
      },
    };
  }

  /** Icons go back on the page if the page rebuilt its document. */
  function reattach() {
    if (marks.size && !host.isConnected) { document.documentElement.append(host); reposition(); }
  }

  window.CVAutofillMarks = { show, showMissing, clear, reattach, animationMode, fillHooks, glowing: () => shadow.querySelectorAll('.glow').length, count: () => marks.size, statusOf: (element) => marks.get(element)?.status ?? null, reasonOf: (element) => marks.get(element)?.node.title ?? null };
})();
