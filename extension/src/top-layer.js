/**
 * Keeps the extension's own page elements (panel, launcher, field icons)
 * usable while the page shows a modal <dialog>, like LinkedIn's Easy Apply.
 *
 * Chrome draws a modal dialog above everything else, behind a dimmed
 * backdrop, and makes the rest of the page ignore clicks. Nothing outside the
 * dialog can be clicked, whatever its z-index. So while one is open, each
 * element moves inside it, and moves back to the page when it closes.
 *
 * Elements are moved with moveBefore() where Chrome has it, so the panel's
 * frame keeps its state; elsewhere the move reloads it.
 */
(() => {
  if (window.CVAutofillTopLayer) return;

  /** The elements to keep on the page, and what to call when one moves. */
  const wanted = new Map();
  /** When each open modal dialog was first seen, to find the topmost one. */
  const openedAt = new WeakMap();
  let seen = 0;

  const isModal = dialog => { try { return dialog.matches(':modal'); } catch { return false; } };

  /** The most recently opened modal dialog, or null. */
  function topDialog() {
    let top = null, topOrder = -1;
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      if (!isModal(dialog)) { openedAt.delete(dialog); continue; }
      if (!openedAt.has(dialog)) openedAt.set(dialog, ++seen);
      if (openedAt.get(dialog) > topOrder) { top = dialog; topOrder = openedAt.get(dialog); }
    }
    return top;
  }

  function move(host, parent) {
    if (host.parentNode === parent) return;
    try {
      if (typeof parent.moveBefore === 'function' && host.isConnected) { parent.moveBefore(host, null); return; }
    } catch { /* not movable atomically: append below */ }
    parent.append(host);
  }

  function place(host) {
    const dialog = topDialog();
    move(host, dialog ?? document.documentElement);
    wanted.get(host)?.(dialog);
  }

  /** Puts the element on the page, inside the open modal dialog if there is one. */
  function attach(host, onPlaced) {
    if (!wanted.has(host) || onPlaced) wanted.set(host, onPlaced ?? wanted.get(host) ?? null);
    place(host);
  }

  /** Takes the element off the page until the next attach. */
  function detach(host) {
    wanted.delete(host);
    host.remove();
  }

  let queued = false;
  function update() {
    queued = false;
    if (!wanted.size) return;
    const parent = topDialog() ?? document.documentElement;
    for (const host of wanted.keys()) if (host.parentNode !== parent) place(host);
  }
  new MutationObserver(() => {
    if (queued || !wanted.size) return;
    queued = true;
    queueMicrotask(update);
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });

  window.CVAutofillTopLayer = { attach, detach, dialog: topDialog };
})();
