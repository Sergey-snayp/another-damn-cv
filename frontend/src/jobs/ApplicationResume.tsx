import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jobsApi, type Job } from '../jobsApi';
import { resumeApi, type ResumeSummary } from '../resumeApi';

export function ApplicationResume({
  job,
  onChanged,
}: {
  job: Job;
  onChanged(saved: Job): void;
}) {
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resumeApi
      .list()
      .then((rows) => {
        if (active) setResumes(rows);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function attach(id: string) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await jobsApi.attachResume(job.id, id || null));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not attach the resume.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Application resume</h2>
      <label className="field">
        <span>Resume used for this application</span>
        <select
          value={job.applicationResumeId ?? ''}
          disabled={busy || !resumes}
          onChange={(event) => void attach(event.target.value)}
        >
          <option value="">No resume attached</option>
          {resumes
            ?.filter((resume) => resume.currentSnapshotId)
            .map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.name}
              </option>
            ))}
        </select>
      </label>
      {job.applicationResumeId && (
        <p className="small">
          <Link
            to={`/documents/${job.applicationResumeId}/history?snapshot=${job.applicationSnapshot}`}
          >
            View attached version {job.applicationSnapshot}
          </Link>
          . Later edits to your resume do not change this version.
        </p>
      )}
      {busy && (
        <p className="muted small" role="status">
          Saving resume selection…
        </p>
      )}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
