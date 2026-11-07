/**
 * Runs in the page's own JavaScript world (manifest "world": "MAIN"), where
 * React keeps each element's event handlers. The extension's page script,
 * which runs in an isolated world and cannot see them, asks this script to
 * pick a dropdown option by calling that option's own React click handler.
 * It is the last resort, after highlight-and-Enter and a simulated click.
 *
 * The request is a DOM event carrying only a tag the page script put on the
 * option element. No profile data reaches this world, and it does nothing the
 * page could not do itself. The page script checks the result on screen, so
 * a page faking the reply gains nothing.
 *
 * It also uploads to "Upload resume" buttons that create their file input
 * only when clicked (LinkedIn's Easy Apply), where there is no input to fill.
 * Autofill hands over the CV (or cover letter) PDF that it is uploading to
 * this page anyway, then clicks the button; the next file input the page opens
 * within a few seconds takes that file instead of showing the file picker.
 */
(() => {
  if (window.__adcvPageWorld) return;
  window.__adcvPageWorld = true;

  /** React's props for an element: its handlers, keyed __reactProps$<random>. */
  function reactProps(element) {
    const key = Object.keys(element).find((name) => name.startsWith('__reactProps$') || name.startsWith('__reactEventHandlers$'));
    return key ? element[key] : null;
  }

  /** Something shaped like React's own event, for handlers that read it. */
  function syntheticEvent(type, target, currentTarget) {
    const nativeEvent = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
    let prevented = false, stopped = false;
    return {
      type, target, currentTarget, nativeEvent, button: 0, bubbles: true, cancelable: true,
      preventDefault() { prevented = true; }, isDefaultPrevented: () => prevented,
      stopPropagation() { stopped = true; }, isPropagationStopped: () => stopped,
      persist() {},
    };
  }

  /** Calls the nearest React click (or mouse-down) handler on the tagged option or just above it. */
  function pick(token) {
    const option = document.querySelector(`[data-adcv-pick="${CSS.escape(token)}"]`);
    for (let node = option, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
      const props = reactProps(node);
      for (const name of ['onClick', 'onMouseDown']) {
        if (typeof props?.[name] !== 'function') continue;
        props[name](syntheticEvent(name === 'onClick' ? 'click' : 'mousedown', option, node));
        return true;
      }
    }
    return false;
  }

  // ─── Upload buttons with no file input ──────────────────────────────────────
  let armed = null; // { token, file, until }
  const reply = (type, token) => document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify({ token }) }));

  document.addEventListener('adcv:arm-file', async (event) => {
    let request;
    try { request = JSON.parse(String(event.detail)); } catch { return; }
    if (request?.disarm) { if (armed?.token === request.token) armed = null; return; }
    if (typeof request?.dataUrl !== 'string' || !request.dataUrl.startsWith('data:') || typeof request.token !== 'string') return;
    try {
      const blob = await (await fetch(request.dataUrl)).blob();
      const file = new File([blob], String(request.fileName || 'Resume.pdf'), { type: blob.type || 'application/pdf' });
      armed = { token: request.token, file, until: Date.now() + 5000 };
      reply('adcv:file-armed', request.token);
    } catch { /* the page script times out and reports it */ }
  });

  /** Gives the armed file to a file input the page is opening. */
  function take(input) {
    if (!armed || Date.now() > armed.until || !(input instanceof HTMLInputElement) || input.type !== 'file') return false;
    const { file, token } = armed;
    armed = null;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    reply('adcv:file-used', token);
    return true;
  }

  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { return take(this) ? undefined : click.call(this); };
  const showPicker = HTMLInputElement.prototype.showPicker;
  if (showPicker) HTMLInputElement.prototype.showPicker = function () { return take(this) ? undefined : showPicker.call(this); };
  // Pages using the File System Access picker instead of an input.
  if (typeof window.showOpenFilePicker === 'function') {
    const openPicker = window.showOpenFilePicker;
    window.showOpenFilePicker = function (...args) {
      if (!armed || Date.now() > armed.until) return openPicker.apply(this, args);
      const { file, token } = armed;
      armed = null;
      reply('adcv:file-used', token);
      return Promise.resolve([{ kind: 'file', name: file.name, getFile: () => Promise.resolve(file) }]);
    };
  }

  document.addEventListener('adcv:react-pick', (event) => {
    const token = String(event.detail ?? '');
    let ok = false;
    try { ok = Boolean(token) && pick(token); } catch { ok = false; }
    document.dispatchEvent(new CustomEvent('adcv:react-picked', { detail: JSON.stringify({ token, ok }) }));
  });
})();
