import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resumeApi } from '../resumeApi';
import {
  CLOSED, EXTRACTION_LABELS, PIPELINE, SOURCE_LABELS, STATUS_LABELS, jobName, jobsApi,
  type JobStatus, type JobSummary,
} from '../jobsApi';
import { Board } from '../jobs/Board';

type View = 'board' | 'list';
type ListFilter = 'active' | 'closed' | 'dismissed' | 'all';

const LIST_FILTERS: { value: ListFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

function inFilter(status: JobStatus, filter: ListFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return PIPELINE.includes(status);
  if (filter === 'closed') return CLOSED.includes(status);
  return status === 'dismissed';
}

/** While a job is being read in the background, the page checks back this often. */
const POLL_MS = 3000;
const UNDO_MS = 8000;

/** Applied or further along: it went out. */
const SENT: JobStatus[] = ['applied', 'screening', 'interview', 'offer', ...CLOSED];

/** Per-browser preferences. Storage can be unavailable; the page works without it. */
function remembered<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* not kept, that's fine */ }
}

interface Moved { jobId: string; eventId: string; name: string; to: JobStatus }

/**
 * The home page: every job you might apply to, as a board or a list, with the
 * numbers on top.
 *
 * Most jobs arrive from the extension's "Send this job to the app"; "+ Add job"
 * opens a form for postings you only have as text.
 */
export function Dashboard() {
  const navigate = useNavigate();
  const [view, setViewState] = useState<View>(() => remembered('jobs.view', 'board', ['board', 'list']));
  const [showClosed, setShowClosedState] = useState(() => remembered('jobs.closed', 'no', ['yes', 'no']) === 'yes');
  const [filter, setFilter] = useState<ListFilter>('active');
  const [rows, setRows] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<Moved | null>(null);
  const [resumeCount, setResumeCount] = useState<number | undefined>(undefined);
  const [adding, setAdding] = useState(false);

  const setView = (next: View) => { setViewState(next); remember('jobs.view', next); };
  const setShowClosed = (next: boolean) => { setShowClosedState(next); remember('jobs.closed', next ? 'yes' : 'no'); };

  const anyPending = rows?.some((job) => job.extraction === 'pending') ?? false;

  useEffect(() => {
    resumeApi.list().then((list) => setResumeCount(list.length), () => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    jobsApi.list().then((jobs) => {
      if (!cancelled) { setRows(jobs); setError(null); }
    }, (err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Check back while a page is still being read.
  useEffect(() => {
    if (!anyPending) return;
    const timer = setTimeout(() => {
      jobsApi.list().then(setRows, () => undefined);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [anyPending, rows]);

  // The undo offer goes away on its own.
  useEffect(() => {
    if (!moved) return;
    const timer = setTimeout(() => setMoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [moved]);

  function replace(id: string, patch: Partial<JobSummary>) {
    setRows((current) => current?.map((row) => (row.id === id ? { ...row, ...patch } : row)) ?? current);
  }

  /** Shown at once; put back if the server refuses. */
  async function move(row: JobSummary, to: JobStatus) {
    setError(null);
    replace(row.id, { status: to, updatedAt: new Date().toISOString() });
    try {
      const saved = await jobsApi.update(row.id, { status: to });
      replace(row.id, { status: saved.status, updatedAt: saved.updatedAt });
      const event = saved.history[0];
      if (event && event.to === to) setMoved({ jobId: row.id, eventId: event.id, name: jobName(row), to });
    } catch (err) {
      replace(row.id, { status: row.status, updatedAt: row.updatedAt });
      setError(`Could not move "${jobName(row)}": ${(err as Error).message}`);
    }
  }

  async function undo() {
    if (!moved) return;
    const { jobId, eventId } = moved;
    setMoved(null);
    try {
      const saved = await jobsApi.undoStatus(jobId, eventId);
      replace(jobId, { status: saved.status, updatedAt: saved.updatedAt });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const columns = showClosed ? [...PIPELINE, ...CLOSED] : PIPELINE;
  const dismissed = rows?.filter((row) => row.status === 'dismissed').length ?? 0;
  const closedCount = rows?.filter((row) => CLOSED.includes(row.status)).length ?? 0;
  const listed = rows?.filter((row) => inFilter(row.status, filter)) ?? [];

  return (
    <div className={view === 'board' ? 'jobs-page wide' : 'jobs-page'}>
      <div className="jobs-head">
        <h1>Dashboard</h1>
        <div className="jobs-actions">
          <div className="filters" role="tablist" aria-label="View">
            <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button>
            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
          </div>
          <button className="primary" onClick={() => setAdding(true)}>+ Add job</button>
        </div>
      </div>

      <section className="grid stats-row">
        <Stat label="Active jobs" value={rows?.filter((j) => PIPELINE.includes(j.status)).length} />
        <Stat label="Applied" value={rows?.filter((j) => SENT.includes(j.status)).length} />
        <Stat label="Interviewing" value={rows?.filter((j) => j.status === 'interview').length} />
        <Stat label="Offers" value={rows?.filter((j) => j.status === 'offer' || j.status === 'accepted').length} />
        <Stat label="Resumes" value={resumeCount} link="/resumes" />
      </section>

      <p className="muted small">
        On any job page, press <b>Send this job to the app</b> in the extension&rsquo;s side panel.
        {view === 'board' && ' Drag a card to move it, or use its Move menu.'}
      </p>

      {error && <p className="error">{error}</p>}

      {view === 'board' && rows && (
        <>
          <div className="board-options muted small">
            <label>
              <input type="checkbox" checked={showClosed} onChange={() => setShowClosed(!showClosed)} />
              Show closed{closedCount > 0 ? ` (${closedCount})` : ''}
            </label>
            {dismissed > 0 && (
              <button className="linklike" onClick={() => { setView('list'); setFilter('dismissed'); }}>
                {dismissed} dismissed
              </button>
            )}
          </div>
          {rows.length === 0
            ? <GettingStarted />
            : <Board rows={rows} columns={columns} onMove={(row, to) => void move(row, to)} />}
        </>
      )}

      {view === 'list' && (
        <section className="card">
          <div className="filters" role="tablist">
            {LIST_FILTERS.map((item) => (
              <button
                key={item.value}
                role="tab"
                aria-selected={filter === item.value}
                className={filter === item.value ? 'on' : ''}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {rows && listed.length === 0 && (
            <p className="empty">
              {filter === 'active' || filter === 'all'
                ? 'No jobs yet. Open a posting and send it from the extension, or press + Add job to paste one.'
                : `No ${filter} jobs.`}
            </p>
          )}

          {listed.length > 0 && (
            <ul className="resumes jobs">
              {listed.map((job) => (
                <li key={job.id}>
                  <Link to={`/jobs/${job.id}`}>
                    <div>
                      <div className="role">
                        {jobName(job)}
                        {job.extraction === 'pending' && <span className="badge interviewing">reading…</span>}
                        {job.extraction === 'failed' && <span className="badge rejected">check details</span>}
                        <span className={`badge ${job.status}`}>{STATUS_LABELS[job.status]}</span>
                      </div>
                      <div className="muted tiny">
                        {[job.company, job.location, job.remote ? 'Remote' : null].filter(Boolean).join(' · ') || 'Company not read yet'}
                      </div>
                      <div className="muted tiny">
                        {SOURCE_LABELS[job.source]} · {new Date(job.capturedAt).toLocaleDateString('en-CA')}
                        {job.extraction !== 'pending' && job.extraction !== 'failed' && ` · ${EXTRACTION_LABELS[job.extraction]}`}
                      </div>
                    </div>
                    <span className="chev">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <AddJobDialog open={adding} onClose={() => setAdding(false)} onCreated={(id) => navigate(`/jobs/${id}`)} />

      {moved && (
        <div className="toast" role="status">
          <span>Moved <b>{moved.name}</b> to {STATUS_LABELS[moved.to]}.</span>
          <button onClick={() => void undo()}>Undo</button>
        </div>
      )}
    </div>
  );
}

/**
 * A posting you only have as text, in a pop-up. A native <dialog>: Esc,
 * focus and the backdrop come with it.
 */
function AddJobDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const job = await jobsApi.create({
        description,
        title: title.trim() || undefined,
        company: company.trim() || undefined,
        url: url.trim() || undefined,
      });
      onCreated(job.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="add-job-title"
      onClose={onClose}
      // Not while saving: the job would still be created, behind your back.
      onCancel={(e) => { if (busy) e.preventDefault(); }}
      // The content sits in an inner box, so a click on the dialog itself is the backdrop.
      onClick={(e) => { if (e.target === e.currentTarget && !busy) dialogRef.current?.close(); }}
    >
      <div className="modal-body">
        <h2 id="add-job-title">Add a job</h2>
        <p className="muted small">
          For a posting you only have as text. Leave title or company empty and they are read from the description.
        </p>

        <div className="fieldgrid">
          <label className="field half">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field half">
            <span>Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Link (optional)</span>
          <input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="field">
          <span>Job description</span>
          <textarea
            rows={8}
            value={description}
            placeholder="Paste the posting here…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="ghost" disabled={busy} onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button className="primary" disabled={busy || !description.trim()} onClick={() => void add()}>
            {busy ? 'Saving…' : 'Save job'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function Stat({ label, value, link }: { label: string; value?: number; link?: string }) {
  const body = (
    <>
      <div className="value">{value ?? '—'}</div>
      <div className="label">{label}</div>
    </>
  );
  return link ? <Link to={link} className="stat">{body}</Link> : <div className="stat">{body}</div>;
}

/** Shown until the first job arrives. */
function GettingStarted() {
  return (
    <section className="card">
      <h2>What to do next</h2>
      <ul className="next">
        <li><Link to="/resumes">Start from a CV</Link> — fills a resume in one go</li>
        <li>Open a job posting and press <b>Send this job to the app</b> in the extension — or press <b>+ Add job</b> to paste one</li>
        <li>Tailor your resume from the job&rsquo;s page, then move the job along the board as you apply</li>
      </ul>
    </section>
  );
}
