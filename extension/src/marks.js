/**
 * Fill-status icons beside form fields after Autofill.
 *
 *   ✓ green   filled from the profile or an exact saved answer
 *   ! yellow  filled, but check it: AI draft, similar saved answer, an
 *             unpicked suggestion, an upload still finishing
 *   × red     required and still empty, or could not be filled
 *
 * Drawn in a shadow root over the page, so the site's layout and styles are
 * untouched. Hovering an icon shows why. Clicking it opens a small popover to
 * choose the field's default answer, change it or reset it (content.js says
 * what each field offers). A green or yellow icon goes when the person edits
 * that field; a red one goes once the field has a value. Settings → "Show fill
 * status icons" (on by default) turns them off.
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
      color: #fff; font: 700 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.3); cursor: pointer; box-sizing: content-box; }
    .mark.open { outline: 2px solid #2563eb; outline-offset: 1px; }
    .mark[hidden] { display: none; }
    .tip { position: absolute; z-index: 2; width: max-content; max-width: 300px; padding: 8px 11px; border-radius: 8px; background: #111827; color: #fff;
      font: 500 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.25); pointer-events: none; }
    .tip[hidden] { display: none; }
    .pop { position: absolute; z-index: 3; width: 300px; box-sizing: border-box; padding: 12px; border-radius: 10px; background: #fff; color: #111827;
      font: 400 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.25); border: 1px solid #e5e7eb; text-align: left; }
    .pop[hidden] { display: none; }
    .pop * { box-sizing: border-box; font: inherit; color: inherit; margin: 0; }
    .pop .head { display: flex; gap: 8px; align-items: flex-start; }
    .pop .head p { flex: 1; font-weight: 600; }
    .pop .x { all: unset; cursor: pointer; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 4px; color: #6b7280; font-size: 16px; }
    .pop .x:hover { background: #f3f4f6; }
    .pop .section { margin-top: 10px; }
    .pop .label { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .pop .current { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 7px 9px; border-radius: 8px; background: #f3f4f6; }
    .pop .current b { font-weight: 600; }
    .pop .choices { display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow: auto; }
    .pop button.choice, .pop button.act { cursor: pointer; padding: 5px 10px; border-radius: 999px; border: 1px solid #d1d5db; background: #fff; font-size: 12px; font-weight: 500; }
    .pop button.choice:hover, .pop button.act:hover { border-color: #2563eb; color: #1d4ed8; }
    .pop button.choice.on { background: #2563eb; border-color: #2563eb; color: #fff; }
    .pop button.act.primary { background: #111827; border-color: #111827; color: #fff; }
    .pop button.link { all: unset; cursor: pointer; color: #b91c1c; font-size: 12px; font-weight: 500; }
    .pop button:disabled { opacity: .5; cursor: default; }
    .pop .text { display: flex; gap: 6px; }
    .pop .text input, .pop .text textarea { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; font-size: 12px; }
    .pop .text textarea { min-height: 60px; resize: vertical; }
    .pop .note { margin-top: 8px; font-size: 11px; color: #6b7280; }
    .pop .status { margin-top: 8px; font-size: 12px; font-weight: 500; }
    .pop .status.ok { color: #15803d; } .pop .status.error { color: #b91c1c; }
    .pop .status:empty { display: none; }
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
      placePop();
    });
  }

  function remove(element) {
    if (marks.get(element)?.reason === tip.textContent) hideTip();
    if (popover.element === element && !popover.replacing) closePop();
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
        if (element === popover.element && element.isConnected) continue; // Kept while its popover is open.
        if (!element.isConnected || (mark.status === 'missing' && !isEmpty(element))) remove(element);
      }
      reposition();
    }, 500);
  }

  // The reason, shown at once on hover or click (a native tooltip waits about a second).
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  shadow.append(tip);
  function showTip(node, reason) {
    tip.textContent = reason;
    tip.hidden = false;
    const left = parseFloat(node.style.left), top = parseFloat(node.style.top);
    const width = Math.min(300, tip.offsetWidth), height = tip.offsetHeight;
    // Above the icon and to its left: away from the panel on the right edge of
    // the page. Below it only when there is no room above.
    const x = Math.max(scrollX + 4, left + SIZE + 4 - width);
    const above = top - height - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${above >= scrollY + 4 ? above : top + SIZE + 12}px`;
  }
  const hideTip = () => { tip.hidden = true; };
  addEventListener('scroll', hideTip, { capture: true, passive: true });

  function add(element, status, reason) {
    if (!element?.isConnected || !LOOK[status]) return;
    // One icon per radio group: the chosen option replaces the group's other icon.
    if (element.type === 'radio' && element.name) {
      for (const other of [...marks.keys()]) if (other !== element && other.type === 'radio' && other.name === element.name) handOver(other, element);
    }
    popover.replacing = popover.element === element;
    remove(element);
    popover.replacing = false;
    const node = document.createElement('span');
    node.className = 'mark';
    node.style.background = LOOK[status].color;
    node.textContent = LOOK[status].glyph;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', reason);
    node.addEventListener('pointerenter', () => showTip(node, reason));
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      if (popover.element === element) { closePop(); return; }
      void openPop(element).then((opened) => {
        if (!opened) tip.hidden || tip.textContent !== reason ? showTip(node, reason) : hideTip();
      });
    });
    shadow.append(node);
    marks.set(element, { node, status, reason });
    start();
    place(element, node);
    if (popover.element === element) { node.classList.add('open'); void renderPop(); }
  }

  /** Moves an open popover from one radio of a group to another before the old icon goes. */
  function handOver(from, to) {
    if (popover.element === from) popover.element = to;
    remove(from);
  }

  // ─── Choosing a default from an icon ─────────────────────────────────────
  // content.js sets `editorFor(element)`, which says what this field's default
  // is and how to change it: { heading, note, current, choices, text,
  // fromForm, canReset, choose(value), saveFromForm(), reset() }. The
  // actions fill the field now and save the default for later forms. Only
  // the person's own clicks count.
  let editorFor = null;
  const popover = { element: null, spec: null, busy: false, message: '', kind: '', replacing: false };
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  shadow.append(pop);
  // Typing in the popover is not the page's business.
  for (const type of ['keydown', 'keyup', 'keypress', 'input', 'change', 'paste']) pop.addEventListener(type, (event) => event.stopPropagation());
  pop.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePop(); });

  const make = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter(Boolean));
    return node;
  };
  const trusted = (handler) => (event) => { if (event.isTrusted) handler(event); };

  async function openPop(element) {
    if (!editorFor) return false;
    let spec = null;
    try { spec = await editorFor(element); } catch { spec = null; }
    if (!spec || !marks.has(element)) return false;
    closePop();
    hideTip();
    Object.assign(popover, { element, spec, busy: false, message: '', kind: '' });
    marks.get(element).node.classList.add('open');
    draw();
    pop.hidden = false;
    placePop();
    (pop.querySelector('input, textarea') ?? pop.querySelector('button.choice, button.act'))?.focus({ preventScroll: true });
    addEventListener('pointerdown', outside, true);
    return true;
  }

  function closePop() {
    if (!popover.element) return;
    marks.get(popover.element)?.node.classList.remove('open');
    Object.assign(popover, { element: null, spec: null, busy: false, message: '', kind: '' });
    pop.hidden = true;
    pop.replaceChildren();
    removeEventListener('pointerdown', outside, true);
  }

  /** A click elsewhere closes it; one on the field itself does not (choosing in the form's own dropdown). */
  function outside(event) {
    const path = event.composedPath();
    if (path.includes(host) || !popover.element) return;
    if (path.includes(boxFor(popover.element)) || path.includes(popover.element)) return;
    closePop();
  }

  /** Re-reads the spec after a change (the default may now be set or gone). */
  async function renderPop() {
    if (!popover.element || !editorFor) return;
    try { popover.spec = (await editorFor(popover.element)) ?? popover.spec; } catch { /* keep the old one */ }
    if (popover.element) { draw(); placePop(); }
  }

  async function act(run) {
    if (popover.busy) return;
    popover.busy = true; popover.message = 'Saving…'; popover.kind = '';
    draw();
    let result;
    try { result = await run(); } catch (error) { result = { ok: false, message: error.message }; }
    if (!popover.element) return;
    popover.busy = false;
    popover.message = result?.message ?? (result?.ok ? 'Saved.' : 'Something went wrong.');
    popover.kind = result?.ok ? 'ok' : 'error';
    await renderPop();
  }

  function draw() {
    const { spec, busy } = popover;
    const mark = marks.get(popover.element);
    if (!spec || !mark) return;
    const parts = [];
    parts.push(make('div', { className: 'head' }, [
      // The reason without its "Click to…" hint: the popover is that click.
      make('p', { textContent: mark.reason.replace(/,? or click to [^.]*\./gi, '.').replace(/\s*Click to [^.]*\./g, '').trim() || mark.reason }),
      make('button', { className: 'x', textContent: '×', title: 'Close', onclick: trusted(closePop) }),
    ]));
    if (spec.current) {
      parts.push(make('div', { className: 'section current' }, [
        make('span', {}, [`${spec.currentLabel ?? 'Your default'}: `, make('b', { textContent: spec.current })]),
        spec.canReset ? make('button', { className: 'link', textContent: 'Reset', disabled: busy, title: 'Forget this default. The field keeps its value.', onclick: trusted(() => act(() => spec.reset())) }) : null,
      ]));
    }
    if (spec.choices?.length) {
      parts.push(make('div', { className: 'section' }, [
        make('p', { className: 'label', textContent: spec.current ? `Change it${spec.heading ? ` (${spec.heading})` : ''}` : `Choose a default${spec.heading ? ` (${spec.heading})` : ''}` }),
        make('div', { className: 'choices' }, spec.choices.map((choice) => make('button', {
          className: `choice${spec.current && spec.current.toLowerCase() === choice.toLowerCase() ? ' on' : ''}`,
          textContent: choice, disabled: busy, onclick: trusted(() => act(() => spec.choose(choice))),
        }))),
      ]));
    }
    if (spec.text) {
      const input = make(spec.text.multiline ? 'textarea' : 'input', { value: spec.text.value ?? '', placeholder: 'Type your answer', disabled: busy });
      const save = () => act(() => spec.choose(input.value));
      if (!spec.text.multiline) input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.isTrusted) { event.preventDefault(); void save(); } });
      parts.push(make('div', { className: 'section' }, [
        make('p', { className: 'label', textContent: spec.current ? 'Change it' : `Set a default${spec.heading ? ` (${spec.heading})` : ''}` }),
        make('div', { className: 'text' }, [input, make('button', { className: 'act primary', textContent: 'Save', disabled: busy, onclick: trusted(save) })]),
      ]));
    }
    if (spec.fromForm) {
      parts.push(make('div', { className: 'section' }, [
        make('p', { className: 'label', textContent: spec.choices?.length || spec.text ? 'Or choose it in the form, then:' : 'Choose it in the form, then:' }),
        make('button', { className: 'act', textContent: 'Save my choice', disabled: busy, onclick: trusted(() => act(() => spec.saveFromForm())) }),
      ]));
    }
    if (spec.note) parts.push(make('p', { className: 'note', textContent: spec.note }));
    parts.push(make('p', { className: `status ${popover.kind}`, textContent: popover.message, role: 'status' }));
    pop.replaceChildren(...parts);
  }

  /** Above the icon and to its left, like the reason bubble; below when there is no room above. */
  function placePop() {
    const mark = popover.element && marks.get(popover.element);
    if (!mark || pop.hidden) return;
    const left = parseFloat(mark.node.style.left), top = parseFloat(mark.node.style.top);
    const height = pop.offsetHeight;
    const x = Math.max(scrollX + 4, Math.min(left + SIZE + 4 - 300, scrollX + document.documentElement.clientWidth - 304));
    const above = top - height - 8;
    pop.style.left = `${x}px`;
    pop.style.top = `${above >= scrollY + 4 ? above : top + SIZE + 12}px`;
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
      const reason = item.reason || 'Required, still empty.';
      const mark = marks.get(element);
      if (element && (mark?.status !== 'missing' || mark.reason !== reason)) add(element, 'missing', reason);
    }
  }

  function clear() {
    closePop();
    for (const element of [...marks.keys()]) remove(element);
  }

  // Only the person's own edits clear an icon: Autofill's events are not trusted.
  function onEdit(event) {
    // Autofill's own typing goes through the browser's editing, so its events
    // are trusted; it flags itself while typing.
    if (!event.isTrusted || window.CVAutofillFiller?.isTyping?.()) return;
    const target = event.target;
    for (const [element, mark] of marks) {
      if (element === popover.element) continue; // The person may be choosing in the form while the popover is open.
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
    // Animation off: no scrolling or glow, but each field's icon still appears as soon as it is done.
    if (mode === 'off') {
      return {
        async before() { return null; },
        async after(field, mark) { if (mark) await show([{ element: mark.element ?? field.element, status: mark.status, reason: mark.reason }]); },
        async finish() {},
        end() {},
      };
    }
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

  /** Opens a field's reason bubble: the panel's "Go to" lands with the reason in view. */
  function point(element) {
    const mark = marks.get(element);
    if (!mark) return false;
    place(element, mark.node);
    showTip(mark.node, mark.reason);
    return true;
  }

  /** content.js tells the icons what each field's default is (see "Choosing a default"). */
  const setEditor = (fn) => { editorFor = fn; };
  /** Opens a field's popover; tests use it, as they cannot click with trusted events. */
  const open = (element) => openPop(element);
  /** The popover's state, for tests. */
  const popoverState = () => ({ element: popover.element, message: popover.message, kind: popover.kind, spec: popover.spec, text: pop.textContent });

  window.CVAutofillMarks = { setEditor, open, close: closePop, popoverState, show, showMissing, clear, reattach, point, animationMode, fillHooks, stopFollowing, glowing: () => shadow.querySelectorAll('.glow').length, count: () => marks.size, statusOf: (element) => marks.get(element)?.status ?? null, reasonOf: (element) => marks.get(element)?.reason ?? null };
})();
