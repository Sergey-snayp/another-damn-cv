import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { jobName, jobsApi, type JobDetail } from '../jobsApi';
import { resumeApi, type RenderedResume } from '../resumeApi';
import { DiffText } from '../resume/DiffText';
import { ResumeDocument, type RewriteTarget } from '../resume/ResumeDocument';
import { PagedDocument, ScaledPage } from '../resume/PagedDocument';
import { useResumeTheme } from '../resume/useResumeTheme';
import { assistantApi, type ResumeScore } from '../resume/studio/assistantApi';
import { Gauge } from '../resume/studio/AssistantPanel';
import { notifyResumesChanged, useResumeInExtension } from '../extensionBridge';
import '../resume/document.css';
import '../resume/studio/studio.css';

const AUTOSAVE_MS = 1500;
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
 * Quick tailoring: this job's copy of the CV, drawn exactly as its PDF prints
 * (A4 sheets, the same page breaks). Change any line in place, or press ✦
 * beside a line: the AI rewords it for the job and the suggestion opens right
 * under that line. It is kept only when you choose "Use this", and the AI may
 * reword, never add facts. Changes save on their own, as versions in History.
 */
export function QuickTailor({ popup = false }: { popup?: boolean }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const jobId = params.get('job') ?? '';
  const theme = useResumeTheme(id);

  const [loaded, setLoaded] = useState<RenderedResume | null>(null);
  const [draft, setDraft] = useState<RenderedResume | null>(null);
  const [name, setName] = useState('');
  const [job, setJob] = useState<JobDetail | null>(null);
  const [score, setScore] = useState<ResumeScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState<Tailoring | null>(null);
  const [cardTop, setCardTop] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const draftRef = useRef<RenderedResume | null>(null);
  draftRef.current = draft;
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([resumeApi.read(id), resumeApi.list(), jobId ? jobsApi.get(jobId) : Promise.resolve(null)]).then(
      ([resume, list, detail]) => {
        if (!active) return;
        setLoaded(resume);
        setDraft(structuredClone(resume));
        setName(list.find((item) => item.id === id)?.name ?? 'Resume');
        setJob(detail);
      },
      (err: Error) => active && setError(err.message),
    );
    return () => { active = false; };
  }, [id, jobId]);

  // The score for the job, again after each save.
  useEffect(() => {
    if (!jobId || !loaded) return;
    let active = true;
    assistantApi.score(id, { jobId }).then((next) => active && setScore(next), () => active && setScore(null));
    return () => { active = false; };
  }, [id, jobId, loaded?.snapshot]);

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
  const dirty = Boolean(loaded && draft && JSON.stringify(loaded) !== JSON.stringify(draft));

  function change(mutate: (d: RenderedResume) => void) {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      for (const role of next.experiences) {
        role.lineageId ??= newId();
        for (const bullet of role.achievements) { bullet.lineageId ??= newId(); bullet.experienceLineageId = role.lineageId; }
      }
      for (const skill of next.skills) skill.lineageId ??= newId();
      return next;
    });
  }

  async function save() {
    const sent = draftRef.current;
    if (!sent) return;
    setSaving(true);
    try {
      const saved = await resumeApi.save(id, sent, job ? `Quick tailoring for ${jobName(job)}` : 'Quick tailoring');
      setLoaded(saved);
      setDraft((current) => (current === sent ? structuredClone(saved) : current && { ...current, snapshot: saved.snapshot }));
      setSaveError(null);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty || saving || saveError) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty, saving, saveError]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

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
      const response = await fetch(`/api/resumes/${encodeURIComponent(id)}/tailor-line`, {
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

  const status = saving ? 'Saving…' : saveError ? 'Not saved' : dirty ? 'Unsaved changes' : 'All changes saved';
  const matched = score?.keywords?.matched ?? [];
  const missing = score?.keywords?.missing ?? [];
  const skills = new Set(draft.skills.map((skill) => skill.name.toLowerCase()));
  const unchanged = tailoring?.after !== undefined && tailoring.after.trim() === tailoring.target.text.trim();

  return (
    <div className="studio qt">
      <header className="studio-bar">
        {popup ? (
          <nav className="studio-crumb">
            <b>Quick tailoring</b>
            <span className="sep">·</span>
            <span className="qt-name">{name}</span>
          </nav>
        ) : (
          <nav className="studio-crumb">
            <Link to="/documents">Documents</Link>
            <span className="sep">›</span>
            <b className="qt-name">{name}</b>
            <span className="sep">›</span>
            <span>Quick tailoring</span>
          </nav>
        )}
        <span className={`studio-status${saveError ? ' bad' : ''}`} title={saveError ?? undefined}>{status}</span>
        <span className="studio-actions">
          {popup
            ? <a className="ghost" href={`/documents/${id}?job=${encodeURIComponent(jobId)}`} target="_blank" rel="noreferrer">Open full editor</a>
            : <Link className="ghost" to={`/documents/${id}?job=${encodeURIComponent(jobId)}`}>Open full editor</Link>}
          <a className="studio-export" href={`/api/resumes/${id}/pdf?download=1`}
            onClick={(e) => { if (dirty) { e.preventDefault(); const href = e.currentTarget.href; void save().then(() => { window.location.href = href; }); } }}>
            Export PDF
          </a>
          {popup && (
            <button className="primary" title="Close this window" onClick={() => {
              // Saved first, so nothing typed in the last moment is lost.
              void (dirty ? save() : Promise.resolve()).then(() => window.close());
            }}>Done</button>
          )}
        </span>
      </header>
      {saveError && (
        <div className="studio-held bad"><span>{saveError}</span><button className="ghost" onClick={() => { setSaveError(null); void save(); }}>Try again</button></div>
      )}

      <div className="qt-body">
        <main className="qt-canvas" ref={canvas}>
          <p className="qt-hint">
            Your CV for <b>{job ? `${jobName(job)}${job.company ? ` at ${job.company}` : ''}` : 'this job'}</b>, exactly as its PDF prints.
            Click any text to change it, or point at a bullet and press <span className="qt-key">✦</span> to tailor it for the job.
            Your main CV stays as it is.
          </p>
          <ScaledPage className="qt-zoom" scale={scale}>
            <PagedDocument watch={pagedWatch}>
              <ResumeDocument resumeId={id} resume={draft} theme={theme} onChange={change} onTailor={(target, anchor) => void tailor(target, anchor)} />
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
                    <button className="primary" disabled={unchanged} onClick={use}>{unchanged ? 'Already fits' : 'Use this'}</button>
                  )}
                  <button className="ghost" onClick={() => void tailor(tailoring.target, tailoring.anchor)}>Try again</button>
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
                        <button key={kw} className="qt-add-skill"
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
 * Opened by the extension's "Quick tailoring": makes (or reuses) this job's
 * copy of the chosen CV, then opens it in Quick tailoring.
 */
export function QuickTailorStart({ popup = false }: { popup?: boolean }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const from = params.get('from') ?? undefined;
    fetch(`/api/jobs/${encodeURIComponent(id)}/tailor-copy`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(from ? { sourceResumeId: from } : {}),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? `${response.status}`);
        return response.json() as Promise<{ resumeId: string }>;
      })
      .then(
        ({ resumeId }) => {
          // The job's copy is new, and it is the CV for this job: Autofill uploads it.
          notifyResumesChanged(resumeId);
          useResumeInExtension(resumeId);
          navigate(`${popup ? '/popup' : ''}/documents/${resumeId}/quick?job=${encodeURIComponent(id)}`, { replace: true });
        },
        (err: Error) => setError(err.message),
      );
  }, [id]);

  return (
    <div className="studio-message">
      <h1>Quick tailoring</h1>
      {error ? <p className="error">{error}</p> : <p className="muted">Preparing your CV for this job…</p>}
    </div>
  );
}
