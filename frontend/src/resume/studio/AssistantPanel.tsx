import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

type IconName = Parameters<typeof DashboardIcon>[0]['name'];

const SECTION_NAMES: Record<IssueSection, string> = {
  header: 'Header',
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  skills: 'Skills',
};

/** How a score reads: 75 and up is a good match, 50 and up fair, below that low. */
export const scoreTone = (score: number) => (score >= 75 ? 'good' : score >= 50 ? 'fair' : 'low');
const TONE_NAMES = { good: 'Good match', fair: 'Fair match', low: 'Low match' } as const;

/** A half-circle gauge: 0–100. */
export function Gauge({ score }: { score: number }) {
  const angle = Math.PI * (1 - score / 100);
  const x = 60 + 48 * Math.cos(angle);
  const y = 60 - 48 * Math.sin(angle);
  return (
    <svg className={`ra-gauge ${scoreTone(score)}`} viewBox="0 0 120 68" role="img" aria-label={`Resume score ${score} out of 100`}>
      <path className="track" d="M12 60 A48 48 0 0 1 108 60" />
      {score > 0 && <path className="value" d={`M12 60 A48 48 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} />}
      <text x="60" y="56" textAnchor="middle">{score}</text>
    </svg>
  );
}

interface ChatEntry extends ChatMessage {
  suggestions?: ChatSuggestion[];
}

/** Issues shown before "Show all". */
const FIRST_ISSUES = 4;

/**
 * The right column, two tabs. Resume Score: the job it is scored for, the
 * score in words, the job's keywords and what to fix (each opens its
 * section), and a tailored copy for that job. Chat: "Tailoring for <job>"
 * with its score, then a conversation about the CV whose suggestions are
 * applied one by one; quick actions as chips when it is empty, and from "+"
 * or "/" in the box.
 */
export function AssistantPanel({ resumeId, resume, snapshot, defaultJobId, onIssues, onApply, onOpenSection, onExport }: {
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
  /** Saves and downloads the PDF, as the header's button does. */
  onExport?(): void;
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [score, setScore] = useState<ResumeScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [allIssues, setAllIssues] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [typed, setTyped] = useState('');
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const chatEnd = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'score' | 'chat'>('score');
  /** The quick actions' menu, from "+" or a "/" typed first; the highlighted one. */
  const [menu, setMenu] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    void jobsApi.list().then(
      (list) => setJobs(list.filter((job) => job.status !== 'dismissed' && !job.archivedAt)),
      () => setJobs([]),
    );
  }, []);

  // Scored again for the job chosen, and after each save of the CV.
  useEffect(() => {
    if (!choice) { setScore(null); onIssues(null); return; }
    let current = true;
    setScoring(true);
    setScoreError(null);
    assistantApi.score(resumeId, choice).then(
      (next) => { if (current) { setScore(next); onIssues(next); } },
      (error: Error) => { if (current) { setScoreError(error.message); setScore(null); onIssues(null); } },
    ).finally(() => { if (current) setScoring(false); });
    return () => { current = false; };
  }, [resumeId, snapshot, choice]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); }, [chat, asking]);

  // The box grows with what is typed, up to its limit.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [typed, view]);

  /** A job from the tracker is used as soon as it is picked. */
  function pickTracked(jobId: string) {
    if (!jobId) return;
    setChoice({ jobId });
    setPicking(false);
  }

  function applyPasted() {
    if (description.trim().length < 30) return;
    setChoice({ title: title.trim() || undefined, description });
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

  function newChat() {
    setChat([]);
    setApplied(new Set());
    setChatError(null);
    setTyped('');
    box.current?.focus();
  }

  /** Choosing a job happens on the score tab, where the job picker is. */
  function chooseJob() {
    setView('score');
    setPicking(true);
  }

  const quick: { label: string; icon: IconName; run(): void }[] = [
    { label: 'Fit to one page', icon: 'file', run: () => void ask('Fit my resume to one page: what should I shorten or cut, without losing the strongest points?') },
    { label: 'Tailor to job', icon: 'briefcase', run: () => (choice ? void ask('Tailor my resume to this job: which lines should change first, and how?') : chooseJob()) },
    { label: 'Review my resume', icon: 'search', run: () => void ask('Review my resume. What are the most important things to fix first?') },
    ...(onExport ? [{ label: 'Export to PDF', icon: 'download' as const, run: onExport }] : []),
  ];
  const slash = typed.startsWith('/') ? typed.slice(1).trim().toLowerCase() : null;
  const offered = slash === null ? quick : quick.filter((item) => item.label.toLowerCase().includes(slash));
  const menuOpen = (menu || slash !== null) && offered.length > 0;
  function pick(at: number) {
    const item = offered[at];
    if (!item) return;
    setMenu(false);
    setTyped('');
    setActive(0);
    item.run();
  }

  // The job as two parts: its title, and its company.
  const tracked = choice && 'jobId' in choice ? jobs?.find((item) => item.id === choice.jobId) : null;
  const jobTitle = !choice ? '' : tracked ? jobName(tracked) : 'jobId' in choice ? score?.job.title ?? 'Job' : choice.title || 'Pasted job';
  const jobCompany = tracked ? tracked.company ?? '' : choice && 'jobId' in choice ? score?.job.company ?? '' : '';
  const issues = score?.issues ?? [];
  const shownIssues = allIssues ? issues : issues.slice(0, FIRST_ISSUES);
  const keywords = score?.keywords;
  const scored = score && score.score !== null ? score.score : null;

  function tabKeys(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = view === 'score' ? 'chat' : 'score';
    setView(next);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
  }

  const jobLine = (compact: boolean) => (
    <button type="button" className={`ra-jobline${compact ? ' compact' : ''}`} onClick={chooseJob} title={`${jobTitle}${jobCompany ? ` · ${jobCompany}` : ''}. Choose another job`}>
      {!compact && <span className="ra-jobicon" aria-hidden="true"><DashboardIcon name="briefcase" size={16} /></span>}
      <span className="ra-jobtext">
        {compact && <span className="ra-eyebrow">Tailoring for</span>}
        <b>{jobTitle}</b>
        {jobCompany && <span className="ra-company">{jobCompany}</span>}
      </span>
      {!compact && <span className="ra-change">Change</span>}
    </button>
  );

  return (
    <div className={`ra is-${view}`}>
      <div className="ra-tabs" role="tablist" aria-label="Resume Score and Chat" ref={tabs} onKeyDown={tabKeys}>
        <button type="button" role="tab" data-tab="score" aria-selected={view === 'score'} tabIndex={view === 'score' ? 0 : -1}
          className={view === 'score' ? 'on' : ''} onClick={() => setView('score')}>Resume Score</button>
        <button type="button" role="tab" data-tab="chat" aria-selected={view === 'chat'} tabIndex={view === 'chat' ? 0 : -1}
          className={view === 'chat' ? 'on' : ''} onClick={() => setView('chat')}>
          Chat <span className="ra-beta">Beta</span>
        </button>
      </div>

      {view === 'score' && (
        <div className="ra-pane" role="tabpanel" aria-label="Resume Score">
          <section className="ra-card" aria-label="Resume Score">
            {picking ? (
              <div className="ra-pick">
                {!choice && (
                  <div className="ra-intro">
                    <h4>Score this resume for a job</h4>
                    <p>See how well it matches, which of the job's keywords it misses, and what to fix first.</p>
                  </div>
                )}
                <div className="ra-segmented" role="radiogroup" aria-label="Where the job comes from">
                  <button type="button" role="radio" aria-checked={mode === 'tracker'} className={mode === 'tracker' ? 'on' : ''} onClick={() => setMode('tracker')}>From my jobs</button>
                  <button type="button" role="radio" aria-checked={mode === 'paste'} className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>Paste a job</button>
                </div>
                {mode === 'tracker' ? (
                  <select aria-label="Job" value={choice && 'jobId' in choice ? choice.jobId : ''} onChange={(event) => pickTracked(event.target.value)} disabled={jobs !== null && !jobs.length}>
                    <option value="">{jobs === null ? 'Loading your jobs…' : jobs.length ? 'Choose a job' : 'No jobs saved yet'}</option>
                    {(jobs ?? []).map((job) => (
                      <option key={job.id} value={job.id}>{jobName(job)}{job.company ? ` · ${job.company}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input aria-label="Job title" value={title} placeholder="Job title (optional)" onChange={(e) => setTitle(e.target.value)} />
                    <textarea aria-label="Job description" rows={6} value={description} placeholder="Paste the job description" onChange={(e) => setDescription(e.target.value)} />
                    <button type="button" className="primary ra-wide" disabled={description.trim().length < 30} onClick={applyPasted}>Score for this job</button>
                  </>
                )}
                {choice && <button type="button" className="ra-link" onClick={() => setPicking(false)}>Cancel</button>}
              </div>
            ) : (
              <>
                {jobLine(false)}
                {scoreError && <p className="ra-error" role="alert">{scoreError}</p>}
                {scoring && !score && <p className="ra-muted center" role="status">Scoring your resume…</p>}
                {scored !== null && (
                  <div className={`ra-score${scoring ? ' busy' : ''}`}>
                    <Gauge score={scored} />
                    <p className={`ra-verdict ${scoreTone(scored)}`}>{TONE_NAMES[scoreTone(scored)]}</p>
                    <p className="ra-muted center">Out of 100, for this job. It updates as you edit.</p>
                  </div>
                )}
                {score && score.score === null && <p className="ra-muted">The job names none of the skills we look for, so there is no keyword score.</p>}

                {keywords && keywords.matched.length + keywords.missing.length > 0 && (
                  <div className="ra-block">
                    <div className="ra-block-head">
                      <h4>Keywords</h4>
                      <span className="ra-count">{keywords.matched.length} of {keywords.matched.length + keywords.missing.length}</span>
                    </div>
                    <div className="ra-keywords">
                      {keywords.missing.map((name) => (
                        <span key={name} className="ra-kw miss" tabIndex={0} title="In the job, not in your resume yet" {...keywordCard(name)}>{name}</span>
                      ))}
                      {keywords.matched.map((name) => (
                        <span key={name} className="ra-kw have" tabIndex={0} title="In your resume" {...keywordCard(name)}>
                          <DashboardIcon name="check" size={11} />{name}
                        </span>
                      ))}
                    </div>
                    {keywords.missing.length > 0 && <p className="ra-muted tiny">Dashed: in the job, not in your resume yet. Add only what you have done.</p>}
                  </div>
                )}

                {score && (
                  <div className="ra-block">
                    <div className="ra-block-head">
                      <h4>To fix</h4>
                      {issues.length > 0 && <span className="ra-count">{issues.length}</span>}
                    </div>
                    {issues.length === 0 ? (
                      <p className="ra-clear"><DashboardIcon name="check" size={14} /> Nothing to fix for this job.</p>
                    ) : (
                      <ul className="ra-fixes">
                        {shownIssues.map((issue, index) => (
                          <li key={index}>
                            <button type="button" className={`kind-${issue.kind}`} onClick={() => onOpenSection(issue.section)} title={`Open ${SECTION_NAMES[issue.section]}`}>
                              <span className="ra-fix-where">{SECTION_NAMES[issue.section]}</span>
                              <span className="ra-fix-text">{issue.message}</span>
                              <DashboardIcon name="chevron" size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {issues.length > FIRST_ISSUES && (
                      <button type="button" className="ra-link" onClick={() => setAllIssues(!allIssues)}>
                        {allIssues ? 'Show fewer' : `Show all ${issues.length}`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {choice && !picking && (
            <section className="ra-card ra-generate">
              <h3><DashboardIcon name="sparkle" size={15} /> Tailor a copy for this job</h3>
              <p className="ra-muted">AI rewrites a copy of this resume for the job. You review every change before it is kept. Takes 1–3 minutes.</p>
              <button type="button" className="primary ra-wide" disabled={generating} onClick={() => void generate()}>
                <DashboardIcon name="sparkle" size={15} />
                {generating ? 'Generating… 1–3 minutes' : 'Generate tailored copy'}
              </button>
              {generateError && <p className="ra-error" role="alert">{generateError}</p>}
            </section>
          )}
        </div>
      )}

      {view === 'chat' && (
        <div className="ra-chat-pane" role="tabpanel" aria-label="Chat">
          <div className="ra-chat-head">
            {choice ? jobLine(true) : (
              <button type="button" className="ra-jobline compact" onClick={chooseJob}>
                <span className="ra-jobtext"><span className="ra-eyebrow">Not tailored for a job yet</span><b className="ra-choose">Choose a job</b></span>
              </button>
            )}
            {scored !== null && <div className={`ra-mini-score${scoring ? ' busy' : ''}`} title={`${TONE_NAMES[scoreTone(scored)]}: ${scored} out of 100`}><Gauge score={scored} /></div>}
            {chat.length > 0 && (
              <button type="button" className="ra-icon-button" aria-label="New chat" title="New chat" onClick={newChat} disabled={asking}>
                <DashboardIcon name="reset" size={15} />
              </button>
            )}
          </div>
          <div className="ra-messages" aria-live="polite">
            {chat.length === 0 && !asking ? (
              <div className="ra-empty">
                <span className="ra-empty-icon" aria-hidden="true"><DashboardIcon name="wand" size={22} /></span>
                <h4>Edit your resume with AI</h4>
                <p>Ask for a change in your own words, or start with one of these.</p>
                <div className="ra-chips">
                  {quick.map((item) => (
                    <button key={item.label} type="button" onClick={item.run}>
                      <DashboardIcon name={item.icon} size={15} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.map((entry, index) => (
                <div key={index} className={`ra-msg ${entry.role}`}>
                  <p>{entry.text}</p>
                  {entry.suggestions?.map((suggestion, j) => {
                    const key = `${index}:${j}`;
                    const done = applied.has(key);
                    return (
                      <div key={key} className={`ra-suggestion${done ? ' is-applied' : ''}`}>
                        <span className="ra-where">{suggestion.where}</span>
                        {suggestion.before && <p className="before"><span className="ra-sr">Now: </span>{suggestion.before}</p>}
                        <p className="after"><span className="ra-sr">Suggested: </span>{suggestion.target === 'add-skill' ? `Add skill: ${suggestion.after}` : suggestion.after}</p>
                        {suggestion.reason && <p className="ra-reason">{suggestion.reason}</p>}
                        {done ? (
                          <p className="ra-applied" role="status"><DashboardIcon name="check" size={14} /> Applied to your resume</p>
                        ) : (
                          <button type="button" className="primary small ra-apply"
                            onClick={() => { if (onApply(suggestion)) setApplied(new Set(applied).add(key)); }}>
                            <DashboardIcon name="check" size={14} /> Apply
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            {asking && (
              <div className="ra-msg assistant ra-typing" role="status" aria-label="AI is writing">
                <span /><span /><span />
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          {chatError && <p className="ra-error" role="alert">{chatError}</p>}
          <form className="ra-compose" onSubmit={(event) => { event.preventDefault(); void ask(typed); }}>
            {menuOpen && (
              <div className="ra-quick-menu">
                <p className="ra-quick-head">Quick actions <span>↑↓ to choose · Enter to run</span></p>
                <ul role="listbox" aria-label="Quick actions">
                  {offered.map((item, at) => (
                    <li key={item.label} role="option" aria-selected={at === active}>
                      <button type="button" className={at === active ? 'on' : ''} onMouseEnter={() => setActive(at)}
                        // Keeps the box focused, so the click picks and the menu does not close first.
                        onMouseDown={(event) => event.preventDefault()} onClick={() => pick(at)}>
                        <DashboardIcon name={item.icon} size={15} />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <textarea ref={box} rows={1} value={typed} aria-label="Ask AI to edit your resume"
              placeholder="Ask AI to edit your resume, or type / for quick actions"
              onChange={(event) => { setTyped(event.target.value); setActive(0); }}
              onBlur={() => setMenu(false)}
              onKeyDown={(event) => {
                if (menuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault();
                  setActive((at) => (at + (event.key === 'ArrowDown' ? 1 : offered.length - 1)) % offered.length);
                } else if (menuOpen && event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenu(false);
                  if (slash !== null) setTyped('');
                } else if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (menuOpen) pick(active);
                  else void ask(typed);
                }
              }} />
            <div className="ra-compose-bar">
              <button type="button" className="ra-plus" aria-label="Quick actions" aria-expanded={menuOpen} title="Quick actions"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setMenu(!menu); setActive(0); box.current?.focus(); }}>
                <DashboardIcon name="plus" size={16} />
              </button>
              <button type="submit" className="ra-send" aria-label="Send" title="Send (Enter)" disabled={!typed.trim() || slash !== null || asking}>
                <DashboardIcon name="arrowUp" size={16} />
              </button>
            </div>
          </form>
          <p className="ra-muted tiny center">AI only rewords what your resume says. Nothing changes until you Apply.</p>
        </div>
      )}
      {keywordCards.card}
    </div>
  );
}
