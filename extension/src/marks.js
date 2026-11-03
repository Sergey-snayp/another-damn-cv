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
  </style>`;

  /** element → { node, status } */
  const marks = new Map();
  let ticker = 0, frame = 0;

  const Fields = () => window.CVAutofillFields;
  const isZone = (element) => !element.matches('input, select, textarea');

  function isEmpty(element) {
    if (isZone(element)) return !Fields().zoneDone(element);
    if (element.type === 'radio') return !document.querySelector(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`);
    if (element.type === 'checkbox') return !element.checked;
    if (element.type === 'file') return !element.files?.length;
    return !String(element.value ?? '').trim();
  }

  /** Where the icon sits: inside the right edge of text fields, beside choices and upload boxes. */
  function place(element, node) {
    const anchor = element.type === 'radio' || element.type === 'checkbox' ? element.closest('label') ?? element : element;
    const rect = anchor.getBoundingClientRect();
    node.hidden = !rect.width && !rect.height;
    if (node.hidden) return;
    const inside = element.matches('input:not([type="radio"]):not([type="checkbox"]), textarea');
    const roomRight = rect.right + SIZE + 10 < document.documentElement.clientWidth;
    const left = inside || !roomRight ? rect.right - SIZE - 10 : rect.right + 6;
    const top = element.matches('textarea') || isZone(element) ? rect.top + 6 : rect.top + (rect.height - SIZE) / 2 - 2;
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
    host.remove();
  }

  function start() {
    if (!host.isConnected) document.documentElement.append(host);
    if (ticker) return;
    addEventListener('scroll', reposition, { capture: true, passive: true });
    addEventListener('resize', reposition);
    // Layout shifts and fields filled later: follow the fields, and drop red
    // icons once their field has a value, however it got one.
    ticker = setInterval(() => {
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

  window.CVAutofillMarks = { show, showMissing, clear, count: () => marks.size, statusOf: (element) => marks.get(element)?.status ?? null, reasonOf: (element) => marks.get(element)?.node.title ?? null };
})();
