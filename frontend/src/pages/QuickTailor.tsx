import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { jobName, jobsApi, type JobDetail } from '../jobsApi';
import { resumeApi, type QuickTailoringDraft, type RenderedResume } from '../resumeApi';
import { DiffText } from '../resume/DiffText';
import { ResumeDocument, type RewriteTarget } from '../resume/ResumeDocument';
import { PagedDocument, ScaledPage } from '../resume/PagedDocument';
import { designOf } from '../resume/theme';
import { DraftHistory } from '../resume/draftHistory';
import { assistantApi, type ResumeScore } from '../resume/studio/assistantApi';
import { Gauge } from '../resume/studio/AssistantPanel';
import { notifyResumesChanged, useResumeInExtension } from '../extensionBridge';
import '../resume/document.css';
import '../resume/studio/studio.css';

const PAGE_WIDTH = 794;
const newId = () => crypto.randomUUID();

/** Marks the job's keywords in its description: found on the CV, or not yet. */
function highlight(text: string, matched: string[], missing: string[]): ReactNode {
  const names = [...matched, ...missing].sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const have = new Set(matched.map((name) => name.toLowerCase()));
  return text.split(pattern).map((piece, index) =>
    index % 2 === 1
      ? <mark key={index} className={have.has(piece.toLowerCase()) ? 'have' : 'miss'}>{piece}</mark>
      : piece);
}

/** The line being tailored, the suggestion for it, and where on the page it sits. */
interface Tailoring {
  target: RewriteTarget;
  anchor: HTMLElement;
  busy: boolean;
  after?: string;
  cannotDo?: string[];
  error?: string;
}

/**
 * Quick tailoring: an unsaved draft for the job, drawn exactly as its PDF prints
 * (A4 sheets, the same page breaks). Change any line in place, or press ✦
 * beside a line: the AI rewords it for the job and the suggestion opens right
 * under that line. It is kept only when you choose "Use this", and the AI may
 * reword, never add facts. Save stores the edited CV first, then makes its PDF.
 */
export function QuickTailor({ popup = false, jobRoute = false }: { popup?: boolean; jobRoute?: boolean }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const jobId = jobRoute ? id : params.get('job') ?? '';
  const sourceId = jobRoute ? params.get('from') ?? undefined : id;
  const [workspace, setWorkspace] = useState<QuickTailoringDraft | null>(null);
  const resumeId = workspace?.resumeId ?? null;
  const contextId = resumeId ?? workspace?.sourceResumeId ?? '';
  const theme = useMemo(() => designOf(workspace?.theme), [workspace?.theme]);

  const [loaded, setLoaded] = useState<RenderedResume | null>(null);
  const [draft, setDraft] = useState<RenderedResume | null>(null);
  const history = useRef(new DraftHistory()).current;
  const [savedStep, setSavedStep] = useState<number | null>(null);
  const [pendingEdit, setPendingEdit] = useState(false);
  const [name, setName] = useState('');
  const [job, setJob] = useState<JobDetail | null>(null);
  const [score, setScore] = useState<ResumeScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [pdfSnapshot, setPdfSnapshot] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState<Tailoring | null>(null);
  const [cardTop, setCardTop] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    if (!jobId) return;
    Promise.all([resumeApi.previewQuick(jobId, sourceId), jobsApi.get(jobId)]).then(
      ([prepared, detail]) => {
        if (!active) return;
        setWorkspace(prepared);
        setLoaded(prepared.document);
        const initial = history.reset(prepared.document);
        setDraft(initial.document);
        setSavedStep(initial.id);
        setPendingEdit(false);
        setTailoring(null);
        setName(prepared.name);
        setPdfSnapshot(null);
        setJob(detail);
      },
      (err: Error) => active && setError(err.message),
    );
    return () => { active = false; };
  }, [jobId, sourceId, history]);

  // The score for the job, again after each save.
  useEffect(() => {
    if (!jobId || !loaded || !contextId) return;
    let active = true;
    assistantApi.score(contextId, { jobId }).then((next) => active && setScore(next), () => active && setScore(null));
    return () => { active = false; };
  }, [contextId, jobId, loaded?.snapshot]);

  // The page is as wide as the column allows, up to its real size.
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCanvasWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [draft !== null]);
  const scale = canvasWidth ? Math.min(1, Math.max(0.5, (canvasWidth - 48) / PAGE_WIDTH)) : 1;

  const pagedWatch = useMemo(() => [draft, theme], [draft, theme]);
  const dirty = Boolean(draft && history.current?.id !== savedStep);

  function change(mutate: (d: RenderedResume) => void) {
    if (savingRef.current) return;
    const next = history.change(mutate);
    setPendingEdit(false);
    if (!next) return;
    setTailoring(null);
    setDraft(next.document);
  }

  const moveHistory = useCallback((direction: -1 | 1) => {
    if (savingRef.current) return;
    const next = history.move(direction);
    if (!next) return;
    setTailoring(null);
    setPendingEdit(false);
    setDraft(next.document);
  }, [history]);

  function resetChanges() {
    if (savingRef.current) return;
    const initial = history.restoreInitial();
    setTailoring(null);
    setPendingEdit(false);
    setSaveError(null);
    if (initial) setDraft(initial.document);
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
      // Text fields keep the browser's normal undo while a line is being typed.
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
      event.preventDefault();
      moveHistory(key === 'y' || event.shiftKey ? 1 : -1);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [moveHistory]);

  async function save() {
    const sent = history.current?.document;
    if (!sent || !workspace || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setPdfSnapshot(null);
    let cvSaved = false;
    try {
      const saved = await resumeApi.saveQuick(jobId, sent, {
        resumeId: workspace.resumeId, sourceResumeId: workspace.sourceResumeId, theme,
      }, job ? `Quick tailoring for ${jobName(job)}` : 'Quick tailoring');
      if (!saved.resumeId) throw new Error('The CV could not be created.');
      setWorkspace(saved);
      setName(saved.name);
      setLoaded(saved.document);
      const savedEdit = history.acceptSaved(sent, saved.document, !workspace.resumeId);
      if (savedEdit) { setDraft(savedEdit.document); setSavedStep(savedEdit.id); }
      cvSaved = true;
      setCreatingPdf(true);
      await resumeApi.createPdf(saved.resumeId);
      setPdfSnapshot(saved.document.snapshot);
      notifyResumesChanged(saved.resumeId);
      useResumeInExtension(saved.resumeId);
      return true;
    } catch (err) {
      setSaveError(`${cvSaved ? 'CV saved, but the PDF could not be created: ' : 'CV could not be saved: '}${(err as Error).message}`);
      return false;
    } finally {
      savingRef.current = false;
      setCreatingPdf(false);
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty && !pendingEdit && !saving) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pendingEdit, saving]);

  // The suggestion card sits right under its line, wherever the page has moved it.
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!tailoring || !el) return;
    const place = () => {
      const line = tailoring.anchor.getBoundingClientRect();
      setCardTop(line.bottom - el.getBoundingClientRect().top + el.scrollTop + 6);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(tailoring.anchor);
    return () => observer.disconnect();
  }, [tailoring, draft, scale]);

  async function tailor(target: RewriteTarget, anchor: HTMLElement) {
    if (!target.text.trim() || !jobId) return;
    setTailoring({ target, anchor, busy: true });
    try {
      const response = await fetch(`/api/resumes/${encodeURIComponent(contextId)}/tailor-line`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: target.text,
          kind: target.kind,
          ...(target.context ? { context: target.context.slice(0, 1_000) } : {}),
          job: { jobId },
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? `${response.status}`);
      const result = (await response.json()) as { suggestion: string; cannotDo: string[] };
      setTailoring((current) => current && current.target === target
        ? { ...current, busy: false, after: result.suggestion, cannotDo: result.cannotDo } : current);
    } catch (err) {
      setTailoring((current) => current && current.target === target ? { ...current, busy: false, error: (err as Error).message } : current);
    }
  }

  function use() {
    if (!tailoring?.after) return;
    const { target, after } = tailoring;
    change((d) => target.apply(after, d));
    setTailoring(null);
  }

  if (!jobId) return <div className="studio-message"><h1>Quick tailoring</h1><p className="error">Open this page from a job: the job is missing.</p></div>;
  if (error) return <div className="studio-message"><h1>Quick tailoring</h1><p className="error">{error}</p></div>;
  if (!draft) return <div className="studio-message"><h1>Quick tailoring</h1><p className="muted">Loading…</p></div>;

  const pdfReady = !dirty && !pendingEdit && pdfSnapshot === draft.snapshot;
  const status = saving ? creatingPdf ? 'Creating PDF…' : 'Saving CV…'
    : saveError ? 'Save failed' : !resumeId ? 'Unsaved CV draft' : dirty || pendingEdit ? 'Unsaved changes' : pdfReady ? 'CV and PDF saved' : 'Click Save to create the PDF';
  const matched = score?.keywords?.matched ?? [];
  const missing = score?.keywords?.missing ?? [];
  const skills = new Set(draft.skills.map((skill) => skill.name.toLowerCase()));
  const unchanged = tailoring?.after !== undefined && tailoring.after.trim() === tailoring.target.text.trim();

  return (
    <div className="studio qt"
      onInputCapture={(event) => { if (event.target instanceof HTMLElement && event.target.isContentEditable) setPendingEdit(true); }}
      onBlurCapture={() => setPendingEdit(false)}>
      <header className="studio-bar">
        {popup ? (
          <nav className="studio-crumb">
            <b>Quick tailoring</b>
            <span className="sep">·</span>
            <span className="qt-name">{name}</span>
          </nav>
        ) : (
          <nav className="studio-crumb">
            <Link to="/documents" onClick={(event) => { if (dirty && !confirm('Discard your unsaved changes?')) event.preventDefault(); }}>Documents</Link>
            <span className="sep">›</span>
            <b className="qt-name">{name}</b>
            <span className="sep">›</span>
            <span>Quick tailoring</span>
          </nav>
        )}
        <span className={`studio-status${saveError ? ' bad' : ''}`} title={saveError ?? undefined}>{status}</span>
        <span className="studio-actions">
          <span className="qt-history" role="group" aria-label="Change history">
            <button type="button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" aria-keyshortcuts="Control+Z Meta+Z"
              disabled={saving || (!history.canUndo && !pendingEdit)} onClick={() => moveHistory(-1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 4-5 5 5 5M4 9h9a7 7 0 0 1 7 7" /></svg>Undo
            </button>
            <button type="button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z or Ctrl Y)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
              disabled={saving || pendingEdit || !history.canRedo} onClick={() => moveHistory(1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5-5 5M20 9h-9a7 7 0 0 0-7 7" /></svg>Redo
            </button>
            <button type="button" aria-label="Reset changes" title="Reset all edits from this tailoring session"
              disabled={saving || (!history.canReset && !pendingEdit)} onClick={resetChanges}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /></svg>Reset
            </button>
          </span>
          {!resumeId
            ? <button className="ghost" disabled title="Save this CV before opening the full editor.">Open full editor</button>
            : popup
              ? <a className="ghost" href={`/documents/${resumeId}?job=${encodeURIComponent(jobId)}`} target="_blank" rel="noreferrer">Open full editor</a>
              : <Link className="ghost" to={`/documents/${resumeId}?job=${encodeURIComponent(jobId)}`}
                  onClick={(event) => { if (dirty && !confirm('Discard your unsaved changes?')) event.preventDefault(); }}>Open full editor</Link>}
          <button className="primary" disabled={saving} onClick={() => void save()}>
            {saving ? creatingPdf ? 'Creating PDF…' : 'Saving…' : 'Save'}
          </button>
          {pdfReady && !saving
            ? <a className="ghost" href={`/api/resumes/${resumeId}/pdf?download=1`}>Export PDF</a>
            : <button className="ghost" disabled title="Click Save to create the PDF first.">Export PDF</button>}
          {popup && (
            <button className="ghost" disabled={saving} title="Close this window" onClick={() => window.close()}>Close</button>
          )}
        </span>
      </header>
      {saveError && (
        <div className="studio-held bad"><span>{saveError}</span><button className="ghost" disabled={saving} onClick={() => void save()}>Try again</button></div>
      )}

      <div className="qt-body">
        <main className="qt-canvas" ref={canvas}>
          <ScaledPage className="qt-zoom" scale={scale}>
            <PagedDocument watch={pagedWatch}>
              <ResumeDocument resumeId={contextId} resume={draft} theme={theme} readOnly={saving} onChange={change} onTailor={(target, anchor) => void tailor(target, anchor)} />
            </PagedDocument>
          </ScaledPage>

          {tailoring && (
            <div className="qt-card" style={{ top: cardTop }}>
              <div className="qt-card-head">
                <b>✦ Tailored for {job ? jobName(job) : 'the job'}</b>
                <button className="qt-close" title="Close" onClick={() => setTailoring(null)}>×</button>
              </div>
              {tailoring.busy && <p className="ra-muted">Rewording this line for the job…</p>}
              {tailoring.error && <p className="ra-error">{tailoring.error}</p>}
              {tailoring.after !== undefined && (
                <>
                  <p className="qt-diff"><DiffText before={tailoring.target.text} after={tailoring.after} /></p>
                  {tailoring.cannotDo?.map((note, index) => <p key={index} className="qt-note">⚠ {note}</p>)}
                </>
              )}
              {!tailoring.busy && (
                <div className="ra-row">
                  {tailoring.after !== undefined && (
                    <button className="primary" disabled={unchanged || saving} onClick={use}>{unchanged ? 'Already fits' : 'Use this'}</button>
                  )}
                  <button className="ghost" disabled={saving} onClick={() => void tailor(tailoring.target, tailoring.anchor)}>Try again</button>
                  <button className="ghost" onClick={() => setTailoring(null)}>Dismiss</button>
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="qt-job">
          <section className="ra-card">
            <h3>Resume Score</h3>
            {score?.score !== null && score?.score !== undefined ? (
              <>
                <div className="ra-score"><Gauge score={score.score} /></div>
                <p className="ra-muted center">Mentions {matched.length} of {matched.length + missing.length} keywords from the job</p>
                <div className="ra-keywords">
                  {matched.map((kw) => <span key={kw} className="ra-kw have">✓ {kw}</span>)}
                  {missing.map((kw) => <span key={kw} className="ra-kw miss">{kw}</span>)}
                </div>
                {missing.some((kw) => !skills.has(kw.toLowerCase())) && (
                  <div className="qt-missing">
                    <p className="ra-muted">Add to Skills only the ones you have used:</p>
                    <div className="sf-chips">
                      {missing.filter((kw) => !skills.has(kw.toLowerCase())).map((kw) => (
                        <button key={kw} className="qt-add-skill" disabled={saving}
                          onClick={() => change((d) => { d.skills.push({ lineageId: newId(), name: kw, category: '' }); })}>
                          + {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : <p className="ra-muted">{score ? 'This job names none of the skills we look for.' : 'Scoring…'}</p>}
          </section>
          <section className="ra-card">
            <h3>{job ? jobName(job) : 'The job'}</h3>
            {job?.company && <p className="ra-muted">{job.company}</p>}
            <div className="qt-description">
              {job?.description ? highlight(job.description, matched, missing) : <span className="ra-muted">This job has no description yet.</span>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * Opened by the extension's Quick Tailor button. Preview is read-only on the
 * backend: the document, its first version and its PDF wait for Save.
 */
export function QuickTailorStart({ popup = false }: { popup?: boolean }) {
  return <QuickTailor popup={popup} jobRoute />;
}
