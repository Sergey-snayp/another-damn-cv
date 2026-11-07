import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { coverLetterApi, letterTitle, type CoverLetterDetail, type WrittenCoverLetter } from '../coverLetterApi';
import { resumeApi, type ResumeSummary } from '../resumeApi';
import { DocumentIcon } from '../documents/DocumentIcon';
import { LETTER_WIDTH, LetterPage } from '../documents/LetterPage';
import { useSeconds, writingStep } from '../documents/NewCoverLetterDialog';
import '../documents/documents.css';

/**
 * One cover letter: edited on its page as it prints, written again from a
 * CV with a request, opened as PDF or deleted.
 */
export function CoverLetterEditor() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const written = (useLocation().state as { written?: WrittenCoverLetter } | null)?.written;
  const [detail, setDetail] = useState<CoverLetterDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState<string[]>(() => written ? [...written.cannotClaim.map((item) => `Not claimed, not on your CV: ${item}`), ...written.warnings] : []);
  const [cvs, setCvs] = useState<ResumeSummary[]>([]);
  const [resumeId, setResumeId] = useState('');
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState<'save' | 'write' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const seconds = useSeconds(busy === 'write');
  const area = useRef<HTMLTextAreaElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // The page keeps its printed size and is scaled to the column, as the CV editor does.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, Math.max(0.4, (entry.contentRect.width - 8) / LETTER_WIDTH)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    coverLetterApi.detail(jobId).then((found) => {
      if (!active) return;
      setDetail(found);
      setDraft(found.letter?.text ?? '');
      if (found.letter?.resumeId) setResumeId(found.letter.resumeId);
    }, (err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load the letter.'); });
    void resumeApi.list().then((list) => {
      if (!active) return;
      setCvs(list);
      setResumeId((current) => current || (list.find((cv) => cv.isPrimary) ?? list[0])?.id || '');
    }, () => undefined);
    return () => { active = false; };
  }, [jobId]);

  // The text area grows with the letter, so the page reads like the PDF.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, [draft, detail]);

  const letter = detail?.letter ?? null;
  const dirty = Boolean(letter && draft.trim() !== letter.text.trim());

  async function save() {
    if (!dirty || busy) return;
    setBusy('save'); setError(null);
    try {
      const next = await coverLetterApi.update(jobId, draft);
      setDetail((current) => current && { ...current, letter: next });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); }
    finally { setBusy(null); }
  }

  async function write() {
    if (!resumeId || busy) return;
    if (dirty && !window.confirm('Writing a new letter replaces your unsaved edits. Continue?')) return;
    setBusy('write'); setError(null); setNotes([]);
    try {
      const { cannotClaim, warnings, ...next } = await coverLetterApi.generate(jobId, resumeId, request);
      setDetail((current) => current && { ...current, letter: next });
      setDraft(next.text);
      setNotes([...cannotClaim.map((item) => `Not claimed, not on your CV: ${item}`), ...warnings]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not write the letter.'); }
    finally { setBusy(null); }
  }

  async function remove() {
    if (!window.confirm('Delete this cover letter? This cannot be undone.')) return;
    try { await coverLetterApi.remove(jobId); navigate('/documents/cover-letters'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete the letter.'); }
  }

  const title = detail ? letterTitle(detail.job) : 'Cover letter';
  return (
    <section className="letter-editor" aria-label={`Cover letter for ${title}`}
      onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); void save(); } }}>
      <header className="letter-editor-bar">
        <Link to="/documents/cover-letters" className="letter-back"><span aria-hidden="true">←</span> Cover Letters</Link>
        <h1 title={title}>{title}</h1>
        <span className="letter-state" role="status">{busy === 'save' ? 'Saving…' : saved ? 'Saved' : dirty ? 'Unsaved changes' : ''}</span>
        <button type="button" className="documents-control documents-control-primary" disabled={!dirty || busy !== null} onClick={() => void save()}>Save</button>
        {letter && <a className="documents-control" href={coverLetterApi.pdfUrl(jobId)} target="_blank" rel="noreferrer">Open PDF</a>}
      </header>
      {error && <div className="documents-error" role="alert">{error}</div>}
      <div className="letter-editor-body">
        <div ref={canvas} className={`letter-editor-canvas${busy === 'write' ? ' is-writing' : ''}`} style={{ ['--letter-zoom' as string]: scale }}>
          {detail === null && !error ? <p className="letter-empty">Loading…</p>
            : letter ? (
              <LetterPage text={draft} author={detail?.author ?? null}>
                <textarea ref={area} className="letter-text" aria-label="Cover letter text" value={draft} spellCheck
                  onChange={(event) => setDraft(event.target.value)} disabled={busy === 'write'} />
              </LetterPage>
            ) : detail && <p className="letter-empty">This job has no cover letter yet. Write one with the panel on the right.</p>}
        </div>
        <aside className="letter-editor-side">
          <section className="letter-side-card">
            <h2>{letter ? 'Write it again' : 'Write the letter'}</h2>
            <label><span className="letter-label">Written from</span>
              <select value={resumeId} onChange={(event) => setResumeId(event.target.value)} disabled={busy !== null}>
                {cvs.map((cv) => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
              </select>
            </label>
            <label><span className="letter-label">What should it stress? <small>(optional)</small></span>
              <input maxLength={500} placeholder="e.g. shorter, lead with payments" value={request} onChange={(event) => setRequest(event.target.value)} disabled={busy !== null} />
            </label>
            <button type="button" className={`documents-control documents-control-primary letter-write${busy === 'write' ? ' letter-working' : ''}`} disabled={!resumeId || busy !== null} aria-busy={busy === 'write'} onClick={() => void write()}>
              {busy === 'write' ? <><span className="letter-spinner" aria-hidden="true" />{writingStep(seconds)} {seconds}s</> : letter ? '✦ Write again' : '✦ Write letter'}
            </button>
            {notes.length > 0 && <ul className="letter-notes">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
          </section>
          {detail && (
            <section className="letter-side-card">
              <h2>Job</h2>
              <Link to={`/jobs/${encodeURIComponent(jobId)}`}>{title}</Link>
              {letter && <p className="letter-side-file">{letter.fileName}</p>}
              {letter && <button type="button" className="documents-control documents-danger" onClick={() => void remove()}><DocumentIcon name="trash" /> Delete letter</button>}
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
