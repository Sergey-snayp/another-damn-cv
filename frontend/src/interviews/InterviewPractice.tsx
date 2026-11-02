import { useEffect, useRef, useState } from 'react';
import { practiceApi, type PracticeKind, type PracticeQuestion, type PracticeResult, type PracticeState } from './practiceApi';
import './interview-practice.css';

const kinds = [
  { kind: 'hr' as const, title: 'HR questions & answers', text: 'Practise your introduction, motivation, STAR stories and recruiter questions.' },
  { kind: 'technical' as const, title: 'Technical questions & answers', text: 'Prepare project deep dives, technical reasoning and trade-offs for this role.' },
];
export function InterviewPractice({ jobId, sourceVersion, unsaved }: { jobId: string; sourceVersion: string; unsaved: boolean }) {
  const [state, setState] = useState<PracticeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Partial<Record<PracticeKind, string>>>({});
  const [pending, setPending] = useState<PracticeKind[]>([]);
  const [refresh, setRefresh] = useState(0);
  const active = useRef(true);
  const locks = useRef(new Set<PracticeKind>());
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setLoadError('');
    async function read() {
      try {
        const next = await practiceApi.read(jobId);
        if (cancelled) return;
        setState(next);
        setLoadError('');
        if (next.running.length) timer = setTimeout(() => void read(), 2500);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load saved answers.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [jobId, sourceVersion, refresh]);

  async function generate(kind: PracticeKind, regenerate: boolean) {
    if (locks.current.has(kind) || unsaved || loading) return;
    locks.current.add(kind);
    setPending(previous => [...previous, kind]);
    setErrors(previous => ({ ...previous, [kind]: '' }));
    try {
      await practiceApi.generate(jobId, kind, regenerate);
      if (active.current) setRefresh(value => value + 1);
    } catch (error) {
      if (active.current) {
        setErrors(previous => ({ ...previous, [kind]: error instanceof Error ? error.message : 'Could not generate answers. Your saved answers are unchanged.' }));
        setRefresh(value => value + 1);
      }
    } finally {
      locks.current.delete(kind);
      if (active.current) setPending(previous => previous.filter(value => value !== kind));
    }
  }
  return <section className="interview-practice" aria-labelledby="practice-heading">
    <div className="interview-practice-heading"><div><h2 id="practice-heading">Practise for this interview</h2><p>Questions based on this job, your saved application CV and preparation notes. Generate only when you are ready.</p></div><span className="interview-practice-label">Before the interview</span></div>
    <p className="interview-practice-disclaimer">These are practice questions, not confirmed employer questions. Review personal answer drafts for accuracy. Your notes stay separate.</p>
    {unsaved && <p className="interview-practice-message" role="status">Save or discard your preparation changes before generating questions.</p>}
    {state?.problems.map(problem => <p key={problem} className="interview-practice-message">{problem}</p>)}
    {loadError && <div className="interview-practice-message" role="alert">{loadError} <button className="interview-prep-button" onClick={() => setRefresh(value => value + 1)}>Reload saved questions</button></div>}
    {loading && !state && <p role="status">Loading saved questions…</p>}
    <div className="interview-practice-sets">{kinds.map(({ kind, title, text }) => {
      const result = state?.results.find(row => row.kind === kind);
      const busy = pending.includes(kind) || !!state?.running.includes(kind);
      return <section key={kind} className="interview-practice-set" aria-label={title}>
        <div className="interview-practice-set-header"><div><h3>{title}</h3><p>{text}</p></div><button type="button" className="interview-prep-button is-primary" disabled={unsaved || loading || !state || !!loadError || !!state.problems.length || busy} onClick={() => void generate(kind, !!result)}>{busy ? 'Generating…' : result ? `Regenerate ${kind === 'hr' ? 'HR' : 'technical'} questions` : `Generate ${kind === 'hr' ? 'HR' : 'technical'} questions`}</button></div>
        {busy && <p className="interview-practice-message" role="status">Claude is preparing this set. This may take a few minutes. You can leave this page; successful results will be saved.</p>}
        {errors[kind] && <p className="error" role="alert">{errors[kind]}</p>}
        {result ? <>
          <p className="interview-practice-meta">Saved {new Date(result.generatedAt).toLocaleString()} · Application CV v{result.cv.snapshot} · {result.provider} / {result.model}</p>
          {result.stale && <p className="interview-practice-message">Your saved inputs or AI configuration changed. These answers use the earlier context. Regenerate when you are ready.</p>}
          <div className="interview-practice-questions">{result.questions.map((question, index) => <Question key={`${result.generatedAt}-${index}`} question={question} result={result} index={index} />)}</div>
        </> : !busy && <p className="interview-practice-empty">No saved questions yet. Each button creates six questions and answer drafts. Reopening this page uses your saved results.</p>}
      </section>;
    })}</div>
  </section>;
}

function Question({ question, result, index }: { question: PracticeQuestion; result: PracticeResult; index: number }) {
  const evidence = result.evidence.filter(row => question.evidenceIds.includes(row.id));
  return <details className="interview-practice-question">
    <summary><span className="interview-practice-number">{index + 1}</span><span>{question.question}</span><span className="interview-practice-expand" aria-hidden="true">+</span></summary>
    <div className="interview-practice-answer"><p className="interview-practice-why">{question.why}</p><h4>{question.answerKind === 'personal' ? 'Personal answer draft — check your facts' : 'Technical explanation — adapt in your own words'}</h4><p className="interview-practice-answer-text">{question.answer}</p>
      <h4>Talking points</h4><ul>{question.talkingPoints.map((text, i) => <li key={i}>{text}</li>)}</ul>
      {!!question.followUps.length && <><h4>Possible follow-up questions</h4><ul>{question.followUps.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
      {!!question.needsInput.length && <div className="interview-practice-missing"><h4>Add your details</h4><p>Use your preparation notes to fill these gaps, save them, then regenerate.</p><ul>{question.needsInput.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      {!!evidence.length && <details className="interview-practice-sources"><summary>Source references ({evidence.length})</summary>{evidence.map(row => <div key={row.id}><h4>{row.label}</h4><blockquote>{row.text}</blockquote></div>)}</details>}
    </div>
  </details>;
}
