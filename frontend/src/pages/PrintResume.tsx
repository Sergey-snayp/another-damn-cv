import { useEffect, useState } from 'react';
import type { RenderedResume } from '../resumeApi';
import { ResumeDocument } from '../resume/ResumeDocument';
import { DEFAULT_THEME, type ResumeTheme } from '../resume/theme';
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
        setView({ resume: body.resume, theme: { ...DEFAULT_THEME, ...(body.theme ?? {}) } });
      })
      .catch((error: unknown) => {
        window.__resumeError = error instanceof Error ? error.message : String(error);
      });
  }, [id, token]);

  useEffect(() => {
    if (!view) return;
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
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
