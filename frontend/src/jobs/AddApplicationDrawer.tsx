import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ALL_STATUSES,
  STATUS_LABELS,
  type ApplicationInput,
  type JobStatus,
} from '../jobsApi';
import type { ResumeSummary } from '../resumeApi';
import { DashboardIcon } from './DashboardIcon';

export function AddApplicationDrawer({
  resumes,
  companies,
  onClose,
  onAdd,
}: {
  resumes: ResumeSummary[] | null;
  companies: string[];
  onClose(): void;
  onAdd(input: ApplicationInput): Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('Full-Time');
  const [status, setStatus] = useState<JobStatus>('applied');
  const [resumeId, setResumeId] = useState(
    () =>
      resumes?.find((resume) => resume.isPrimary && resume.currentSnapshotId)
        ?.id ?? '',
  );
  const [url, setUrl] = useState('');
  const [salary, setSalary] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const primary = resumes?.find(
      (resume) => resume.isPrimary && resume.currentSnapshotId,
    );
    if (primary) setResumeId((current) => current || primary.id);
  }, [resumes]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim() || !company.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        title: title.trim(),
        company: company.trim(),
        location: location.trim() || undefined,
        employmentType,
        status,
        resumeId: resumeId || undefined,
        url: url.trim() || undefined,
        salary: salary.trim() || undefined,
        description: description.trim() || undefined,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not add this application.',
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      className="application-drawer"
      ref={dialog}
      aria-labelledby="add-application-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <header className="application-drawer-header">
          <span className="application-heading-icon">
            <DashboardIcon name="briefcase" size={24} />
          </span>
          <h2 id="add-application-title">Add Application</h2>
          <button
            type="button"
            className="dashboard-icon-button"
            aria-label="Close Add Application"
            disabled={busy}
            onClick={onClose}
          >
            <DashboardIcon name="close" size={23} />
          </button>
        </header>
        <div className="application-drawer-body">
          <label className="application-field">
            Position Title <span className="application-required">*</span>
            <input
              autoFocus
              required
              maxLength={2000}
              placeholder="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
            />
          </label>
          <label className="application-field">
            Company <span className="application-required">*</span>
            <input
              required
              list="application-companies"
              maxLength={2000}
              placeholder="Company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              disabled={busy}
            />
            <datalist id="application-companies">
              {companies.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <div className="application-field-grid">
            <label className="application-field">
              Location
              <input
                maxLength={2000}
                placeholder="Location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="application-field">
              Job Type <span className="application-required">*</span>
              <span className="application-select">
                <select
                  required
                  value={employmentType}
                  onChange={(event) => setEmploymentType(event.target.value)}
                  disabled={busy}
                >
                  {[
                    'Full-Time',
                    'Part-Time',
                    'Contract',
                    'Temporary',
                    'Internship',
                    'Freelance',
                    'Other',
                  ].map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <DashboardIcon name="chevron" size={17} />
              </span>
            </label>
            <label className="application-field">
              Job Status
              <span className="application-select">
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as JobStatus)
                  }
                  disabled={busy}
                >
                  {ALL_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
                <DashboardIcon name="chevron" size={17} />
              </span>
            </label>
            <label className="application-field">
              Resume Uploaded
              <span className="application-select">
                <select
                  value={resumeId}
                  onChange={(event) => setResumeId(event.target.value)}
                  disabled={busy || resumes === null}
                >
                  <option value="">
                    {resumes === null
                      ? 'Loading resumes…'
                      : 'No resume selected'}
                  </option>
                  {resumes
                    ?.filter((resume) => resume.currentSnapshotId)
                    .map((resume) => (
                      <option key={resume.id} value={resume.id}>
                        {resume.name}
                        {resume.isPrimary ? ' (Default)' : ''}
                      </option>
                    ))}
                </select>
                <DashboardIcon name="chevron" size={17} />
              </span>
            </label>
          </div>
          {resumes?.every((resume) => !resume.currentSnapshotId) && (
            <p className="application-field-note">
              You can <Link to="/documents">add a resume in Documents</Link> and
              attach it to an application later.
            </p>
          )}
          <details className="application-extra">
            <summary>
              More details <DashboardIcon name="chevron" size={16} />
            </summary>
            <label className="application-field">
              Job link
              <input
                type="url"
                maxLength={2000}
                placeholder="https://…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="application-field">
              Salary
              <input
                maxLength={2000}
                placeholder="e.g. $120,000–$150,000"
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="application-field">
              Description
              <textarea
                rows={6}
                maxLength={120000}
                placeholder="Paste the job description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
              />
            </label>
          </details>
          {error && (
            <p className="dashboard-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="application-drawer-footer">
          <button
            type="button"
            className="dashboard-control"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="dashboard-control dashboard-primary"
            disabled={busy || !title.trim() || !company.trim()}
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
