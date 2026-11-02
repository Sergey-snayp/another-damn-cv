import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { jobsApi, jobName, type JobDetail } from '../jobsApi';
import { resumeApi, type RenderedResume } from '../resumeApi';
import { DashboardIcon } from '../jobs/DashboardIcon';
import '../interviews/interview-prep.css';
import '../interviews/interview-workspace.css';

/** Read-only references keep the preparation form short and the sent CV unchanged. */
export function InterviewReference({ kind }: { kind: 'job' | 'cv' }) {
  const { id = '' } = useParams();
  return <Reference key={`${id}:${kind}`} id={id} kind={kind} />;
}

function Reference({ id, kind }: { id: string; kind: 'job' | 'cv' }) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [cv, setCv] = useState<RenderedResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setJob(null);
    setCv(null);
    void (async () => {
      const row = await jobsApi.get(id);
      if (!active) return;
      setJob(row);
      if (kind === 'cv' && row.applicationResumeId && row.applicationSnapshot) {
        const document = await resumeApi.at(row.applicationResumeId, row.applicationSnapshot);
        if (active) setCv(document);
      }
    })().catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load this reference.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, kind, attempt]);

  return (
    <div className="interview-prep-page interview-workspace interview-reference">
      <Link className="interview-workspace-back" to={`/interview-prep/${id}`}>← Back to preparation</Link>
      <header className="interview-workspace-header">
        <div><h1>{kind === 'job' ? 'Job opening' : 'Application CV'}</h1>{job && <p>{job.company || 'Company not added'} · {jobName(job)}</p>}</div>
      </header>
      {loading ? <p role="status">Loading {kind === 'job' ? 'job opening' : 'the saved CV version'}…</p> : error ? (
        <section className="interview-workspace-section"><p className="error" role="alert">{error}</p><button className="interview-prep-button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></section>
      ) : job && (kind === 'job' ? (
        <section className="interview-workspace-section" aria-label="Saved job opening">
          <dl className="interview-reference-facts">
            <div><dt>Company</dt><dd>{job.company || 'Not added'}</dd></div>
            <div><dt>Position</dt><dd>{jobName(job)}</dd></div>
            <div><dt>Location</dt><dd>{job.location || (job.remote ? 'Remote' : 'Not added')}</dd></div>
            <div><dt>Employment type</dt><dd>{job.employmentType || 'Not added'}</dd></div>
          </dl>
          <h2>Job description</h2>
          <p className="interview-reference-text">{job.description || 'No description has been saved for this job.'}</p>
          {job.url && <a className="interview-workspace-source" href={job.url} target="_blank" rel="noreferrer noopener">Open original posting <DashboardIcon name="arrow" size={16} /></a>}
        </section>
      ) : cv ? <ApplicationCv document={cv} /> : (
        <section className="interview-workspace-section"><p>No CV is attached to this application. Go back to preparation and choose the CV you sent.</p></section>
      ))}
    </div>
  );
}

function ApplicationCv({ document }: { document: RenderedResume }) {
  const summary = document.summaries.default || Object.values(document.summaries)[0];
  return (
    <article className="interview-workspace-section" aria-label="Saved application CV">
      <p className="interview-workspace-hint">From saved version {document.snapshot}. Later CV edits do not change this reference.</p>
      {document.contact && <header className="interview-reference-contact">
        <h2>{document.contact.firstName} {document.contact.lastName}</h2>
        <p>{[document.contact.email, document.contact.phone, document.contact.location].filter(Boolean).join(' · ')}</p>
        <p>{[document.contact.linkedin, document.contact.github, document.contact.website].filter(Boolean).join(' · ')}</p>
      </header>}
      {summary && <section><h2>Summary</h2><p className="interview-workspace-cv-summary">{summary}</p></section>}
      <section>
        <h2>Experience</h2>
        {document.experiences.length ? document.experiences.map((role, index) => (
          <section className="interview-workspace-role" key={role.lineageId ?? index}>
            <h3>{role.company} · {role.title}</h3>
            <p>{role.from} – {role.current ? 'Present' : role.to || 'Not specified'}{role.client ? ` · ${role.client}` : ''}{role.location ? ` · ${role.location}` : ''}</p>
            {role.blurb && <p className="interview-reference-text">{role.blurb}</p>}
            <ul>{role.achievements.map((item, i) => <li key={item.lineageId ?? i}>{item.bullet}</li>)}</ul>
          </section>
        )) : <p>This CV version has no work experience entries.</p>}
      </section>
      {document.educations.length > 0 && <section><h2>Education</h2>{document.educations.map((row, index) => <div className="interview-workspace-role" key={row.lineageId ?? index}><h3>{row.institution}</h3><p>{[row.degree, row.field].filter(Boolean).join(' · ')} · {row.from} – {row.to || 'Present'}</p></div>)}</section>}
      {document.skills.length > 0 && <section><h2>Skills</h2><div className="interview-workspace-skills">{document.skills.map((skill, i) => <span key={skill.lineageId ?? i}>{skill.name}</span>)}</div></section>}
    </article>
  );
}
