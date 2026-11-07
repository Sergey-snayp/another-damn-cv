/**
 * The in-page panel: an extension frame pinned to the page's right edge.
 *
 * The panel itself is src/sidepanel.html, loaded in an iframe. The page cannot
 * read inside that frame, and its CSS cannot reach it. A closed shadow root
 * keeps page scripts from grabbing the frame element.
 *
 * This file can run twice in one page (the manifest bundle, then a toolbar
 * click), so it only sets itself up once.
 */
(() => {
  // One panel per tab, on the top page; it reaches forms in iframes by frame id.
  if (window.CVAutofillPanel || window !== window.top) return;

  const WIDTH = 400;
  const host = document.createElement('div');
  host.id = 'adcv-autofill-panel';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { all: initial; position: fixed !important; top: 0 !important; right: 0 !important; z-index: 2147483647 !important;
      width: min(${WIDTH}px, 100vw) !important; height: 100vh !important; display: block !important; pointer-events: none; }
    .frame { width: 100%; height: 100%; transform: translateX(105%); transition: transform .2s ease; pointer-events: auto;
      border-radius: 16px 0 0 16px; overflow: hidden; background: #fff; box-shadow: -6px 0 28px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.08); }
    :host(.open) .frame { transform: none; }
    iframe { display: block; width: 100%; height: 100%; border: 0; color-scheme: light; }
    @media (prefers-reduced-motion: reduce) { .frame { transition: none; } }
  </style><div class="frame"></div>`;
  const frameBox = shadow.querySelector('.frame');
  let iframe = null, isOpen = false, closeTimer;

  const alive = () => Boolean(chrome.runtime?.id);

  /** On the page, or inside its open modal dialog (LinkedIn's Easy Apply) so it can still be clicked. */
  function attachHost() {
    if (window.CVAutofillTopLayer) window.CVAutofillTopLayer.attach(host);
    else if (!host.isConnected) document.documentElement.append(host);
  }

  // ─── Room for the panel ──────────────────────────────────────────────────────
  // While the panel is open the page is narrowed by its width, so the panel sits
  // beside the form instead of over it (as Simplify does). Elements that still
  // reach under the panel (fixed bars, centered pop-ups, fixed-width blocks) are
  // pulled in; each one's own style is kept and put back when the panel closes.
  const SPACE_ID = 'adcv-page-space';
  const MAX_CHANGED = 64, MAX_VISITED = 6000;
  const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'META', 'TITLE']);
  /** element → [[property, old value, old priority]] */
  let changed = new Map(), spaceStyle = null, spaceTimer = 0, spaceTries = 0, lastPass = 0;
  const ours = (element) => element === host || element.id?.startsWith('adcv-');

  function remember(element, properties) {
    if (!changed.has(element)) { if (changed.size >= MAX_CHANGED) return false; changed.set(element, []); }
    const saved = changed.get(element);
    for (const property of properties)
      if (!saved.some(([name]) => name === property)) saved.push([property, element.style.getPropertyValue(property) || null, element.style.getPropertyPriority(property)]);
    return true;
  }

  /** Pulls in one element that reaches under the panel. True when it changed something new. */
  function pullIn(element, style, edge) {
    if (style.position === 'fixed') {
      const fresh = !changed.has(element);
      if (!remember(element, ['margin-right', 'max-width', 'margin-left'])) return false;
      element.style.setProperty('margin-right', `${WIDTH}px`, 'important');
      element.style.setProperty('max-width', `calc(100% - ${WIDTH}px)`, 'important');
      // Centered with left: 50% it does not move: slide it left by what still overlaps.
      const after = element.getBoundingClientRect();
      const overlap = Math.min(after.right - edge, after.left);
      if (overlap > 2) element.style.setProperty('margin-left', `${(parseFloat(getComputedStyle(element).marginLeft) || 0) - overlap}px`, 'important');
      return fresh;
    }
    const fresh = !changed.has(element);
    if (!remember(element, ['min-width', 'max-width'])) return false;
    element.style.setProperty('min-width', '0', 'important');
    element.style.setProperty('max-width', '100%', 'important');
    if (fresh) return true;
    // Still too wide inside its parent (Simplify does the same): a grid's one fixed column
    // may shrink, or every item of a flex row that does not wrap (LinkedIn's job columns).
    const parent = element.parentElement;
    if (!parent || ours(parent) || parent === document.documentElement) return false;
    const box = element.getBoundingClientRect(), outer = parent.getBoundingClientRect();
    const parentStyle = getComputedStyle(parent);
    if (box.width > parent.clientWidth + 2 && parentStyle.display.includes('grid') && /^\d+(\.\d+)?px$/.test(parentStyle.gridTemplateColumns)
      && parseFloat(parentStyle.gridTemplateColumns) > parent.clientWidth + 2) {
      const first = !changed.has(parent) || !changed.get(parent).some(([name]) => name === 'grid-template-columns');
      if (remember(parent, ['grid-template-columns'])) parent.style.setProperty('grid-template-columns', 'minmax(0, 100%)', 'important');
      return first;
    }
    if (!parentStyle.display.includes('flex') || !parentStyle.flexDirection.startsWith('row') || parentStyle.flexWrap !== 'nowrap') return false;
    if (box.right <= outer.right - (parseFloat(parentStyle.paddingRight) || 0) + 2) return false;
    let shrunk = false;
    for (const child of parent.children) {
      if (!(child instanceof HTMLElement) || ours(child)) continue;
      const childStyle = getComputedStyle(child);
      if (childStyle.display === 'none' || childStyle.position === 'absolute' || childStyle.position === 'fixed') continue;
      const first = !changed.has(child) || !changed.get(child).some(([name]) => name === 'flex-shrink');
      if (!remember(child, ['min-width', 'flex-shrink'])) continue;
      child.style.setProperty('min-width', '0', 'important');
      child.style.setProperty('flex-shrink', '1', 'important');
      shrunk ||= first;
    }
    return shrunk;
  }

  /** One pass over the page: pulls in what reaches under the panel. Returns how many changed. */
  function pass() {
    const view = document.documentElement.clientWidth; // The window: the root's margin does not change it.
    const edge = view - WIDTH;
    let moved = 0, visited = 0;
    const visit = (parent, depth, contained) => {
      if (depth > 16) return;
      for (const element of parent.children) {
        if (visited++ > MAX_VISITED) return;
        if (!(element instanceof HTMLElement) || SKIP_TAGS.has(element.tagName) || ours(element)) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none') continue;
        const box = element.getBoundingClientRect();
        // A fixed drawer parked off screen to the right stays where it is.
        if (style.position === 'fixed' && box.right > view + 8) continue;
        const floating = style.position === 'fixed' || style.position === 'absolute';
        if (style.visibility !== 'hidden' && box.width >= 24 && box.height >= 4 && box.right > edge + 2 && box.left < view
          && (!contained || floating) && pullIn(element, style, edge)) moved++;
        // Inside a box that scrolls sideways and already ends before the panel, only floating things can reach it.
        const scrolls = (style.overflowX === 'auto' || style.overflowX === 'scroll') && element.getBoundingClientRect().right <= edge + 2;
        visit(element, depth + 1, style.position !== 'fixed' && (contained || scrolls));
      }
    };
    if (document.body) visit(document.body, 0, false);
    return moved;
  }

  /** Passes until nothing new changes (at most three), as the page settles into the narrower width. */
  function contract() {
    if (spaceStyle) narrowRoot();
    let moved = 0;
    for (let round = 0; round < 3; round++) {
      const changedNow = pass();
      moved += changedNow;
      if (!changedNow) break;
    }
    return moved;
  }

  /**
   * Checks again while the panel is open: soon after opening, then every 1 to 8
   * seconds, sooner again whenever something had to move. Pages keep building
   * parts (LinkedIn's Easy Apply opens later).
   */
  const QUICK = [32, 96, 250, 600];
  let wait = 1000;
  function scheduleContract(restart = false) {
    clearTimeout(spaceTimer);
    if (!spaceStyle) return;
    if (restart) { spaceTries = 0; wait = 1000; }
    const delay = spaceTries < QUICK.length ? QUICK[spaceTries] : wait;
    spaceTimer = setTimeout(() => {
      if (!spaceStyle) return;
      if (document.visibilityState === 'hidden') { scheduleContract(); return; }
      const moved = contract();
      spaceTries++;
      if (moved) scheduleContract(true);
      else { if (spaceTries > QUICK.length) wait = Math.min(wait * 2, 8000); scheduleContract(); }
    }, delay);
  }
  const onPageMove = () => {
    if (!spaceStyle || Date.now() - lastPass < 250) return;
    lastPass = Date.now();
    if (contract()) scheduleContract(true);
  };

  /** The page itself: set on <html> directly, which a site's security policy (LinkedIn's) cannot block. */
  function narrowRoot() {
    const root = document.documentElement;
    const values = { 'margin-right': `${WIDTH}px`, width: 'auto', 'min-width': '0', 'max-width': `calc(100% - ${WIDTH}px)` };
    if (Object.entries(values).every(([property, value]) => root.style.getPropertyValue(property) === value && root.style.getPropertyPriority(property) === 'important')) return;
    if (!remember(root, Object.keys(values))) return;
    for (const [property, value] of Object.entries(values)) root.style.setProperty(property, value, 'important');
  }

  function reserveSpace() {
    if (spaceStyle) return;
    narrowRoot();
    // The same as a style sheet too, for pages that rewrite <html>'s own style.
    spaceStyle = document.createElement('style');
    spaceStyle.id = SPACE_ID;
    spaceStyle.textContent = `html { margin-right: ${WIDTH}px !important; width: auto !important; min-width: 0 !important; max-width: calc(100% - ${WIDTH}px) !important; }`;
    (document.head || document.documentElement).append(spaceStyle);
    contract();
    scheduleContract(true);
    addEventListener('scroll', onPageMove, { passive: true, capture: true });
    addEventListener('resize', onPageMove, { passive: true });
  }

  function releaseSpace() {
    clearTimeout(spaceTimer);
    removeEventListener('scroll', onPageMove, { capture: true });
    removeEventListener('resize', onPageMove);
    for (const [element, saved] of changed) {
      for (const [property, value, priority] of saved) {
        if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
      }
      if (element.getAttribute('style') === '') element.removeAttribute('style');
    }
    changed = new Map();
    spaceStyle?.remove();
    spaceStyle = null;
  }

  function notify(type) {
    if (!alive()) return;
    try { void chrome.runtime.sendMessage({ type }).catch(() => {}); } catch { /* extension reloaded */ }
  }

  /** Returns false when the panel cannot open because the extension was reloaded. */
  function open() {
    // A reloaded extension cannot load a new panel here. An existing panel stays
    // usable: it shows its own "reload this page" notice.
    if (!iframe && !alive()) return false;
    clearTimeout(closeTimer);
    attachHost();
    if (!iframe) {
      // Created once and kept while hidden, so tabs, drafts and scroll survive a close.
      iframe = document.createElement('iframe');
      iframe.addEventListener('load', () => {
        iframe.contentWindow?.postMessage({ type: 'adcv-panel-visible', visible: isOpen }, '*');
      });
      iframe.src = chrome.runtime.getURL('src/sidepanel.html');
      iframe.title = 'CV Autofill';
      iframe.allow = 'clipboard-write';
      frameBox.append(iframe);
    }
    requestAnimationFrame(() => host.classList.add('open'));
    host.style.removeProperty('visibility');
    isOpen = true;
    reserveSpace();
    iframe.contentWindow?.postMessage({ type: 'adcv-panel-visible', visible: true }, '*');
    window.CVAutofillLauncher?.panelChanged(true);
    notify('panel-opened');
    return true;
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    iframe?.contentWindow?.postMessage({ type: 'adcv-panel-visible', visible: false }, '*');
    host.classList.remove('open');
    releaseSpace();
    // Hide after the slide so a closed panel never catches clicks or tab focus.
    closeTimer = setTimeout(() => host.style.setProperty('visibility', 'hidden', 'important'), 220);
    window.CVAutofillLauncher?.panelChanged(false);
    notify('panel-closed');
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!alive() || sender.id !== chrome.runtime.id) return false;
    const actions = { 'panel-toggle': () => (isOpen ? close() : open()), 'panel-open': open, 'panel-close': close };
    if (!actions[message?.type]) return false;
    actions[message.type]();
    // Answer, or the sender sees a closed channel and treats it as a failure.
    sendResponse({ ok: true, open: isOpen });
    return false;
  });

  // The panel's collapse button posts here directly. Unlike chrome.* messaging,
  // this still works after the extension is reloaded. Only our own frame counts.
  addEventListener('message', event => {
    if (iframe && event.source === iframe.contentWindow && event.origin.startsWith('chrome-extension://') && event.data?.type === 'adcv-panel-close') close();
  });

  /** An open panel goes back on the page if the page rebuilt its document. */
  function reattach() {
    if (isOpen && !host.isConnected) attachHost();
    if (spaceStyle && !spaceStyle.isConnected) (document.head || document.documentElement).append(spaceStyle);
  }

  window.CVAutofillPanel = { open, close, reattach, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen };

  // Reopen after a page load if this tab had the panel open.
  try {
    chrome.runtime.sendMessage({ type: 'panel-state' }).then(state => { if (state?.open && !isOpen) open(); }).catch(() => {});
  } catch { /* extension reloaded */ }
})();
