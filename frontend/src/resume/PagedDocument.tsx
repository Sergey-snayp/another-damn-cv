import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A4 at 96dpi; each template's top and bottom page margin is the page's own top padding here. */
const PAGE_HEIGHT = (297 * 96) / 25.4;
const GAP = 28;

/** The parts the print style keeps whole (break-inside: avoid), in reading order. */
const BLOCKS = '.doc-head, .doc-section > h2, .doc-summary, .doc-roleline, .doc-subline, .doc-role-desc, .doc-bullets > li, .doc-skills, .doc-paragraph';
/** Parts kept with what follows them (break-after: avoid). */
const KEEP_WITH_NEXT = '.doc-section > h2, .doc-roleline, .doc-subline, .doc-role-desc';

/**
 * The CV drawn as the sheets of its PDF: a part that would cross the bottom
 * margin moves to the next sheet, as Chrome does when it prints the CV with
 * the same rules (document.css, @media print). A heading or a job's title
 * line moves along with the part after it.
 */
export function PagedDocument({ children, watch }: {
  children: ReactNode;
  /** Anything that changes the CV's height: the CV and its design. */
  watch: unknown;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);

  useLayoutEffect(() => {
    const page = box.current?.querySelector<HTMLElement>('.page');
    if (!page) return;

    const paginate = () => {
      const MARGIN = parseFloat(getComputedStyle(page).paddingTop) || 45.35;
      const blocks = [...page.querySelectorAll<HTMLElement>(BLOCKS)];
      for (const block of blocks) block.style.removeProperty('margin-top');
      page.style.minHeight = '';
      // The preview may be zoomed; positions are worked out in the page's own pixels.
      const scale = page.getBoundingClientRect().height / page.offsetHeight || 1;
      const top = (element: HTMLElement) => (element.getBoundingClientRect().top - page.getBoundingClientRect().top) / scale;
      const height = (element: HTMLElement) => element.getBoundingClientRect().height / scale;
      // Moves it down to `target`. Margins can collapse with the one above, so it is measured again.
      const moveTo = (element: HTMLElement, target: number) => {
        for (let tries = 0; tries < 3; tries++) {
          const by = target - top(element);
          if (by < 0.5) return;
          const margin = parseFloat(getComputedStyle(element).marginTop) || 0;
          element.style.marginTop = `${margin + by}px`;
        }
      };

      let previous: HTMLElement | null = null;
      for (const block of blocks) {
        if (block.closest('.doc-head') && block !== block.closest('.doc-head')) continue;
        const start = top(block);
        const sheet = Math.floor(start / (PAGE_HEIGHT + GAP));
        const contentEnd = sheet * (PAGE_HEIGHT + GAP) + PAGE_HEIGHT - MARGIN;
        const size = height(block);
        if (start + size > contentEnd && size < PAGE_HEIGHT - 2 * MARGIN) {
          // Move it (or the heading before it) to the top of the next sheet.
          // A line kept with the next one only inside its own entry (not the last line of an entry).
          const keeps = previous && previous.matches(KEEP_WITH_NEXT) && !(previous.matches('.doc-role > :last-child'))
            && Math.floor(top(previous) / (PAGE_HEIGHT + GAP)) === sheet;
          const mover = keeps && previous ? previous : block;
          moveTo(mover, (sheet + 1) * (PAGE_HEIGHT + GAP) + MARGIN);
        }
        previous = block;
      }
      const used = page.scrollHeight;
      const count = Math.max(1, Math.ceil((used - parseFloat(getComputedStyle(page).paddingTop)) / (PAGE_HEIGHT + GAP)));
      page.style.minHeight = `${count * (PAGE_HEIGHT + GAP) - GAP}px`;
      setPages(count);
    };

    paginate();
    // Again once the page's own effects (growing text boxes) and fonts have settled.
    const frame = requestAnimationFrame(paginate);
    let active = true;
    void document.fonts.ready.then(() => { if (active) paginate(); });
    // A font (Roboto) can start loading only once the page asks for it: work the breaks out again when it arrives.
    const fontsLoaded = () => { if (active) paginate(); };
    document.fonts.addEventListener('loadingdone', fontsLoaded);
    return () => { active = false; cancelAnimationFrame(frame); document.fonts.removeEventListener('loadingdone', fontsLoaded); };
  }, [watch]);

  return (
    <div className="paged" ref={box}>
      {children}
      {Array.from({ length: pages - 1 }, (_, index) => (
        <div key={index} className="paged-gap" style={{ top: (index + 1) * (PAGE_HEIGHT + GAP) - GAP, height: GAP }}>
          <span>Page {index + 2}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Shows its page larger or smaller without laying it out again: CSS zoom
 * re-wraps text at the new size, a transform only scales the finished page, so
 * every line breaks as it does in the PDF.
 */
export function ScaledPage({ scale, children, onClick, className }: {
  scale: number;
  children: ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 794, height: 1123 });
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={className} style={{ width: size.width * scale, height: size.height * scale, margin: '0 auto' }} onClick={onClick}>
      <div ref={inner} style={{ width: 'max-content', transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}
