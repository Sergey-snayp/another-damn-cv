import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobName, jobsApi, type JobSummary } from '../../jobsApi';
import {
  assistantApi,
  type ChatMessage,
  type ChatSuggestion,
  type IssueSection,
  type JobChoice,
  type ResumeScore,
} from './assistantApi';
import type { RenderedResume } from '../../resumeApi';
import { useSkillCard } from '../SkillInfo';
import { DashboardIcon } from '../../jobs/DashboardIcon';

const SECTION_NAMES: Record<IssueSection, string> = {
  header: 'Header',
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  skills: 'Skills',
};

/** A half-circle gauge: 0–100. */
export function Gauge({ score }: { score: number }) {
  const angle = Math.PI * (1 - score / 100);
  const x = 60 + 48 * Math.cos(angle);
  const y = 60 - 48 * Math.sin(angle);
  const tone = score >= 75 ? 'good' : score >= 50 ? 'fair' : 'low';
  return (
    <svg className={`ra-gauge ${tone}`} viewBox="0 0 120 68" role="img" aria-label={`Resume score ${score} out of 100`}>
      <path className="track" d="M12 60 A48 48 0 0 1 108 60" />
      {score > 0 && <path className="value" d={`M12 60 A48 48 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} />}
      <text x="60" y="56" textAnchor="middle">{score}</text>
    </svg>
  );
}

interface ChatEntry extends ChatMessage {
  suggestions?: ChatSuggestion[];
}

/**
 * The right column, as in Simplify's editor: the CV's score for a job with
 * what to fix, a button that tailors the CV for that job, and a chat about
 * the CV whose suggestions you apply one by one.
 */
export function AssistantPanel({ resumeId, resume, snapshot, defaultJobId, onIssues, onApply, onOpenSection }: {
  resumeId: string;
  /** The CV as it is being edited, for the keyword cards' "Used in". */
  resume?: RenderedResume | null;
  /** The saved version: the score is worked out again after each save. */
  snapshot: number;
  /** A tailored copy starts with its own job. */
  defaultJobId: string | null;
  onIssues(score: ResumeScore | null): void;
  /** Applies one chat suggestion to the CV; returns false when the person cancels. */
  onApply(suggestion: ChatSuggestion): boolean;
  onOpenSection(section: IssueSection): void;
}) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  /** Pointing at a job keyword shows what it is and where this CV uses it. */
  const keywordCards = useSkillCard(resumeId, resume ?? null);
  const keywordCard = (name: string) => ({
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => keywordCards.point(name, event.currentTarget),
    onMouseLeave: keywordCards.leave,
    onFocus: (event: React.FocusEvent<HTMLElement>) => keywordCards.point(name, event.currentTarget),
    onBlur: keywordCards.leave,
  });
  const [choice, setChoice] = useState<JobChoice | null>(defaultJobId ? { jobId: defaultJobId } : null);
  const [picking, setPicking] = useState(!defaultJobId);
  const [mode, setMode] = useState<'tracker' | 'paste'>('tracker');
  const [pickedJob, setPickedJob] = useState(defaultJobId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [score, setScore] = useState<ResumeScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [typed, setTyped] = useState('');
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void jobsApi.list().then(
      (list) => setJobs(list.filter((job) => job.status !== 'dismissed' && !job.archivedAt)),
      () => setJobs([]),
    );
  }, []);

  // Scored again for the job chosen, and after each save of the CV.
  useEffect(() => {
    if (!choice) { setScore(null); onIssues(null); return; }
    let active = true;
    setScoring(true);
    setScoreError(null);
    assistantApi.score(resumeId, choice).then(
      (next) => { if (active) { setScore(next); onIssues(next); } },
      (error: Error) => { if (active) { setScoreError(error.message); setScore(null); onIssues(null); } },
    ).finally(() => { if (active) setScoring(false); });
    return () => { active = false; };
  }, [resumeId, snapshot, choice]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); }, [chat, asking]);

  function done() {
    if (mode === 'tracker' && pickedJob) setChoice({ jobId: pickedJob });
    else if (mode === 'paste' && description.trim().length >= 30) setChoice({ title: title.trim() || undefined, description });
    else return;
    setPicking(false);
  }

  async function generate() {
    if (!choice) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      // A pasted job is saved to the tracker first: tailoring makes a copy of the CV for one job.
      const jobId = 'jobId' in choice
        ? choice.jobId
        : (await jobsApi.create({ title: choice.title, description: choice.description })).id;
      const { resumeId: copy } = await jobsApi.tailor(jobId, resumeId);
      navigate(`/documents/${copy}/tailor`);
    } catch (error) {
      setGenerateError((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || asking) return;
    const messages: ChatEntry[] = [...chat, { role: 'user', text: question }];
    setChat(messages);
    setTyped('');
    setAsking(true);
    setChatError(null);
    try {
      const answer = await assistantApi.chat(resumeId, messages.map(({ role, text: t }) => ({ role, text: t })), choice ?? undefined);
      setChat([...messages, { role: 'assistant', text: answer.reply, suggestions: answer.suggestions }]);
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setAsking(false);
    }
  }

  const chosenName = choice && ('jobId' in choice
    ? (() => { const job = jobs?.find((item) => item.id === choice.jobId); return job ? `${jobName(job)}${job.company ? ` · ${job.company}` : ''}` : score?.job.title ?? 'Job'; })()
    : choice.title || 'Pasted job');
  const bySection = new Map<IssueSection, number>();
  for (const issue of score?.issues ?? []) bySection.set(issue.section, (bySection.get(issue.section) ?? 0) + 1);

  return (
    <div className="ra">
      <section className="ra-card">
        <h3>Resume Score</h3>
        {picking ? (
          <div className="ra-pick">
            <div className="studio-tabs small">
              <button className={mode === 'tracker' ? 'on' : ''} onClick={() => setMode('tracker')}>From tracker</button>
              <button className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>Enter a job</button>
            </div>
            {mode === 'tracker' ? (
              <select value={pickedJob} onChange={(e) => setPickedJob(e.target.value)}>
                <option value="">{jobs === null ? 'Loading jobs…' : jobs.length ? 'Choose a job' : 'No jobs in the tracker yet'}</option>
                {(jobs ?? []).map((job) => (
                  <option key={job.id} value={job.id}>{jobName(job)}{job.company ? ` · ${job.company}` : ''}</option>
                ))}
              </select>
            ) : (
              <>
                <input value={title} placeholder="Job title" onChange={(e) => setTitle(e.target.value)} />
                <textarea rows={6} value={description} placeholder="Paste the job description" onChange={(e) => setDescription(e.target.value)} />
              </>
            )}
            <div className="ra-row">
              <button className="primary"
                disabled={mode === 'tracker' ? !pickedJob : description.trim().length < 30}
                onClick={done}>Done</button>
              {choice && <button className="ghost" onClick={() => setPicking(false)}>Cancel</button>}
            </div>
          </div>
        ) : (
          <>
            <button className="ra-job" title="Choose another job" onClick={() => setPicking(true)}>
              <span>For</span> <b>{chosenName}</b> <span className="pen" aria-hidden="true"><DashboardIcon name="edit" size={14} /></span>
            </button>
            {scoreError && <p className="ra-error">{scoreError}</p>}
            {scoring && !score && <p className="ra-muted">Scoring…</p>}
            {score && score.score !== null && (
              <>
                <div className={`ra-score${scoring ? ' busy' : ''}`}><Gauge score={score.score} /></div>
                {score.keywords && (
                  <p className="ra-muted center">
                    Mentions {score.keywords.matched.length} of {score.keywords.matched.length + score.keywords.missing.length} keywords from the job
                  </p>
                )}
                <button className="ra-issues-toggle" onClick={() => setShowIssues(!showIssues)}>
                  {score.issues.length ? `${score.issues.length} issue${score.issues.length === 1 ? '' : 's'} found` : 'No issues found'}
                  {score.issues.length > 0 && <span>{showIssues ? '▴' : '▾'}</span>}
                </button>
                {showIssues && (
                  <ul className="ra-issues">
                    {[...bySection.keys()].map((section) => (
                      <li key={section}>
                        <button className="ra-issue-head" onClick={() => onOpenSection(section)}>
                          {SECTION_NAMES[section]} <span className="ra-badge">{bySection.get(section)}</span>
                        </button>
                        <ul>
                          {score.issues.filter((issue) => issue.section === section).map((issue, index) => (
                            <li key={index} className={`ra-issue kind-${issue.kind}`}>{issue.message}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                {score.keywords && score.keywords.matched.length > 0 && (
                  <div className="ra-keywords">
                    {score.keywords.matched.map((name) => <span key={name} className="ra-kw have" tabIndex={0} {...keywordCard(name)}>✓ {name}</span>)}
                    {score.keywords.missing.map((name) => <span key={name} className="ra-kw miss" tabIndex={0} {...keywordCard(name)}>{name}</span>)}
                  </div>
                )}
              </>
            )}
            {score && score.score === null && <p className="ra-muted">The job names none of the skills we look for, so there is no keyword score.</p>}
          </>
        )}
      </section>

      <section className="ra-card">
        <h3>AI Generate Resume</h3>
        <p className="ra-muted">
          Makes a copy of this CV tailored for {choice ? 'the job above' : 'a job you choose above'}. You review every change before it is kept. Takes 1–3 minutes.
        </p>
        <button className="primary ra-wide" disabled={!choice || generating} onClick={() => void generate()}>
          {generating ? 'Generating… 1–3 minutes' : '✦ Generate for this job'}
        </button>
        {generateError && <p className="ra-error">{generateError}</p>}
      </section>

      <section className="ra-card ra-chat">
        <h3>Chat <span className="ra-beta">Beta</span></h3>
        <div className="ra-messages">
          {chat.length === 0 && (
            <div className="ra-starters">
              {['Make my bullets stronger', 'Rewrite my summary for this job', 'What should I fix first?'].map((starter) => (
                <button key={starter} onClick={() => void ask(starter)}>{starter}</button>
              ))}
            </div>
          )}
          {chat.map((entry, index) => (
            <div key={index} className={`ra-msg ${entry.role}`}>
              <p>{entry.text}</p>
              {entry.suggestions?.map((suggestion, j) => {
                const key = `${index}:${j}`;
                return (
                  <div key={key} className="ra-suggestion">
                    <span className="ra-where">{suggestion.where}</span>
                    {suggestion.before && <p className="before">{suggestion.before}</p>}
                    <p className="after">{suggestion.target === 'add-skill' ? `Add skill: ${suggestion.after}` : suggestion.after}</p>
                    {suggestion.reason && <p className="ra-muted">{suggestion.reason}</p>}
                    <button className="ghost small" disabled={applied.has(key)}
                      onClick={() => { if (onApply(suggestion)) setApplied(new Set(applied).add(key)); }}>
                      {applied.has(key) ? 'Applied' : 'Apply'}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          {asking && <div className="ra-msg assistant"><p className="ra-muted">Thinking…</p></div>}
          <div ref={chatEnd} />
        </div>
        {chatError && <p className="ra-error">{chatError}</p>}
        <div className="ra-ask">
          <textarea rows={2} value={typed} placeholder="Ask about your CV…"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(typed); } }} />
          <button className="primary" disabled={!typed.trim() || asking} onClick={() => void ask(typed)}>Send</button>
        </div>
        <p className="ra-muted tiny">It only rewords what your CV says. Nothing changes until you click Apply.</p>
      </section>
      {keywordCards.card}
    </div>
  );
}
