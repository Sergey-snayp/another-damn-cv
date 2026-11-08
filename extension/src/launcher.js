/** Isolated page-edge launcher. It never reads profile values or fills a form. */
(() => {
  // One button per tab: only the top page shows it. Forms in iframes report to it (content.js).
  if (window.CVAutofillLauncher || window !== window.top) return;
  // False once the extension is reloaded or updated: this copy can no longer use
  // chrome.* APIs, and calling them throws "Extension context invalidated".
  const alive = () => Boolean(chrome.runtime?.id);
  const store = values => { if (!alive()) return; try { void chrome.storage.local.set(values).catch(() => {}); } catch { /* reloaded */ } };
  const STALE = 'CV Autofill was updated. Reload this page to use it.';
  const host = document.createElement('div');
  host.id = 'adcv-autofill-launcher';
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  shadow.adoptedStyleSheets = [sheet];
  // formHere: the form itself is on the page, not one click away on a job page.
  let available = false, formHere = false, enabled = true, disabledHosts = [], dismissedUrl = null, position = null, panelOpen = false, keepAfterPanel = false;
  let settingsLoaded = false, autoOpenedUrl = null;
  const clamp = y => Math.max(48, Math.min(y, Math.max(48, innerHeight - 100)));
  const css = `
    :host { all: initial; position: fixed !important; right: 0 !important; top: min(22vh,160px); z-index: 2147483646 !important; font: 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color: var(--color-text); }
    * { box-sizing: border-box; } button { font: inherit; color: inherit; cursor: pointer; }
    .launcher { display:flex; position:relative; width:56px; height:60px; background:var(--color-accent); border:1px solid var(--color-border); border-right:0; border-radius:15px 0 0 15px; box-shadow:0 4px 18px var(--color-shadow); transition:width .18s ease; }
    .launcher:hover, .launcher:focus-within, .launcher.dragging { width:88px; }
    .open { display:grid; place-items:center; width:56px; min-width:56px; border:0; border-radius:14px 0 0 14px; background:transparent; padding:6px; }
    .open:hover { background:var(--color-accent-hover); } .open img { display:block; width:43px; height:43px; object-fit:contain; pointer-events:none; }
    .grip { width:0; padding:0; opacity:0; overflow:hidden; pointer-events:none; background:var(--color-accent-hover); border:0; cursor:grab; touch-action:none; transition:width .18s,opacity .18s; }
    .launcher:hover .grip,.launcher:focus-within .grip,.launcher.dragging .grip { width:32px; opacity:1; pointer-events:auto; }
    .dots { display:grid; grid-template-columns:repeat(2,3px); gap:4px; justify-content:center; } .dots i { width:3px; height:3px; background:var(--color-text); border-radius:50%; }
    .dismiss { position:absolute; top:-11px; left:-11px; width:25px; height:25px; border:1px solid var(--color-border); border-radius:50%; background:var(--color-text); color:var(--color-surface); opacity:0; pointer-events:none; transition:opacity .18s; display:grid; place-items:center; padding:0; font-size:19px; }
    .launcher:hover .dismiss,.launcher:focus-within .dismiss,.launcher.dragging .dismiss,.launcher.menu-open .dismiss { opacity:1; pointer-events:auto; }
    .menu { position:absolute; top:calc(100% + 10px); right:10px; width:236px; margin:0; padding:6px; list-style:none; border:1px solid var(--color-border); border-radius:12px; background:var(--color-surface); box-shadow:0 8px 28px var(--color-shadow); }
    .menu.up { top:auto; bottom:calc(100% + 10px); }
    .menu button { display:block; width:100%; padding:10px 12px; border:0; border-radius:8px; background:transparent; text-align:left; font-size:14px; color:var(--color-text); }
    .menu button:hover,.menu button:focus-visible { background:var(--color-background); outline:none; }
    button:focus-visible { outline:2px solid var(--color-focus); outline-offset:3px; } .open:disabled { cursor:wait; opacity:.6; }
    .status { position:absolute; top:100%; right:8px; width:230px; padding:10px 12px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); box-shadow:0 4px 16px var(--color-shadow); color:var(--color-text); } [hidden] { display:none !important; }
    @media(prefers-reduced-motion:reduce) { .launcher,.grip,.dismiss { transition:none; } }
  `;
  const removeHost = () => (window.CVAutofillTopLayer ? window.CVAutofillTopLayer.detach(host) : host.remove());

  function renderVisibility() {
    // Collapsing the panel always leaves the button as the way back to it, even
    // where it was hidden. A new hide choice from the × menu applies again.
    const hiddenByChoice = !enabled || disabledHosts.includes(location.hostname) || dismissedUrl === location.href;
    // Open once for this page when an application form appears, including
    // forms found in iframes. Wait for saved hide/disable settings first.
    // Closing the panel leaves it closed through later scans of the same form.
    if (settingsLoaded && available && formHere && !hiddenByChoice && !panelOpen && autoOpenedUrl !== location.href) {
      if (window.CVAutofillPanel?.open()) return;
    }
    if (!panelOpen && (keepAfterPanel || (available && !hiddenByChoice))) {
      loadTheme();
      if (window.CVAutofillTopLayer) window.CVAutofillTopLayer.attach(host); else if (!host.isConnected) document.documentElement.append(host);
      if (position !== null) host.style.setProperty('top', `${clamp(position * innerHeight)}px`, 'important');
    } else { closeMenu(); removeHost(); }
  }
  // Loaded the first time the button shows: this script runs on every site,
  // and most pages never show it.
  let themeRequested = false;
  function loadTheme() {
    if (themeRequested || !alive()) return;
    themeRequested = true;
    fetch(chrome.runtime.getURL('assets/theme/launcher-colors.css')).then(response => {
      if (!response.ok) throw new Error('Theme unavailable');
      return response.text();
    }).then(theme => { sheet.replaceSync(theme + css); host.hidden = false; }).catch(() => removeHost());
  }
  host.hidden = true;
  shadow.innerHTML = `<div class="launcher" role="group" aria-label="CV Autofill launcher">
    <button class="open" title="Open Autofill" aria-label="Open Autofill"><img alt="D!" src="${chrome.runtime.getURL('assets/brand/d-stamp-logo.png')}"></button>
    <button class="grip" title="Drag to move · Arrow keys move up or down" aria-label="Move Autofill button"><span class="dots" aria-hidden="true">${'<i></i>'.repeat(6)}</span></button>
    <button class="dismiss" title="Hide options" aria-label="Hide Autofill button" aria-haspopup="menu" aria-expanded="false">×</button>
  </div><ul class="menu" role="menu" aria-label="Hide Autofill button" hidden>
    <li role="none"><button role="menuitem" data-hide="visit">Hide until next visit</button></li>
    <li role="none"><button role="menuitem" data-hide="domain">Disable on this domain</button></li>
    <li role="none"><button role="menuitem" data-hide="all">Disable on all pages</button></li>
  </ul><p class="status" role="status" hidden></p>`;
  const launcher = shadow.querySelector('.launcher'), open = shadow.querySelector('.open'), grip = shadow.querySelector('.grip'), status = shadow.querySelector('.status');
  open.addEventListener('click', () => {
    status.hidden = true;
    if (window.CVAutofillPanel?.open()) return;
    status.textContent = alive() ? 'Reload this page to reconnect the extension.' : STALE; status.hidden = false;
  });
  // × opens a menu of how long to hide. Settings in the panel undo the lasting choices.
  const dismiss = shadow.querySelector('.dismiss'), menu = shadow.querySelector('.menu'), items = [...menu.querySelectorAll('button')];
  function closeMenu(restoreFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true; dismiss.setAttribute('aria-expanded', 'false'); launcher.classList.remove('menu-open');
    if (restoreFocus) dismiss.focus();
  }
  dismiss.addEventListener('click', () => {
    if (!menu.hidden) { closeMenu(); return; }
    status.hidden = true; menu.classList.toggle('up', host.getBoundingClientRect().bottom + 170 > innerHeight); menu.hidden = false; dismiss.setAttribute('aria-expanded', 'true'); launcher.classList.add('menu-open'); items[0].focus();
  });
  menu.addEventListener('keydown', event => {
    const i = items.indexOf(shadow.activeElement);
    const next = { ArrowDown: items[(i + 1) % items.length], ArrowUp: items[(i + items.length - 1) % items.length], Home: items[0], End: items.at(-1) }[event.key];
    if (next) { event.preventDefault(); next.focus(); }
    else if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    else if (event.key === 'Tab') closeMenu();
  });
  addEventListener('pointerdown', event => { if (!event.composedPath().includes(host)) closeMenu(); }, true);
  menu.addEventListener('click', event => {
    const choice = event.target.closest('[data-hide]')?.dataset.hide;
    if (!choice) return;
    closeMenu();
    keepAfterPanel = false;
    if (choice === 'visit') dismissedUrl = location.href;
    else if (choice === 'domain') { disabledHosts = [...new Set([...disabledHosts, location.hostname])]; store({ launcherDisabledHosts: disabledHosts }); }
    else { enabled = false; store({ launcherEnabled: false }); }
    renderVisibility();
  });
  let drag = null;
  function move(y) { const top = clamp(y); position = top / innerHeight; host.style.setProperty('top', `${top}px`, 'important'); }
  function savePosition() { store({ launcherPosition: position }); }
  grip.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); drag = { id: event.pointerId, offset: event.clientY - host.getBoundingClientRect().top };
    grip.setPointerCapture(event.pointerId); launcher.classList.add('dragging');
  });
  grip.addEventListener('pointermove', event => { if (drag?.id === event.pointerId) move(event.clientY - drag.offset); });
  const endDrag = () => { if (!drag) return; drag = null; launcher.classList.remove('dragging'); savePosition(); };
  grip.addEventListener('pointerup', endDrag); grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('keydown', event => { if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); move(host.getBoundingClientRect().top + (event.key === 'ArrowUp' ? -16 : 16)); savePosition(); });
  chrome.storage.local.get(['launcherEnabled', 'launcherDisabledHosts', 'launcherPosition']).then(values => { enabled = values.launcherEnabled !== false; if (Array.isArray(values.launcherDisabledHosts)) disabledHosts = values.launcherDisabledHosts; if (typeof values.launcherPosition === 'number' && Number.isFinite(values.launcherPosition)) position = values.launcherPosition; settingsLoaded = true; renderVisibility(); }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.launcherEnabled) enabled = changes.launcherEnabled.newValue !== false;
    if (changes.launcherDisabledHosts) disabledHosts = Array.isArray(changes.launcherDisabledHosts.newValue) ? changes.launcherDisabledHosts.newValue : [];
    if (changes.launcherEnabled || changes.launcherDisabledHosts) renderVisibility();
  });
  addEventListener('resize', renderVisibility);
  window.CVAutofillLauncher = {
    update(value, { form = true } = {}) { available = value; formHere = value && form; renderVisibility(); },
    /** Puts the button back after a page rebuilt its document and dropped it. */
    reattach() { if (!host.isConnected) renderVisibility(); },
    panelChanged(open) { panelOpen = open; autoOpenedUrl = location.href; if (open) keepAfterPanel = true; renderVisibility(); },
  };
})();
