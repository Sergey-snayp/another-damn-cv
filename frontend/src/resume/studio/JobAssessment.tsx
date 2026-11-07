import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PROFILE_CAREER_CHANGED } from '../../profile/careerApi';
import { assistantApi, type JobAssessment as Assessment } from './assistantApi';

const VERDICTS = {
  apply: 'I’d apply',
  stretch: 'Worth a try',
  skip: 'I’d pass',
  unclear: 'Need more details',
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

const scoreTone = (score: number) => (score >= 7 ? 'apply' : score >= 4 ? 'stretch' : 'skip');

/** Advice uses the saved Profile, independently of the selected CV and tailoring edits. */
export function JobAssessment({ jobId }: { jobId: string }) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setAssessment(null); setError(null);
    assistantApi.assessJob(jobId).then(result => {
      if (!active) return;
      if (result.basis?.source !== 'profile' || result.basis?.jobId !== jobId) {
        setError('The assessment did not match your Profile and this job. Try again.');
        return;
      }
      setAssessment(result);
    }, reason => { if (active) setError(reason.message || 'The job assessment could not be loaded.'); });
    return () => { active = false; };
  }, [jobId, request]);

  const technologies = useMemo(() => assessment?.technologies ?? [], [assessment]);
  const pattern = useMemo(() => technologyPattern(technologies), [technologies]);
  const marked = (text: string) => withTechnologies(text, technologies, pattern);

  return (
    <section className="ra-card qt-assessment" aria-labelledby="job-assessment-heading" aria-busy={started && !assessment && !error}>
      <h3 id="job-assessment-heading">Should you apply?</h3>
      {!started && <div className="qt-assessment-start">
        <p className="ra-muted">Compares this job with your saved Profile and scores the fit from 0 to 10.</p>
        <button className="ghost small" type="button" onClick={run}>Check the fit</button>
      </div>}
      {started && !assessment && !error && <p className="qt-assessment-loading" role="status"><span className="qt-spinner" aria-hidden="true" />Reading the job and your Profile…</p>}
      {started && error && <div role="alert"><p className="ra-error">{error}</p><button className="ghost small" type="button" onClick={run}>Try again</button></div>}
      {started && assessment && <>
        <div className="qt-assessment-head">
          {typeof assessment.score === 'number' && (
            <div className={`qt-assessment-score ${scoreTone(assessment.score)}`} role="img" aria-label={`${assessment.score} out of 10`}>
              <span className="qt-assessment-score-value"><b>{assessment.score}</b>/10</span>
              <span className="qt-assessment-meter" aria-hidden="true">
                {Array.from({ length: 10 }, (_, index) => <i key={index} className={index < assessment.score! ? 'on' : undefined} />)}
              </span>
            </div>
          )}
          <p className={`qt-assessment-verdict ${assessment.verdict}`}>{VERDICTS[assessment.verdict]}</p>
        </div>
        <p className="qt-assessment-summary">{marked(assessment.summary)}</p>
        {assessment.strengths.length > 0 && <>
          <h4>Why it fits</h4>
          <ul>{assessment.strengths.map((item, index) => <li key={index}>{marked(item.point)}</li>)}</ul>
        </>}
        {assessment.gaps.length > 0 && <>
          <h4>Gaps to consider</h4>
          <ul>{assessment.gaps.map((item, index) => <li key={index}><span className="qt-assessment-kind">{item.importance === 'required' ? 'Required' : 'Preferred'}</span> {marked(item.point)}</li>)}</ul>
        </>}
        {assessment.questions.length > 0 && <details className="qt-assessment-details">
          <summary>What I’d check before applying</summary>
          <ul>{assessment.questions.map((question, index) => <li key={index}>{marked(question)}</li>)}</ul>
        </details>}
        {(assessment.strengths.length > 0 || assessment.gaps.length > 0) && <details className="qt-assessment-details">
          <summary>Evidence from the job and Profile</summary>
          {assessment.strengths.map((item, index) => <blockquote key={`fit-${index}`}><p><b>Job:</b> {marked(item.jobQuote)}</p><p><b>Your Profile:</b> {marked(item.profileQuote)}</p></blockquote>)}
          {assessment.gaps.map((item, index) => <blockquote key={`gap-${index}`}><p><b>Job:</b> {marked(item.jobQuote)}</p><p>{marked(item.point)}</p></blockquote>)}
        </details>}
        {technologies.length > 0 && <p className="qt-tech-legend"><strong className="qt-tech has">In your Profile</strong><strong className="qt-tech missing">Not in your Profile</strong></p>}
        <p className="ra-muted qt-assessment-basis">Based on your saved <Link to="/profile" target="_blank" rel="noopener noreferrer">Profile</Link>: experience, achievements, education and skills.</p>
      </>}
    </section>
  );
}
