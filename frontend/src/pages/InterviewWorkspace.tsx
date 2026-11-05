import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { jobsApi, jobName, STATUS_LABELS, type JobDetail, type Job } from '../jobsApi';
import { DashboardIcon } from '../jobs/DashboardIcon';
import { CompanyAvatar } from '../jobs/ApplicationCard';
import { ApplicationResume } from '../jobs/ApplicationResume';
import { InterviewDateEditor } from '../interviews/InterviewDateEditor';
import { InterviewPractice } from '../interviews/InterviewPractice';
import { isInterviewJob } from '../interviews/interviewJobs';
import { preparationApi, preparationValues, isPreparationInput, INTERVIEW_TYPE_LABELS, type Preparation, type PreparationInput, type InterviewType } from '../interviews/preparationApi';
import '../interviews/interview-prep.css';
import '../interviews/interview-workspace.css';

export function InterviewWorkspace() {
  const { id = '' } = useParams();
  return <Workspace key={id} id={id} />;
}

function Workspace({ id }: { id: string }) {
  const { user } = useAuth();
  const draftKey = `interview-draft:${user?.id}:${id}`;
  const [job, setJob] = useState<JobDetail | null>(null);
  const [saved, setSaved] = useState<Preparation | null>(null);
  const [draft, setDraft] = useState<PreparationInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all([jobsApi.get(id), preparationApi.read(id)]).then(([row, preparation]) => {
      if (!active) return;
      setJob(row);
      setSaved(preparation);
      let values = preparationValues(preparation);
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
        if (isPreparationInput(stored)) {
          values = stored;
          if (JSON.stringify(stored) !== JSON.stringify(preparationValues(preparation))) setNotice('Restored your browser draft. Review it before saving.');
        }
      } catch { /* The saved account copy remains available if browser storage is unavailable. */ }
      setDraft(values);
    }).catch((err: unknown) => {
      if (active) setLoadError(err instanceof Error ? err.message : 'Could not load this preparation.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, draftKey, attempt]);

  function update(values: PreparationInput) {
    setDraft(values);
    setNotice('');
    try { sessionStorage.setItem(draftKey, JSON.stringify(values)); } catch { /* Saving to the account still works. */ }
  }
  function clearDraft() {
    try { sessionStorage.removeItem(draftKey); } catch { /* No browser draft to clear. */ }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const next = await preparationApi.save(id, draft);
      setSaved(next);
      setDraft(preparationValues(next));
      clearDraft();
      setNotice('Preparation saved to your account.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preparation. Your draft is still here.');
    } finally { setBusy(false); }
  }
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(preparationValues(saved));
  function updateJob(next: Job) {
    setJob((current) => current ? { ...current, ...next } : current);
  }

  return (
    <div className="interview-prep-page interview-workspace">
      <Link className="interview-workspace-back" to="/interview-prep">← Interview Prep</Link>
      {loading ? <p role="status" className="interview-prep-loading">Loading your preparation…</p> : loadError || !job || !saved || !draft ? (
        <section className="interview-prep-state">
          <p className="error" role="alert">{loadError || 'Could not load this preparation.'}</p>
          <button className="interview-prep-button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </section>
      ) : (
        <>
          <header className="interview-workspace-header">
            <CompanyAvatar company={job.company} logo={job.companyLogo} />
            <div><p>{job.company || 'Company not added'} <span className={`interview-job-stage ${job.status}`}>{STATUS_LABELS[job.status]}</span></p><h1>{jobName(job)}</h1><span>Interview preparation</span></div>
          </header>
          <nav className="interview-workspace-references" aria-label="Preparation references">
            <Link className="interview-prep-button" to={`/interview-prep/${job.id}/job`}><DashboardIcon name="briefcase" size={17} />View job opening</Link>
            {job.applicationResumeId && job.applicationSnapshot ? (
              <Link className="interview-prep-button" to={`/interview-prep/${job.id}/cv`}><DashboardIcon name="file" size={17} />View application CV</Link>
            ) : <><button className="interview-prep-button" disabled><DashboardIcon name="file" size={17} />View application CV</button><span className="interview-workspace-hint">Choose your application CV to view it here.</span></>}
          </nav>
          {!isInterviewJob(job) && <p className="interview-workspace-context">This preparation is still available. The job appears in the Prep list while it is active and marked Screening or Interviewing.</p>}
          <div className="interview-workspace-layout">
            <div className="interview-workspace-main">
              <InterviewPractice jobId={job.id} sourceVersion={`${saved.updatedAt}:${job.applicationResumeId}:${job.applicationSnapshot}:${job.updatedAt}`} unsaved={dirty || busy} />
              <form className="interview-workspace-form" onSubmit={(event) => void save(event)}>
                <fieldset disabled={busy}>
                  <legend className="interview-date-sr-only">Preparation for {job.company || jobName(job)}</legend>
                  <section className="interview-workspace-section">
                    <h2>Interview details</h2>
                    <p className="interview-workspace-hint">Choose the specific round and add any information from your recruiter.</p>
                    <div className="interview-workspace-fields">
                      <label>Interview type<select value={draft.interviewType ?? ''} onChange={(event) => update({ ...draft, interviewType: event.target.value ? event.target.value as InterviewType : null })}><option value="">Not selected</option>{Object.entries(INTERVIEW_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label>Interviewer <span>(optional)</span><input value={draft.interviewer} maxLength={300} placeholder="Name and role, if known" onChange={(event) => update({ ...draft, interviewer: event.target.value })} /></label>
                    </div>
                    <label>Recruiter instructions<textarea rows={4} value={draft.instructions} maxLength={6000} placeholder="Interview format, topics, or instructions you received" onChange={(event) => update({ ...draft, instructions: event.target.value })} /></label>
                  </section>
                  <section className="interview-workspace-section">
                    <h2>My preparation</h2>
                    <p className="interview-workspace-hint">Use the job opening and application CV buttons to review your experience and prepare examples.</p>
                    <label>My notes and examples<textarea rows={8} value={draft.notes} maxLength={12000} placeholder="What I want to highlight, projects to explain, and topics to practise" onChange={(event) => update({ ...draft, notes: event.target.value })} /></label>
                    <label>Questions to ask the company<textarea rows={4} value={draft.questions} maxLength={6000} placeholder="What I want to learn about the team, role, and product" onChange={(event) => update({ ...draft, questions: event.target.value })} /></label>
                  </section>
                  <div className={`interview-workspace-savebar${dirty ? ' has-changes' : ''}`}>
                    <button type="submit" className="interview-prep-button is-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save preparation'}</button>
                    {dirty ? <><button type="button" className="interview-workspace-discard" onClick={() => { setDraft(preparationValues(saved)); clearDraft(); setError(null); setNotice('Changes discarded.'); }}>Discard changes</button><span>Unsaved changes</span></> : <span>{saved.updatedAt ? `Last saved ${new Date(saved.updatedAt).toLocaleString()}` : 'Add your notes when you are ready.'}</span>}
                  </div>
                </fieldset>
                {error && <p className="error" role="alert">{error}</p>}
                {notice && <p className="interview-workspace-notice" role="status">{notice}</p>}
              </form>
            </div>
            <aside className="interview-workspace-sidebar" aria-label="Application context">
              <section className="interview-workspace-section"><InterviewDateEditor job={job} onSaved={updateJob} /></section>
              <ApplicationResume job={job} onChanged={updateJob} versionHref={`/interview-prep/${job.id}/cv`} />
              <div className="interview-workspace-sidebar-note"><DashboardIcon name="saved" size={18} /><p>Your notes belong to this application. The schedule and CV selection save separately when you change them.</p></div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
