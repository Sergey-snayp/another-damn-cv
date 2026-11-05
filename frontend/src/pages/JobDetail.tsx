import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ALL_STATUSES, EXTRACTION_LABELS, SOURCE_LABELS, STATUS_LABELS, jobName, jobsApi,
  type Job, type JobDetail as JobWithHistory, type JobEdit, type JobStatus,
} from '../jobsApi';
import { resumeApi, type ResumeSummary } from '../resumeApi';
import { ApplicationResume } from '../jobs/ApplicationResume';
import { CompanyAvatar } from '../jobs/ApplicationCard';
import { InterviewDateEditor } from '../interviews/InterviewDateEditor';

type Draft = {
  title: string; company: string; location: string;
  employmentType: string; salary: string; description: string; notes: string;
  remote: '' | 'yes' | 'no';
};

const TEXT_FIELDS = ['title', 'company', 'location', 'employmentType', 'salary', 'description', 'notes'] as const;

function toDraft(job: Job): Draft {
  return {
    title: job.title ?? '',
    company: job.company ?? '',
    location: job.location ?? '',
    employmentType: job.employmentType ?? '',
    salary: job.salary ?? '',
    description: job.description ?? '',
    notes: job.notes ?? '',
    remote: job.remote === null ? '' : job.remote ? 'yes' : 'no',
  };
}

/** Only what changed, so untouched fields stay free for a later re-capture to refresh. */
function changes(job: Job, draft: Draft): JobEdit {
  const original = toDraft(job);
  const edit: JobEdit = {};
  for (const key of TEXT_FIELDS) {
    if (draft[key] !== original[key]) edit[key] = draft[key].trim() || null;
  }
  if (draft.remote !== original.remote) edit.remote = draft.remote === '' ? null : draft.remote === 'yes';
  return edit;
}

const POLL_MS = 3000;

export function JobDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobWithHistory | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function show(next: JobWithHistory) {
    setJob(next);
    setDraft(toDraft(next));
  }

  useEffect(() => {
    jobsApi.get(id).then(show, (err: Error) => setError(err.message));
  }, [id]);

  // While the page is being read, check back — but never overwrite what you are typing.
  const pending = job?.extraction === 'pending';
  const dirty = job && draft ? Object.keys(changes(job, draft)).length > 0 : false;

  useEffect(() => {
    if (!pending || dirty) return;
    const timer = setTimeout(() => { jobsApi.get(id).then(show, () => undefined); }, POLL_MS);
    return () => clearTimeout(timer);
  }, [id, pending, dirty, job]);

  async function run(action: () => Promise<JobWithHistory | void>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await action();
      if (next) show(next);
      if (done) setNotice(done);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !job) return <><h1>Job</h1><p className="error">{error}</p><Link to="/dashboard">← Dashboard</Link></>;
  if (!job || !draft) return <p className="muted">Loading…</p>;

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft({ ...draft, [key]: event.target.value });

  const setStatus = (status: JobStatus) =>
    run(() => jobsApi.update(job.id, { status }));

  return (
    <>
      <p className="crumb"><Link to="/dashboard">← Dashboard</Link></p>
      <h1 className="job-title-with-logo"><CompanyAvatar company={job.company} logo={job.companyLogo} />{jobName(job)}</h1>

      <p className="muted small job-meta">
        <span className={`badge ${job.status}`}>{STATUS_LABELS[job.status]}</span>
        {' '}{SOURCE_LABELS[job.source]} · saved {new Date(job.capturedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
        {' · '}{EXTRACTION_LABELS[job.extraction]}
        {job.url && <> · <a href={job.url} target="_blank" rel="noreferrer">open original</a></>}
      </p>

      {pending && (
        <p className="notice-line">Reading the page. Title, company and the clean description will fill in shortly.</p>
      )}
      {job.extraction === 'failed' && job.extractionError && (
        <p className="error">{job.extractionError} Fill in the details below, or read the page again.</p>
      )}
      {error && <p className="error">{error}</p>}

      <section className="card job-status">
        <h2>Status</h2>
        <label className="field half">
          <span>Where this job stands</span>
          <select value={job.status} disabled={busy} onChange={(e) => void setStatus(e.target.value as JobStatus)}>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>

        {job.history.length > 0 && (
          <ol className="timeline">
            {job.history.map((event) => (
              <li key={event.id}>
                <span>{STATUS_LABELS[event.from]} → <b>{STATUS_LABELS[event.to]}</b></span>
                <span className="muted tiny">
                  {new Date(event.at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
            <li>
              <span>Saved</span>
              <span className="muted tiny">{new Date(job.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
            </li>
          </ol>
        )}
      </section>

      <ApplicationResume job={job} onChanged={(next) => setJob((current) => current ? { ...current, ...next } : current)} />

      {job.applicationAnswers?.length ? (
        <section className="card application-answers" style={{ marginTop: 16 }}>
          <h2>Your answers</h2>
          <p className="muted small">What you answered on the application form, recorded by the extension.</p>
          <dl>
            {job.applicationAnswers.map((item) => (
              <div key={item.question}>
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <InterviewDateEditor job={job} onSaved={(next) => setJob((current) => current ? { ...current, ...next } : current)} />
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Details {job.editedFields.length > 0 && <span className="muted">edited: {job.editedFields.join(', ')}</span>}</h2>

        <div className="fieldgrid">
          <label className="field half"><span>Title</span><input value={draft.title} onChange={set('title')} /></label>
          <label className="field half"><span>Company</span><input value={draft.company} onChange={set('company')} /></label>
          <label className="field half"><span>Location</span><input value={draft.location} onChange={set('location')} /></label>
          <label className="field half">
            <span>Remote</span>
            <select value={draft.remote} onChange={set('remote')}>
              <option value="">Not stated</option>
              <option value="yes">Remote</option>
              <option value="no">Not remote</option>
            </select>
          </label>
          <label className="field half"><span>Employment type</span><input value={draft.employmentType} onChange={set('employmentType')} /></label>
          <label className="field half"><span>Salary</span><input value={draft.salary} onChange={set('salary')} /></label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea rows={18} value={draft.description} onChange={set('description')} />
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea rows={4} value={draft.notes} onChange={set('notes')} placeholder="Your own notes on this job" />
        </label>

        {job.postedAt && <p className="muted tiny">Posted {new Date(job.postedAt).toLocaleDateString('en-CA')}</p>}

        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="primary"
            disabled={busy || !dirty}
            onClick={() => void run(() => jobsApi.update(job.id, changes(job, draft)), 'Saved.')}
          >
            Save changes
          </button>
          {dirty && <button className="ghost" onClick={() => setDraft(toDraft(job))}>Discard</button>}
          {notice && <span className="status" style={{ margin: 0 }}>{notice}</span>}
        </div>
      </section>

      <TailorCard job={job} />

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Captured page</h2>
        <p className="muted small">
          Reading again uses the page as it was captured, and replaces your edits.
          To pick up changes to the posting itself, send it from the extension again.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            className="ghost"
            disabled={busy || pending}
            onClick={() => {
              if (job.editedFields.length === 0 || confirm('Read the page again? Your edits will be replaced.')) {
                void run(() => jobsApi.reread(job.id));
              }
            }}
          >
            Read again
          </button>
          <button
            className="remove"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete "${jobName(job)}"? This cannot be undone.`)) {
                void run(async () => { await jobsApi.remove(job.id); navigate('/dashboard'); });
              }
            }}
          >
            Delete
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * "Tailor resume for this job": copies a resume for this job and asks the AI
 * for a version of the summary and bullets that fits it. The suggestions open
 * for review; nothing is saved until you accept them.
 */
function TailorCard({ job }: { job: Job }) {
  const navigate = useNavigate();
  // The extension's "Improve my match" links here with ?tailorFrom=<resume id>.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tailorFrom');
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [source, setSource] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resumeApi.list().then((rows) => {
      setResumes(rows);
      const own = rows.filter((r) => !r.jobId);
      const main = own.find((r) => r.id === requested) ?? own.find((r) => r.isPrimary) ?? own.find((r) => r.currentSnapshotId) ?? own[0];
      setSource(main?.id ?? '');
    }, (err: Error) => setError(err.message));
  }, [requested]);

  const copy = resumes?.find((r) => r.jobId === job.id);
  const sources = resumes?.filter((r) => !r.jobId) ?? [];
  const blockedBy = job.extraction === 'pending'
    ? 'Wait until the job page has been read.'
    : !job.description?.trim()
      ? 'Add a description above first.'
      : !copy && sources.length === 0
        ? 'Make a resume first.'
        : null;

  async function tailor() {
    setRunning(true);
    setError(null);
    try {
      const { resumeId } = await jobsApi.tailor(job.id, copy ? undefined : source || undefined);
      navigate(`/documents/${resumeId}/tailor`);
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Tailored resume</h2>

      {copy ? (
        <p className="muted small">
          <Link to={`/documents/${copy.id}`}>{copy.name}</Link> is your copy for this job.
          {copy.hasTailoring && <> Suggestions are waiting: <Link to={`/documents/${copy.id}/tailor`}>review them</Link>.</>}
        </p>
      ) : (
        <p className="muted small">
          Makes a copy of your resume for this job and suggests a new summary and bullets in
          the posting&rsquo;s words. Only facts already in your resume are used, and you approve every line.
        </p>
      )}

      {!copy && sources.length > 1 && (
        <label className="field">
          <span>Start from</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} disabled={running}>
            {sources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.isPrimary ? ' (main)' : ''}{r.currentSnapshotId ? '' : ' (empty)'}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="error small">{error}</p>}
      {blockedBy && <p className="muted tiny">{blockedBy}</p>}

      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="primary" disabled={running || !resumes || Boolean(blockedBy)} onClick={() => void tailor()}>
          {running ? 'Tailoring…' : copy ? 'Tailor again' : 'Tailor resume for this job'}
        </button>
        {running && <span className="muted small">Reading your resume against the posting. This usually takes 1–3 minutes.</span>}
      </div>
    </section>
  );
}
