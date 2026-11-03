import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resumeApi, type RenderedResume } from '../resumeApi';
import { ResumeDocument } from '../resume/ResumeDocument';
import { ImportButton } from '../resume/ImportButton';
import { StylePanel } from '../resume/StylePanel';
import { DEFAULT_THEME, type ResumeTheme } from '../resume/theme';
import '../resume/document.css';

/**
 * Edits live in local state and reach the server only on Save.
 *
 * The server creates a snapshot per save, so persisting on every keystroke
 * would bury the history in versions nobody can navigate.
 */
export function ResumeEditor() {
  const { id = '' } = useParams();

  const [loaded, setLoaded] = useState<RenderedResume | null>(null);
  const [draft, setDraft] = useState<RenderedResume | null>(null);
  const [theme, setTheme] = useState<ResumeTheme>(DEFAULT_THEME);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, [id]);

  // The theme is presentation, not career data — it belongs to this browser.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`resume-theme:${id}`);
      if (stored) setTheme({ ...DEFAULT_THEME, ...JSON.parse(stored) });
    } catch { /* a missing or unreadable theme is not an error */ }
  }, [id]);

  useEffect(() => {
    try { localStorage.setItem(`resume-theme:${id}`, JSON.stringify(theme)); } catch { /* ignore */ }
  }, [id, theme]);

  async function load() {
    try {
      const resume = await resumeApi.read(id);
      setLoaded(resume);

      // A CV imported on the way here arrives as an unsaved draft.
      //
      // Deliberately NOT removed on read: StrictMode runs effects twice in
      // development, and clearing it on the first pass left the second pass
      // with nothing, which silently replaced the import with an empty resume.
      // It is cleared once it has been saved instead.
      const pending = sessionStorage.getItem(`resume-draft:${id}`);

      if (pending) {
        setDraft(JSON.parse(pending) as RenderedResume);
        setMessage('imported from CV');
        setStatus('Filled from your CV. Read it, then save — nothing is stored yet.');
      } else {
        setDraft(structuredClone(resume));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const dirty = Boolean(loaded && draft && JSON.stringify(loaded) !== JSON.stringify(draft));

  function change(mutate: (d: RenderedResume) => void) {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  }

  async function save() {
    if (!draft) return;

    setSaving(true);
    setError(null);

    try {
      const saved = await resumeApi.save(id, draft, message.trim() || undefined);

      // Now that it is on the server, the pending draft has done its job.
      sessionStorage.removeItem(`resume-draft:${id}`);

      setLoaded(saved);
      setDraft(structuredClone(saved));
      setMessage('');
      setStatus(`Saved as version ${saved.snapshot}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !draft) return <><h1>Resume</h1><p className="error">{error}</p></>;
  if (!draft) return <><h1>Resume</h1><p className="muted">Loading…</p></>;

  return (
    <>
      <div className="bar no-print">
        <h1>Resume</h1>
        <div className="who">
          <span className="badge">version {draft.snapshot}</span>
          <Link className="ghost" to={`/documents/${id}/history`}>History</Link>
          <button className="ghost" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>

      {error && <p className="error no-print">{error}</p>}

      {draft.experiences.length === 0 && draft.snapshot === 0 && (
        <section className="card no-print">
          <h2>Start from a CV</h2>
          <p className="muted small">
            Reads a PDF or DOCX and fills the document below. You read it before
            anything is saved.
          </p>
          <ImportButton label="Choose a CV" onDraft={(imported) => {
            setDraft(imported);
            setMessage('imported from CV');
            setStatus('Filled from your CV. Read it, then save.');
          }} />
        </section>
      )}

      <div className="docwrap">
        <div className="page-scroll">
          <ResumeDocument resumeId={id} resume={draft} theme={theme} onChange={change} />
        </div>
        <StylePanel theme={theme} onChange={setTheme} />
      </div>

      <div className="savebar">
        <input
          className="message"
          placeholder={dirty ? 'What changed? (optional)' : 'No changes'}
          value={message}
          disabled={!dirty}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="primary" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? 'Saving…' : dirty ? 'Save as new version' : 'Saved'}
        </button>
        {status && <span className="status">{status}</span>}
      </div>
    </>
  );
}
