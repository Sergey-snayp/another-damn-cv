/**
 * Keeps the extension's own page elements (panel, launcher, field icons)
 * usable while the page shows a window in Chrome's top layer, like LinkedIn's
 * Easy Apply.
 *
 * A modal <dialog>, an open popover and a full-screen element are drawn above
 * everything else, whatever its z-index; a modal dialog also dims the page and
 * makes everything outside it ignore clicks. So while one is open, each
 * element moves inside it, and moves back to the page when it closes. Small
 * popovers (menus, tooltips) are left alone.
 *
 * Elements are moved with moveBefore() where Chrome has it, so the panel's
 * frame keeps its state; elsewhere the move reloads it.
 */
(() => {
  if (window.CVAutofillTopLayer) return;

  /** The elements to keep on the page, and what to call when one moves. */
  const wanted = new Map();
  /** When each open top-layer window was first seen, to find the topmost one. */
  const openedAt = new Map();
  let seen = 0;

  const matches = (element, selector) => { try { return element.matches(selector); } catch { return false; } };
  const ours = element => [...wanted.keys()].some(host => host === element || host.contains(element));

  /** A popover big enough to be a window over the page, not a menu or tooltip. */
  function coversPage(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height >= innerWidth * innerHeight * 0.3;
  }

  /** The page's open top-layer windows. */
  function windows() {
    const found = [...document.querySelectorAll('dialog[open]')].filter(dialog => matches(dialog, ':modal'));
    for (const popover of document.querySelectorAll('[popover]'))
      if (matches(popover, ':popover-open') && !ours(popover) && coversPage(popover)) found.push(popover);
    const full = document.fullscreenElement;
    if (full && full !== document.documentElement && !ours(full)) found.push(full);
    return found;
  }

  /** The most recently opened top-layer window, or null. */
  function topWindow() {
    let top = null, topOrder = -1;
    const open = windows();
    // A window that closed is forgotten, so opening it again puts it on top.
    for (const element of openedAt.keys()) if (!open.includes(element)) openedAt.delete(element);
    for (const element of open) {
      if (!openedAt.has(element)) openedAt.set(element, ++seen);
      if (openedAt.get(element) > topOrder) { top = element; topOrder = openedAt.get(element); }
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

  function place(host, top = topWindow()) {
    move(host, top ?? document.documentElement);
    wanted.get(host)?.(top);
  }

  /** Puts the element on the page, inside the open top-layer window if there is one. */
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
    const top = topWindow();
    for (const host of wanted.keys()) if (host.parentNode !== (top ?? document.documentElement)) place(host, top);
  }
  const schedule = () => {
    if (queued || !wanted.size) return;
    queued = true;
    queueMicrotask(update);
  };
  // showModal() sets "open"; popovers and full screen change no attribute, so
  // their events are caught on the way down (they do not bubble).
  new MutationObserver(schedule).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'popover'] });
  for (const type of ['toggle', 'close', 'cancel']) document.addEventListener(type, schedule, true);
  document.addEventListener('fullscreenchange', schedule);

  window.CVAutofillTopLayer = { attach, detach, window: topWindow };
})();
