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

  document.addEventListener('adcv:react-pick', (event) => {
    const token = String(event.detail ?? '');
    let ok = false;
    try { ok = Boolean(token) && pick(token); } catch { ok = false; }
    document.dispatchEvent(new CustomEvent('adcv:react-picked', { detail: JSON.stringify({ token, ok }) }));
  });
})();
