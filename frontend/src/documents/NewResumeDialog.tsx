import { useEffect, useRef, useState } from 'react';
import type { ResumeSummary } from '../resumeApi';
import { DashboardIcon as Icon } from '../jobs/DashboardIcon';

type Busy = 'profile' | `copy:${string}` | null;

/**
 * "How would you like to create this resume?": from the Profile, by uploading
 * a file, or as a copy of a resume the person already has (searched by name,
 * each one viewable before choosing).
 */
export function NewResumeDialog({
  resumes,
  onProfile,
  onUpload,
  onCopy,
  onClose,
}: {
  /** The person's resumes, newest first; null while they load. */
  resumes: ResumeSummary[] | null;
  /** Creates it from the Profile and opens it; rejects with a message. */
  onProfile(): Promise<void>;
  /** Opens the file picker (the upload goes on as before). */
  onUpload(): void;
  /** Creates a copy of this resume and opens it; rejects with a message. */
  onCopy(resume: ResumeSummary): Promise<void>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function run(key: Exclude<Busy, null>, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the resume. Try again.');
      setBusy(null);
    }
  }

  const sorted = [...(resumes ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const shown = sorted.filter((resume) => resume.name.toLowerCase().includes(query.trim().toLowerCase()));
  const modified = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <dialog
      className="documents-dialog new-resume"
      ref={dialog}
      aria-labelledby="new-resume-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <button type="button" className="new-resume-close documents-icon-button" aria-label="Close" onClick={onClose} disabled={Boolean(busy)}>
        <Icon name="close" size={18} />
      </button>
      <header className="new-resume-head">
        <h2 id="new-resume-title">How would you like to create this resume?</h2>
        <p>Start from your Profile, upload a resume, or copy one you already have.</p>
      </header>

      <div className="new-resume-options">
        <button type="button" className="new-resume-option" disabled={Boolean(busy)} onClick={() => void run('profile', onProfile)}>
          <span className="new-resume-icon" aria-hidden="true">
            <Icon name="user" size={20} />
          </span>
          <span>
            <strong>{busy === 'profile' ? 'Creating from your Profile…' : 'Start From Profile'}</strong>
            <small>Fill it with your Profile: contact details, summary, jobs, education and skills.</small>
          </span>
        </button>
        <button type="button" className="new-resume-option" disabled={Boolean(busy)} onClick={onUpload}>
          <span className="new-resume-icon" aria-hidden="true">
            <Icon name="upload" size={20} />
          </span>
          <span>
            <strong>Upload a Resume</strong>
            <small>Upload a resume file (PDF, DOCX, TXT) and build a new resume from it.</small>
          </span>
        </button>
      </div>

      <p className="new-resume-or">
        <span>OR</span>
      </p>

      <section className="new-resume-existing" aria-labelledby="new-resume-existing-title">
        <div className="new-resume-existing-head">
          <span className="new-resume-icon" aria-hidden="true">
            <Icon name="copy" size={20} />
          </span>
          <span>
            <strong id="new-resume-existing-title">Use Existing Resume</strong>
            <small>A new resume is created with everything from the one you select, design included.</small>
          </span>
        </div>
        <label className="new-resume-search">
          <Icon name="search" size={16} />
          <input aria-label="Search resumes by name" placeholder="Search by name" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <ul className="new-resume-list">
          {resumes === null && <li className="new-resume-muted">Loading your resumes…</li>}
          {resumes !== null && !sorted.length && <li className="new-resume-muted">No resumes yet: start from your Profile or upload one.</li>}
          {resumes !== null && sorted.length > 0 && !shown.length && <li className="new-resume-muted">No resume named like “{query.trim()}”.</li>}
          {shown.map((resume) => (
            <li key={resume.id} className="new-resume-row">
              <span className="new-resume-row-main">
                <strong>{resume.name}</strong>
                <span className="new-resume-tags">
                  {resume.isPrimary && <span className="new-resume-tag">Default</span>}
                  {resume.jobId && <span className="new-resume-tag">Tailored</span>}
                  <span className="new-resume-date">Modified {modified(resume.updatedAt)}</span>
                </span>
              </span>
              <a className="new-resume-view" href={`/documents/${resume.id}`} target="_blank" rel="noreferrer" aria-label={`View ${resume.name} in a new tab`}>
                <Icon name="eye" size={16} />
                View
              </a>
              <button
                type="button"
                className="new-resume-select"
                disabled={Boolean(busy)}
                aria-label={`Select ${resume.name} to copy`}
                onClick={() => void run(`copy:${resume.id}`, () => onCopy(resume))}
              >
                {busy === `copy:${resume.id}` ? 'Copying…' : 'Select'}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {error && (
        <p className="documents-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
