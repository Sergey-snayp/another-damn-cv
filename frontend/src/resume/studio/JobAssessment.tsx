import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PROFILE_CAREER_CHANGED } from '../../profile/careerApi';
import { jobsApi, type Job, type JobStatus } from '../../jobsApi';
import { assistantApi, type JobAssessment as Assessment, type FitRequirement } from './assistantApi';

/** The answer to "Should you apply?", in a word or two. */
const VERDICTS = {
  apply: 'Strong fit',
  stretch: 'Worth a try',
  skip: 'Not this one',
  unclear: 'Not enough details',
} as const;

type Technology = { name: string; inProfile: boolean };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One pattern for every technology name, longest first, matched as whole terms. */
function technologyPattern(technologies: Technology[]): RegExp | null {
  const names = technologies.map(item => item.name.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

/** The text with each technology in bold: a green frame when the Profile shows it, red when not. */
function withTechnologies(text: string, technologies: Technology[], pattern: RegExp | null): ReactNode {
  if (!pattern) return text;
  const byName = new Map(technologies.map(item => [item.name.trim().toLowerCase(), item.inProfile]));
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const has = byName.get(match[0].toLowerCase());
    parts.push(<strong key={at} className={`qt-tech ${has ? 'has' : 'missing'}`}>{match[0]}</strong>);
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

/**
 * The summary starts with the reason: the verdict is already shown once above it, so a
 * short opening sentence that only repeats it ("I would apply.") is left out.
 */
const VERDICT_OPENER = /^\s*(?:I(?:['’]d| would)(?: not)?|I wouldn['’]t)\s+(?:apply|pass|skip|give it a try|try)\b[^.!?]{0,30}[.!]\s+/i;
const withoutOpener = (summary: string) => {
  const rest = summary.replace(VERDICT_OPENER, '');
  return rest.trim() ? rest[0]!.toUpperCase() + rest.slice(1) : summary;
};

/** The advice speaks to you about your Profile ("Your Profile doesn't show…"). Quotes stay exact. */
const inYourVoice = (text: string) => text
  .replace(/\bThe Profile\b/g, 'Your Profile')
  .replace(/\bthe Profile\b/g, 'your Profile')
  .replace(/\bthe candidate's\b/gi, 'your')
  .replace(/\bdoes not (?:yet )?show\b/g, 'doesn’t show');

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const Icon = {
  have: () => <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.5" {...stroke} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  close: () => <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.5" {...stroke} aria-hidden="true"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>,
  missing: () => <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.5" {...stroke} aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>,
  target: () => <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  warning: () => <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>,
  workMode: () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>,
  location: () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>,
  salary: () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /></svg>,
  applyBy: () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>,
};

const STATUS_WORDS = { have: 'You have it', close: 'Close equivalent', missing: 'Missing' } as const;

/** One tier of the checklist: "Must-have 5 of 6" and a chip per requirement. */
function Requirements({ title, items, legend }: { title: string; items: FitRequirement[]; legend: boolean }) {
  if (!items.length) return null;
  const have = items.filter(item => item.status === 'have').length;
  return (
    <div className="qt-fit-group">
      <div className="qt-fit-group-head">
        <h4>{title}</h4>
        <span>{have} of {items.length}</span>
      </div>
      <ul className="qt-fit-chips">
        {items.map(item => {
          const Mark = Icon[item.status];
          return (
            <li key={item.name} className={`qt-fit-chip is-${item.status}`} title={`${STATUS_WORDS[item.status]}. The job: “${item.jobQuote}”`}>
              <Mark /><span className="qt-sr">{STATUS_WORDS[item.status]}: </span>{item.name}
              {item.status === 'close' && item.from && <span className="qt-fit-from">· from {item.from}</span>}
            </li>
          );
        })}
      </ul>
      {legend && (
        <p className="qt-fit-legend" aria-hidden="true">
          <span className="is-have"><Icon.have />You have it</span>
          <span className="is-close"><Icon.close />Close equivalent</span>
          <span className="is-missing"><Icon.missing />Missing</span>
        </p>
      )}
    </div>
  );
}

type JobFacts = Pick<Job, 'location' | 'remote' | 'salary' | 'status'>;

/** Advice uses the saved Profile, independently of the selected CV and tailoring edits. */
export function JobAssessment({ jobId, job }: { jobId: string; job?: JobFacts | null }) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  // "Dismiss job": the status it had before, so it can be undone; null while not dismissed.
  const [dismissed, setDismissed] = useState<JobStatus | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  // Runs only when the person asks: null until they press the button for this job.
  const [request, setRequest] = useState<{ jobId: string; attempt: number } | null>(null);
  const started = request?.jobId === jobId;
  const run = () => setRequest(previous => ({ jobId, attempt: (previous?.attempt ?? 0) + 1 }));

  // A Profile edit makes the old advice out of date: back to the button, without running it.
  useEffect(() => {
    const changed = () => { setRequest(null); setAssessment(null); setError(null); };
    const stored = (event: StorageEvent) => { if (event.key === PROFILE_CAREER_CHANGED) changed(); };
    window.addEventListener(PROFILE_CAREER_CHANGED, changed);
    window.addEventListener('storage', stored);
    return () => {
      window.removeEventListener(PROFILE_CAREER_CHANGED, changed);
      window.removeEventListener('storage', stored);
    };
  }, []);

  useEffect(() => {
    if (!request || request.jobId !== jobId) return;
    let active = true;
    setAssessment(null); setError(null); setWhy(false);
    assistantApi.assessJob(jobId).then(result => {
      if (!active) return;
      if (result.basis?.source !== 'profile' || result.basis?.jobId !== jobId) {
        setError('Couldn’t check the fit. Try again.');
        return;
      }
      setAssessment(result);
    }, reason => { if (active) setError(reason.message || 'Couldn’t check the fit. Try again.'); });
    return () => { active = false; };
  }, [jobId, request]);

  const technologies = useMemo(() => assessment?.technologies ?? [], [assessment]);
  const pattern = useMemo(() => technologyPattern(technologies), [technologies]);
  const marked = (text: string) => withTechnologies(text, technologies, pattern);
  const advice = (text: string) => marked(inYourVoice(text));

  const dismiss = async () => {
    setDismissError(null);
    try {
      await jobsApi.update(jobId, { status: 'dismissed' });
      setDismissed(job?.status && job.status !== 'dismissed' ? job.status : 'saved');
    } catch { setDismissError('The job wasn’t dismissed. Try again.'); }
  };
  const undoDismiss = async () => {
    if (!dismissed) return;
    setDismissError(null);
    try { await jobsApi.update(jobId, { status: dismissed }); setDismissed(null); }
    catch { setDismissError('The job is still dismissed. Try again.'); }
  };

  const verdict = assessment?.verdict ?? 'unclear';
  const requirements = assessment?.requirements ?? [];
  const must = requirements.filter(item => item.tier === 'must');
  const nice = requirements.filter(item => item.tier === 'nice');
  const dealbreaker = assessment?.dealbreaker ?? null;
  // The dealbreaker's own name, from the must-have it comes from ("German C1").
  const blockedBy = dealbreaker && must.find(item => item.status === 'missing' && item.jobQuote === dealbreaker.jobQuote)?.name;
  const facts = assessment && [
    { key: 'workMode', label: 'Work mode', value: assessment.facts?.workMode ?? (job?.remote ? 'Remote' : null) },
    { key: 'location', label: 'Location', value: job?.location || assessment.facts?.location || null },
    { key: 'salary', label: 'Salary', value: job?.salary || assessment.facts?.salary || null },
    { key: 'applyBy', label: 'Apply by', value: assessment.facts?.applyBy ?? null },
  ] as const;
  const score = assessment?.score;

  return (
    <section className={`ra-card qt-assessment${assessment ? ` qt-fit is-${verdict}` : ''}`} aria-labelledby="job-assessment-heading" aria-busy={started && !assessment && !error}>
      <h3 id="job-assessment-heading">Should you apply?</h3>
      {!started && <div className="qt-assessment-start">
        <p className="ra-muted">Compares this job with your saved Profile and scores the fit from 0 to 10.</p>
        <button className="ghost small" type="button" onClick={run}>Check the fit</button>
      </div>}
      {started && !assessment && !error && <p className="qt-assessment-loading" role="status"><span className="qt-spinner" aria-hidden="true" />Reading the job and your Profile…</p>}
      {started && error && <div role="alert"><p className="ra-error">{error}</p><button className="ghost small" type="button" onClick={run}>Try again</button></div>}
      {started && assessment && <>
        <div className="qt-fit-top">
          <div className="qt-fit-head">
            <p className="qt-assessment-verdict">{VERDICTS[verdict]}</p>
            {typeof score === 'number' && <p className="qt-assessment-value"><span className="qt-sr">Fit </span><b>{score}</b><span>/10</span></p>}
          </div>
          {typeof score === 'number' && (
            <div className="qt-fit-bar" role="img" aria-label={`Score ${score} out of 10`}>
              {Array.from({ length: 10 }, (_, index) => <span key={index} className={index < score ? 'on' : undefined} />)}
            </div>
          )}
          {!dealbreaker && <p className="qt-fit-headline">{inYourVoice(assessment.headline || withoutOpener(assessment.summary))}</p>}
        </div>

        {dealbreaker && (
          <div className="qt-fit-note is-blocked">
            <Icon.warning />
            <div>
              <p className="qt-fit-note-title">{blockedBy ? `Dealbreaker: ${blockedBy}` : 'Dealbreaker'}</p>
              <p>{inYourVoice(dealbreaker.point)}</p>
            </div>
          </div>
        )}

        <Requirements title="Must-have" items={must} legend={!nice.length} />
        <Requirements title="Nice to have" items={nice} legend />

        {!dealbreaker && assessment.advice && (
          <div className="qt-fit-note">
            <Icon.target />
            <div>
              <p className="qt-fit-note-title">If you apply</p>
              <p>{inYourVoice(assessment.advice)}</p>
            </div>
          </div>
        )}

        {facts && (
          <dl className="qt-fit-facts">
            {facts.map(fact => {
              const FactIcon = Icon[fact.key];
              return (
                <div key={fact.key}>
                  <FactIcon />
                  <div><dt>{fact.label}</dt><dd className={fact.value ? undefined : 'is-unknown'}>{fact.value ?? 'Not stated'}</dd></div>
                </div>
              );
            })}
          </dl>
        )}

        <div className="qt-fit-actions">
          {dealbreaker ? <>
            {dismissed
              ? <button className="qt-fit-button is-main" type="button" onClick={() => void undoDismiss()}>Undo dismiss</button>
              : <button className="qt-fit-button is-main" type="button" onClick={() => void dismiss()}>Dismiss job</button>}
          </> : <>
            <button className="qt-fit-button" type="button" aria-expanded={why} aria-controls="qt-fit-why" onClick={() => setWhy(open => !open)}>Why this score</button>
          </>}
        </div>
        {dismissed && <p className="qt-fit-status" role="status">Dismissed. It moved out of your job list.</p>}
        {dismissError && <p className="ra-error" role="alert">{dismissError}</p>}
        {dealbreaker && <button className="qt-fit-more" type="button" aria-expanded={why} aria-controls="qt-fit-why" onClick={() => setWhy(open => !open)}>Why this score</button>}

        {why && (
          <div className="qt-fit-why" id="qt-fit-why">
            <p className="qt-assessment-summary">{advice(withoutOpener(assessment.summary))}</p>
            {technologies.length > 0 && <p className="qt-tech-legend"><strong className="qt-tech has">Green</strong> is in your Profile, <strong className="qt-tech missing">red</strong> is not.</p>}
            {assessment.strengths.length > 0 && <>
              <h4>Why it fits</h4>
              <ul>{assessment.strengths.map((item, index) => <li key={index}>{advice(item.point)}</li>)}</ul>
            </>}
            {assessment.gaps.length > 0 && <>
              <h4>Gaps to consider</h4>
              <ul>{assessment.gaps.map((item, index) => <li key={index}><span className="qt-assessment-kind">{item.importance === 'required' ? 'Required:' : 'Preferred:'}</span> {advice(item.point)}</li>)}</ul>
            </>}
            {assessment.questions.length > 0 && <>
              <h4>Check before applying</h4>
              <ul>{assessment.questions.map((question, index) => <li key={index}>{advice(question)}</li>)}</ul>
            </>}
            {(assessment.strengths.length > 0 || assessment.gaps.length > 0) && <>
              <h4>Evidence from the job and your Profile</h4>
              {assessment.strengths.map((item, index) => <blockquote key={`fit-${index}`}><p><b>Job:</b> {marked(item.jobQuote)}</p><p><b>Your Profile:</b> {marked(item.profileQuote)}</p></blockquote>)}
              {assessment.gaps.map((item, index) => <blockquote key={`gap-${index}`}><p><b>Job:</b> {marked(item.jobQuote)}</p><p>{advice(item.point)}</p></blockquote>)}
            </>}
            <p className="ra-muted qt-assessment-basis">Based on your saved <Link to="/profile" target="_blank" rel="noopener noreferrer">Profile</Link>: experience, achievements, education and skills.</p>
          </div>
        )}
      </>}
    </section>
  );
}
