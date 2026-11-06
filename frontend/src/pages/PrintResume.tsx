import { useEffect, useState } from 'react';
import type { RenderedResume } from '../resumeApi';
import { ResumeDocument } from '../resume/ResumeDocument';
import { designOf, type ResumeTheme } from '../resume/theme';
import '../resume/document.css';

declare global {
  interface Window {
    /** Set when the CV and its fonts are drawn: the server's Chrome prints the page then. */
    __resumeReady?: boolean;
    __resumeError?: string;
  }
}

/**
 * The CV alone, for the server's own Chrome to print to the PDF the extension
 * uploads. Opened only with a short-lived signed link from the server, so it
 * needs no sign-in. The same document and print style as the editor's Print / PDF.
 */
export function PrintResume() {
  const id = decodeURIComponent(window.location.pathname.split('/')[3] ?? '');
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [view, setView] = useState<{ resume: RenderedResume; theme: ResumeTheme } | null>(null);

  useEffect(() => {
    fetch(`/api/print/resumes/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`The print link did not work (${response.status}).`);
        const body = (await response.json()) as { resume: RenderedResume; theme: Partial<ResumeTheme> | null };
        setView({ resume: body.resume, theme: designOf(body.theme) });
      })
      .catch((error: unknown) => {
        window.__resumeError = error instanceof Error ? error.message : String(error);
      });
  }, [id, token]);

  useEffect(() => {
    if (!view) return;
    // The design's font in regular, bold and italic, loaded before the PDF is printed.
    const font = `${view.theme.fontSize}pt ${view.theme.fontFamily}`;
    void Promise.all([font, `bold ${font}`, `italic ${font}`, `italic bold ${font}`].map((spec) => document.fonts.load(spec).catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => requestAnimationFrame(() => {
        window.__resumeReady = true;
      }));
  }, [view]);

  if (!view) return null;
  return (
    <div className="docwrap print-resume">
      <div className="page-scroll">
        <ResumeDocument resume={view.resume} theme={view.theme} readOnly onChange={() => undefined} />
      </div>
    </div>
  );
}
