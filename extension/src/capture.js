/**
 * Captures the job on the current page. Injected only when you press
 * "Send this job to the app", never on its own.
 *
 * It sends three things, because each fails differently:
 *   jsonLd  the page's own structured job data — exact when present
 *   text    the job as the browser renders it — what a reader needs
 *   html    the same part, stripped down — kept so it can be re-read later
 *
 * Defines globalThis.__cvCapture; the panel calls it right after.
 */
(() => {
  const MAX_HTML = 1_400_000;
  const MAX_TEXT = 190_000;
  const MIN_TEXT = 200;

  /** Nothing a reader needs, and most of a page's weight. */
  const STRIP = [
    'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'img', 'picture',
    'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'select',
    'textarea', 'button', 'link', 'meta', '[hidden]', '[aria-hidden="true"]',
  ].join(',');

  function readJsonLd() {
    const blocks = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        blocks.push(JSON.parse(script.textContent));
      } catch {
        // Broken JSON-LD is common; the text still gets through.
      }
    }
    return blocks;
  }

  function firstWithText(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.innerText.trim().length >= MIN_TEXT) return element;
    }
    return null;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Clicks "show more" so the full description is in the DOM, then lets it render. */
  async function expand(selectors) {
    let clicked = false;
    for (const selector of selectors) {
      for (const button of document.querySelectorAll(selector)) {
        if (button.offsetParent !== null && button.getAttribute('aria-expanded') !== 'true') {
          button.click();
          clicked = true;
        }
      }
    }
    if (clicked) await wait(400);
  }

  /** A copy with only structure and links left — no classes, styles or handlers. */
  function cleanHtml(root) {
    const copy = root.cloneNode(true);
    copy.querySelectorAll(STRIP).forEach((node) => node.remove());

    for (const element of [copy, ...copy.querySelectorAll('*')]) {
      const href = element.tagName === 'A' ? element.href : null;
      for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
      if (href && /^https?:/.test(href)) element.setAttribute('href', href);
    }

    return copy.outerHTML.replace(/\s{2,}/g, ' ').slice(0, MAX_HTML);
  }

  globalThis.__cvCapture = async () => {
    const linkedin = window.CVAutofillLinkedIn;
    if (linkedin?.isPage()) {
      const job = await linkedin.expand();
      // Keep only this posting: results, recommendations and account UI never
      // become job requirements, even when they share its outer container.
      const root = document.createElement('article');
      for (const [tag, text] of [['h1', job.title], ['p', job.company], ['p', job.location]]) {
        const node = document.createElement(tag); node.textContent = text; root.append(node);
      }
      const description = document.createElement('section');
      for (const line of job.description.split('\n').filter(line => line.trim())) {
        const paragraph = document.createElement('p'); paragraph.textContent = line; description.append(paragraph);
      }
      root.append(description);
      return {
        url: job.url,
        pageTitle: [job.title, job.company].filter(Boolean).join(' at ').slice(0, 500) || 'LinkedIn job',
        html: cleanHtml(root), text: job.text.slice(0, MAX_TEXT),
        description: job.description.slice(0, MAX_TEXT),
        // Drop JSON-LD for other search results; the DOM contains the fully
        // expanded current description when its structured copy is shorter.
        jsonLd: job.posting ? [{ ...job.posting, title: job.title, description: description.innerHTML }] : [],
        hints: { title: job.title, company: job.company, ...(job.location && { location: job.location }) },
        matched: 'LinkedIn',
      };
    }
    const sites = globalThis.__cvCaptureSites ?? [];
    const site = sites.find((s) => s.hosts.test(location.hostname)) ?? null;

    if (site) await expand(site.expand);

    const root = (site && firstWithText(site.roots))
      ?? firstWithText(globalThis.__cvGenericRoots ?? [])
      ?? document.body;

    return {
      url: location.href,
      pageTitle: document.title,
      html: cleanHtml(root),
      text: root.innerText.slice(0, MAX_TEXT),
      jsonLd: readJsonLd(),
      // For the panel only: says whether a site rule or the fallback was used.
      matched: site ? `${site.name}${root === document.body ? ' (whole page)' : ''}` : root === document.body ? 'whole page' : 'main content',
    };
  };
})();
