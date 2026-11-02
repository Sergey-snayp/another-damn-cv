import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jobsApi, jobName, STATUS_LABELS, type JobSummary } from '../jobsApi';
import { CompanyAvatar } from '../jobs/ApplicationCard';
import { DashboardIcon } from '../jobs/DashboardIcon';
import { isInterviewJob, compareInterviewJobs } from '../interviews/interviewJobs';
import { InterviewDateEditor } from '../interviews/InterviewDateEditor';
import '../interviews/interview-prep.css';

type StageFilter = 'all' | 'screening' | 'interview';

export function InterviewPrep() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('all');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void Promise.all([jobsApi.list('screening'), jobsApi.list('interview')])
      .then((results) => {
        if (!active) return;
        const unique = new Map(results.flat().filter(isInterviewJob).map((job) => [job.id, job]));
        setJobs([...unique.values()]);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your interview jobs.');
      });
    return () => { active = false; };
  }, [attempt]);

  const search = query.trim().toLocaleLowerCase();
  const shown = jobs?.filter((job) =>
    (stage === 'all' || job.status === stage) &&
    [job.company, jobName(job), job.location].some((value) => value?.toLocaleLowerCase().includes(search)),
  ).sort((a, b) => compareInterviewJobs(a, b)) ?? [];
  const filters: { value: StageFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All interviews', count: jobs?.length ?? 0 },
    { value: 'screening', label: 'Screening', count: jobs?.filter((job) => job.status === 'screening').length ?? 0 },
    { value: 'interview', label: 'Interviewing', count: jobs?.filter((job) => job.status === 'interview').length ?? 0 },
  ];

  return (
    <div className="interview-prep-page">
      <header className="interview-prep-header">
        <div>
          <h1>Interview preparation</h1>
          <p>Keep your interview jobs and application CVs close at hand.</p>
        </div>
        <Link className="interview-prep-button" to="/dashboard">
          Manage on Dashboard <DashboardIcon name="arrow" size={17} />
        </Link>
      </header>

      <aside className="interview-prep-intro" aria-label="Which jobs appear here">
        <span className="interview-prep-intro-icon"><DashboardIcon name="interview" size={24} /></span>
        <div>
          <h2>A focused space for your interviews</h2>
          <p>Active jobs in Screening or Interviewing appear here automatically. Change a job’s status on Dashboard to keep this list current.</p>
        </div>
      </aside>

      {error ? (
        <div className="interview-prep-state">
          <p className="error" role="alert">{error}</p>
          <button className="interview-prep-button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      ) : !jobs ? (
        <p className="interview-prep-loading" role="status">Loading your interview jobs…</p>
      ) : jobs.length === 0 ? (
        <section className="interview-prep-state">
          <DashboardIcon name="interview" size={36} />
          <h2>Your next interview starts here</h2>
          <p>When you have an interview, move the job to Screening or Interviewing on Dashboard. It will appear here.</p>
          <Link className="interview-prep-button is-primary" to="/dashboard">Go to Dashboard <DashboardIcon name="arrow" size={17} /></Link>
        </section>
      ) : (
        <>
          <div className="interview-prep-toolbar">
            <label className="interview-prep-search">
              <DashboardIcon name="search" size={19} />
              <input type="search" aria-label="Search interview jobs" placeholder="Search roles or companies" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="interview-prep-filters" role="group" aria-label="Filter interview jobs">
              {filters.map((filter) => (
                <button key={filter.value} type="button" aria-pressed={stage === filter.value} className={stage === filter.value ? 'is-active' : ''} onClick={() => setStage(filter.value)}>
                  {filter.label} <span>{filter.count}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="interview-prep-count" role="status">{shown.length} {shown.length === 1 ? 'interview job' : 'interview jobs'} · Upcoming dates first</p>
          {shown.length === 0 ? (
            <section className="interview-prep-state">
              <h2>No matching interviews</h2>
              <p>Try another role, company, or interview status.</p>
              <button className="interview-prep-button" onClick={() => { setQuery(''); setStage('all'); }}>Clear filters</button>
            </section>
          ) : (
            <div className="interview-prep-grid">
              {shown.map((job) => <InterviewJobCard key={job.id} job={job} onSaved={(saved) => setJobs((current) => current?.map((row) => row.id === saved.id ? { ...row, ...saved } : row) ?? null)} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InterviewJobCard({ job, onSaved }: { job: JobSummary; onSaved(job: JobSummary): void }) {
  return (
    <article className="interview-job-card" aria-label={`${job.company || 'Company not added'} — ${jobName(job)}`}>
      <div className="interview-job-card-top">
        <CompanyAvatar company={job.company} />
        <span className={`interview-job-stage ${job.status}`}>{STATUS_LABELS[job.status]}</span>
      </div>
      <p className="interview-job-company">{job.company || 'Company not added'}</p>
      <h2><Link to={`/interview-prep/${job.id}`}>{jobName(job)}</Link></h2>
      <p className="interview-job-location"><DashboardIcon name="location" size={16} />{job.location || (job.remote ? 'Remote' : 'Location not added')}</p>
      <InterviewDateEditor job={job} onSaved={(saved) => onSaved({ ...job, ...saved })} />
      <div className="interview-job-resume">
        <DashboardIcon name="file" size={20} />
        {job.applicationResumeId && job.applicationSnapshot ? (
          <div>
            <span>CV used for this application</span>
            <Link to={`/documents/${job.applicationResumeId}/history?snapshot=${job.applicationSnapshot}`}>View saved version {job.applicationSnapshot}</Link>
          </div>
        ) : (
          <div><span>Application CV</span><p>Choose the CV you sent in the job details.</p></div>
        )}
      </div>
      <footer>
        <Link className="interview-prep-button is-primary" to={`/interview-prep/${job.id}`}>Open preparation <DashboardIcon name="arrow" size={17} /></Link>
        {job.url && <a className="interview-job-posting" href={job.url} target="_blank" rel="noreferrer noopener">Original posting <DashboardIcon name="arrow" size={15} /></a>}
      </footer>
    </article>
  );
}
