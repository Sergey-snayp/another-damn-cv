import { useEffect, useRef, useState, type FormEvent } from 'react';
import { coverLetterApi, type WrittenCoverLetter } from '../coverLetterApi';
import { jobName, jobsApi, type JobSummary } from '../jobsApi';
import { resumeApi, type ResumeSummary } from '../resumeApi';
import { DocumentIcon } from './DocumentIcon';

/** Seconds since the AI started, so a long wait never looks stuck. */
export function useSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!active) return;
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return seconds;
}

export const writingStep = (seconds: number) =>
  seconds < 25 ? 'Reading the job and your CV…' : 'Writing your cover letter…';

/**
 * A new letter: a saved job, the CV it is written from, and what to stress.
 * Writing takes a minute or two; the dialog shows that it is working.
 */
export function NewCoverLetterDialog({ existing, onClose, onWritten }: {
  /** Jobs that already have a letter: writing again replaces it. */
  existing: Set<string>;
  onClose(): void;
  onWritten(letter: WrittenCoverLetter): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [cvs, setCvs] = useState<ResumeSummary[] | null>(null);
  const [jobId, setJobId] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seconds = useSeconds(busy);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    void jobsApi.list().then((list) => { setJobs(list); setJobId((current) => current || list[0]?.id || ''); }, () => setJobs([]));
    void resumeApi.list().then((list) => {
      setCvs(list);
      setResumeId((current) => current || (list.find((cv) => cv.isPrimary) ?? list[0])?.id || '');
    }, () => setCvs([]));
  }, []);

  async function write(event: FormEvent) {
    event.preventDefault();
    if (!jobId || !resumeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      onWritten(await coverLetterApi.generate(jobId, resumeId, request));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the letter.');
      setBusy(false);
    }
  }

  return (
    <dialog className="documents-dialog" ref={dialog} aria-labelledby="new-letter-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form onSubmit={(event) => void write(event)}>
        <div className="documents-dialog-heading">
          <h2 id="new-letter-title">New cover letter</h2>
          <button type="button" className="documents-icon-button" aria-label="Close" onClick={onClose} disabled={busy}>
            <DocumentIcon name="close" />
          </button>
        </div>
        <p>Written by AI from your CV, for one of your saved jobs. You can edit it after.</p>
        <label>
          Job
          <select value={jobId} onChange={(event) => setJobId(event.target.value)} disabled={busy || !jobs?.length} required>
            {jobs === null && <option>Loading…</option>}
            {jobs?.length === 0 && <option value="">No saved jobs yet</option>}
            {jobs?.map((job) => (
              <option key={job.id} value={job.id}>{[job.company, jobName(job)].filter(Boolean).join(' · ')}</option>
            ))}
          </select>
        </label>
        <label>
          Written from
          <select value={resumeId} onChange={(event) => setResumeId(event.target.value)} disabled={busy || !cvs?.length} required>
            {cvs === null && <option>Loading…</option>}
            {cvs?.length === 0 && <option value="">No CVs yet</option>}
            {cvs?.map((cv) => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
          </select>
        </label>
        <label>
          What should it stress? <span>(optional)</span>
          <input maxLength={500} placeholder="e.g. the payments work" value={request}
            onChange={(event) => setRequest(event.target.value)} disabled={busy} />
        </label>
        {jobId && existing.has(jobId) && !busy && <p className="letter-replace-note">This job already has a letter. Writing a new one replaces it.</p>}
        {error && <p className="documents-error" role="alert">{error}</p>}
        <div className="documents-dialog-actions">
          <button type="button" className="documents-control" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`documents-control documents-control-primary${busy ? ' letter-working' : ''}`} disabled={!jobId || !resumeId || busy} aria-busy={busy}>
            {busy ? <><span className="letter-spinner" aria-hidden="true" />{writingStep(seconds)} {seconds}s</> : 'Write letter'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
