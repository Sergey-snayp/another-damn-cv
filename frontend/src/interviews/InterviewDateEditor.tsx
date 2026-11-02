import { useState, type FormEvent } from 'react';
import { jobsApi, type Job, type JobDetail } from '../jobsApi';
import { DashboardIcon } from '../jobs/DashboardIcon';
import './interview-date.css';

const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const supportedTimeZones = () => typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone') : ['America/Vancouver', 'America/Toronto', 'America/New_York', 'Europe/London'];

export function InterviewDateEditor({ job, onSaved }: { job: Pick<Job, 'id' | 'company' | 'interview'>; onSaved(job: JobDetail): void }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [zone, setZone] = useState(localTimeZone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const zones = [...new Set([zone, 'UTC', ...supportedTimeZones()])].sort();
  const company = job.company || 'this job';

  function edit() {
    setDate(job.interview?.date ?? '');
    setTime(job.interview?.time ?? '');
    setZone(job.interview?.timeZone ?? localTimeZone());
    setNotice('');
    setError(null);
    setEditing(true);
  }

  async function save(clear = false) {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const saved = await jobsApi.update(job.id, { interview: clear ? null : { date, time: time || null, timeZone: zone } });
      onSaved(saved);
      setEditing(false);
      setNotice(clear ? 'Interview date removed.' : 'Interview date saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the interview date.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  return (
    <section className="interview-date" aria-label={`Interview date for ${company}`}>
      <div className="interview-date-heading">
        <h3><DashboardIcon name="calendar" size={18} />Interview date</h3>
        {!editing && <button type="button" className="interview-date-edit" aria-label={`${job.interview ? 'Change' : 'Set'} interview date for ${company}`} onClick={edit}>{job.interview ? 'Change' : 'Set date'}</button>}
      </div>
      {!editing ? (
        job.interview ? (
          <div className="interview-date-saved">
            <time dateTime={job.interview.date}>{new Date(`${job.interview.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time>
            {job.interview.time && <p>{job.interview.time} · {job.interview.timeZone.replaceAll('_', ' ')}</p>}
          </div>
        ) : <p className="interview-date-unset">No date set yet.</p>
      ) : (
        <form onSubmit={submit} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); setEditing(false); setError(null); } }}>
          <fieldset disabled={busy}>
            <legend className="interview-date-sr-only">Schedule for {company}</legend>
            <div className="interview-date-fields">
              <label>Date<input type="date" aria-label="Interview date" autoFocus required value={date} min="1000-01-01" max="9999-12-31" onChange={(event) => setDate(event.target.value)} /></label>
              <label>Time <span>(optional)</span><input type="time" aria-label="Interview time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
            </div>
            <label>Time zone<select aria-label="Interview time zone" value={zone} onChange={(event) => setZone(event.target.value)}>{zones.map((name) => <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>)}</select></label>
            <div className="interview-date-actions">
              <button type="submit" className="interview-date-save">{busy ? 'Saving…' : 'Save date'}</button>
              <button type="button" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
              {job.interview && <button type="button" className="interview-date-remove" onClick={() => void save(true)}>Remove date</button>}
            </div>
          </fieldset>
        </form>
      )}
      {error && <p className="interview-date-error" role="alert">{error}</p>}
      {notice && <p className="interview-date-notice" role="status">{notice}</p>}
    </section>
  );
}
