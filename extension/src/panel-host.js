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
  if (window.CVAutofillPanel) return;

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
    if (!host.isConnected) document.documentElement.append(host);
    if (!iframe) {
      // Created once and kept while hidden, so tabs, drafts and scroll survive a close.
      iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('src/sidepanel.html');
      iframe.title = 'CV Autofill';
      iframe.allow = 'clipboard-write';
      frameBox.append(iframe);
    }
    requestAnimationFrame(() => host.classList.add('open'));
    host.style.removeProperty('visibility');
    isOpen = true;
    window.CVAutofillLauncher?.panelChanged(true);
    notify('panel-opened');
    return true;
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    host.classList.remove('open');
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
    if (isOpen && !host.isConnected) document.documentElement.append(host);
  }

  window.CVAutofillPanel = { open, close, reattach, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen };

  // Reopen after a page load if this tab had the panel open.
  try {
    chrome.runtime.sendMessage({ type: 'panel-state' }).then(state => { if (state?.open && !isOpen) open(); }).catch(() => {});
  } catch { /* extension reloaded */ }
})();
