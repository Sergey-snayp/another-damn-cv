/** One display limit for extension labels/previews. Stored and submitted values stay complete. */
export const UI_TEXT_LIMIT = 64;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const characters = value => Array.from(segmenter.segment(value), part => part.segment);

export function previewText(value, limit = UI_TEXT_LIMIT) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('The text limit must be a positive integer.');
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
  const parts = characters(text);
  return parts.length > limit ? parts.slice(0, limit - 1).join('').trimEnd() + '…' : text;
}

/** CV names often share a prefix; keep the role/company or version at the end visible too. */
export function previewCvName(value) {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
  const parts = characters(text);
  if (parts.length <= UI_TEXT_LIMIT) return text;
  const tail = Math.floor((UI_TEXT_LIMIT - 1) * .4);
  return parts.slice(0, UI_TEXT_LIMIT - 1 - tail).join('').trimEnd() + '…' + parts.slice(-tail).join('').trimStart();
}

// Scope this to display surfaces. Never shorten inputs, option values, reports,
// links, IDs or the data-copy payload used by the Profile tab.
const PREVIEWS = [
  '.page-card-title', '.page-card-company', '.page-site',
  '.cv-select-name', '.cv-option-name', '.cv-inline', '.cv-note',
  '.resume-meta strong', '.resume-switch strong', '.document-selection strong',
  '.profile-card-heading h2', '.copy-value', '.kw',
  '.val', '.status', '.fill-notes li', '.empty-label', '.empty-label small',
  '.eligibility-list > li > span:first-child', '.job-banner small', '[data-text-preview]',
  '.site-list li > span', '.site-list li > span > strong',
  '#account-name', '#account-email', '#sync-state',
].join(',');

/** Also handles late results and redraws; metadata lets a reused node recover its full source. */
export function observeTextPreviews(root = document.body) {
  const sources = new WeakMap();
  const tooltips = new WeakMap();
  function update() {
    const elements = [...(root.matches?.(PREVIEWS) ? [root] : []), ...root.querySelectorAll(PREVIEWS)];
    for (const element of elements) {
      if (element.closest('input, textarea, select, option, script, style, code, [contenteditable]')) continue;
      const texts = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.data.trim());
      let clipped = false;
      const full = texts.map(node => {
        const previous = sources.get(node);
        const source = previous?.preview === node.data ? previous.source : node.data;
        const long = characters(String(source).replace(/\s+/gu, ' ').trim()).length > UI_TEXT_LIMIT;
        // Preserve the separating space before badges such as "(default)".
        const shorten = element.matches('.cv-select-name, .cv-option-name') ? previewCvName : previewText;
        const preview = long ? shorten(source) + (/\s$/u.test(source) && node.nextSibling ? ' ' : '') : source;
        clipped ||= long;
        sources.set(node, { source, preview });
        if (node.data !== preview) node.data = preview;
        return source.trim();
      }).join(' ');
      const previous = tooltips.get(element);
      if (clipped) {
        const original = previous ?? { title: element.getAttribute('title'), description: element.getAttribute('aria-description') };
        element.setAttribute('title', full);
        element.setAttribute('aria-description', full);
        element.dataset.textLimited = '';
        tooltips.set(element, original);
      } else if (previous) {
        for (const [attribute, value] of [['title', previous.title], ['aria-description', previous.description]]) {
          if (value === null) element.removeAttribute(attribute); else element.setAttribute(attribute, value);
        }
        delete element.dataset.textLimited;
        tooltips.delete(element);
      }
    }
  }
  update();
  const observer = new MutationObserver(update);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
