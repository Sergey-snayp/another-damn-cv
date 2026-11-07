import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { jobName, jobsApi, type JobDetail } from '../jobsApi';
import { resumeApi, type QuickTailoringDraft, type RenderedResume } from '../resumeApi';
import { DiffText } from '../resume/DiffText';
import { ResumeDocument, type RewriteTarget } from '../resume/ResumeDocument';
import { PagedDocument, ScaledPage } from '../resume/PagedDocument';
import { designOf } from '../resume/theme';
import { DraftHistory } from '../resume/draftHistory';
import { assistantApi, type ResumeScore } from '../resume/studio/assistantApi';
import { Gauge } from '../resume/studio/AssistantPanel';
import { JobAssessment } from '../resume/studio/JobAssessment';
import { useSkillCard } from '../resume/SkillInfo';
import { notifyResumesChanged, useResumeInExtension } from '../extensionBridge';
import '../resume/document.css';
import '../resume/studio/studio.css';

const PAGE_WIDTH = 794;
const newId = () => crypto.randomUUID();

/** Marks the job's keywords in its description: found on the CV, or not yet. */
function highlight(text: string, matched: string[], missing: string[]): ReactNode {
  const names = [...matched, ...missing].sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const have = new Set(matched.map((name) => name.toLowerCase()));
  return text.split(pattern).map((piece, index) =>
    index % 2 === 1
      ? <mark key={index} className={have.has(piece.toLowerCase()) ? 'have' : 'miss'}>{piece}</mark>
      : piece);
}

/** The line being tailored, the suggestion for it, and where on the page it sits. */
/** One line's suggestion in the card. */
interface Suggestion {
  key: string;
  target: RewriteTarget;
  busy: boolean;
  /** As shown: the line now, and the line suggested. */
  before: string;
  after?: string;
  /** What "Use" puts in the draft (for skills, the JSON list of names). */
  value?: string;
  cannotDo?: string[];
  /** Skills brought in from elsewhere on the CV, or left out for this job. */
  added?: string[];
  dropped?: string[];
  error?: string;
  decided?: 'used' | 'skipped';
  /** For the summary: how it answers the posting, and the checks it still fails. */
  report?: SummaryReport;
}

/** What the summary writer returns besides the summary. */
interface SummaryReport {
  wordCount: number;
  mapping: Array<{ item: string; type: 'required' | 'preferred'; evidence: string; employer: string | null }>;
  gaps: string[];
  decidingGap: string | null;
  failedChecks: Array<{ id: string; name: string; detail?: string }>;
  attempts: number;
}

/** The summary's report in the card: failed checks first, then gaps, then the mapping. */
function SummaryReportView({ report }: { report: SummaryReport }) {
  const missing = report.mapping.filter((line) => /^no evidence$/i.test(line.evidence.trim()));
  return (
    <div className="qt-report">
      {report.failedChecks.length ? (
        <div className="qt-report-failed">
          <p><b>Still fails {report.failedChecks.length} check{report.failedChecks.length === 1 ? '' : 's'}</b> after {report.attempts} attempts:</p>
          <ul>{report.failedChecks.map((check) => <li key={check.id}><b>{check.name}</b>{check.detail ? `: ${check.detail}` : ''}</li>)}</ul>
        </div>
      ) : (
        <p className="qt-report-passed">✓ Passes all 10 checks · {report.wordCount} words{report.attempts > 1 ? ` · fixed in ${report.attempts} attempts` : ''}</p>
      )}
      {report.decidingGap && <p className="qt-report-deciding"><b>Deciding gap:</b> {report.decidingGap}</p>}
      {report.gaps.length > 0 && (
        <div className="qt-report-gaps">
          <p className="qt-report-label">Gaps</p>
          <ul>{report.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
        </div>
      )}
      {report.mapping.length > 0 && (
        <details className="qt-report-mapping">
          <summary>How it answers the posting · {report.mapping.length - missing.length} of {report.mapping.length} items</summary>
          <table>
            <tbody>
              {report.mapping.map((line, index) => {
                const none = /^no evidence$/i.test(line.evidence.trim());
                return (
                  <tr key={index} className={none ? 'none' : ''}>
                    <td><span className={`qt-report-type ${line.type}`}>{line.type === 'required' ? 'Req' : 'Pref'}</span> {line.item}</td>
                    <td>{none ? 'No evidence' : line.evidence}</td>
                    <td>{line.employer ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/** Seconds since \`active\` turned on; 0 while off. */
function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!active) return;
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return seconds;
}

/** What the AI is doing, so a long wait never looks like nothing is happening. */
function WorkingStatus({ seconds, summary, skills, progress }: {
  seconds: number; summary: boolean; skills: boolean; progress: string | null;
}) {
  const step = !summary ? (progress ?? 'Tailoring this for the job…')
    : seconds < 20 ? 'Reading the job and your experience…'
      : seconds < 50 ? 'Writing the summary and checking it against the 10 rules…'
        : 'Fixing what the checks found. A summary can take up to 2 minutes.';
  return (
    <p className="qt-working-status" role="status">
      <span className="qt-spinner" aria-hidden="true" />
      <span>{step}{skills && !summary ? ' Skills take up to 30 seconds.' : ''}</span>
      <span className="qt-elapsed">{seconds}s</span>
    </p>
  );
}

/** "**Kafka**" shows as Kafka in the card's comparison; the CV draws the bold itself. */
const unmarked = (text: string) => text.replace(/\*\*/g, '');
/** "**Kafka**" in bold, as it will print. */
const withBold = (text: string) => text.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 ? <b key={index}>{part}</b> : part));

/** The AI's line types itself into the screen, then shows with its bold. */
function TypedLine({ text }: { text: string }) {
  const plain = unmarked(text);
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(still ? plain.length : 0);
  useEffect(() => {
    if (still) { setShown(plain.length); return; }
    setShown(0);
    const timer = window.setInterval(() => setShown((count) => {
      if (count >= plain.length) { window.clearInterval(timer); return count; }
      return Math.min(plain.length, count + 3);
    }), 14);
    return () => window.clearInterval(timer);
  }, [plain, still]);
  if (shown >= plain.length) return <>{withBold(text)}</>;
  // The finished line holds the space from the first letter, so nothing below moves as it types.
  return (
    <span className="qt-typing">
      <span className="qt-typing-room" aria-hidden="true">{plain}</span>
      <span className="qt-typing-live">{plain.slice(0, shown)}<span className="qt-caret" aria-hidden="true" /></span>
    </span>
  );
}

/** What the line is, for the screen's label. */
const KIND_NAMES: Record<string, string> = { summary: 'Summary', bullet: 'Bullet', blurb: 'Job description', headline: 'Headline', skills: 'Skills' };

/** The card under the part being tailored: one line, or every line of a job or section. */
interface Tailoring {
  run: number;
  anchor: HTMLElement;
  items: Suggestion[];
  /** "compose": the person writes what they want; nothing is asked of the AI until Generate. */
  stage: 'compose' | 'generated';
  /** The person's request, sent with every line: "shorter", "stress the payments work". */
  request: string;
  /** Notes for the whole card, such as skills the job asks for that the CV does not show. */
  notes?: string[];
}

/** One-click requests for the card's box. */
const REQUESTS = ["Use the job's keywords", 'Shorter', 'Lead with the result', 'More technical'];

const isReady = (item: Suggestion) => !item.busy && !item.error && !item.decided && item.value !== undefined
  && item.after?.trim() !== item.before.trim();

/**
 * Quick tailoring: an unsaved draft for the job, drawn exactly as its PDF prints
 * (A4 sheets, the same page breaks). Change any line in place, or press ✦
 * beside a line: the AI rewords it for the job and the suggestion opens right
 * under that line. It is kept only when you choose "Use this", and the AI may
 * reword, never add facts. Save stores the edited CV first, then makes its PDF.
 */
export function QuickTailor({ popup = false, jobRoute = false }: { popup?: boolean; jobRoute?: boolean }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const jobId = jobRoute ? id : params.get('job') ?? '';
  const sourceId = jobRoute ? params.get('from') ?? undefined : id;
  const [workspace, setWorkspace] = useState<QuickTailoringDraft | null>(null);
  const resumeId = workspace?.resumeId ?? null;
  const contextId = resumeId ?? workspace?.sourceResumeId ?? '';
  const theme = useMemo(() => designOf(workspace?.theme), [workspace?.theme]);

  const [loaded, setLoaded] = useState<RenderedResume | null>(null);
  const [draft, setDraft] = useState<RenderedResume | null>(null);
  /** Pointing at a job keyword shows what it is and where this CV uses it. */
  const keywordCards = useSkillCard(contextId || null, draft);
  const keywordCard = (name: string) => ({
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => keywordCards.point(name, event.currentTarget),
    onMouseLeave: keywordCards.leave,
    onFocus: (event: React.FocusEvent<HTMLElement>) => keywordCards.point(name, event.currentTarget),
    onBlur: keywordCards.leave,
  });
  const history = useRef(new DraftHistory()).current;
  const [savedStep, setSavedStep] = useState<number | null>(null);
  const [pendingEdit, setPendingEdit] = useState(false);
  /** Sections hidden or shown again since the last Save: saved with the CV's layout. */
  const [layoutChanged, setLayoutChanged] = useState(false);
  const [name, setName] = useState('');
  const [job, setJob] = useState<JobDetail | null>(null);
  const [score, setScore] = useState<ResumeScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [pdfSnapshot, setPdfSnapshot] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState<Tailoring | null>(null);
  const [cardTop, setCardTop] = useState(0);
  /** One line's card sits over that line: its left edge, width and the CV's type at this zoom. */
  const [cardBox, setCardBox] = useState<{ left: number; width: number; font: React.CSSProperties } | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const tailorRun = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<RenderedResume | null>(null);

  useEffect(() => {
    let active = true;
    if (!jobId) return;
    Promise.all([resumeApi.previewQuick(jobId, sourceId), jobsApi.get(jobId)]).then(
      ([prepared, detail]) => {
        if (!active) return;
        setWorkspace(prepared);
        setLoaded(prepared.document);
        const initial = history.reset(prepared.document);
        setDraft(initial.document);
        setSavedStep(initial.id);
        setPendingEdit(false);
        setTailoring(null);
        setName(prepared.name);
        setPdfSnapshot(null);
        setJob(detail);
      },
      (err: Error) => active && setError(err.message),
    );
    return () => { active = false; };
  }, [jobId, sourceId, history]);

  // The score for the job, again after each save.
  useEffect(() => {
    if (!jobId || !loaded || !contextId) return;
    let active = true;
    assistantApi.score(contextId, { jobId }).then((next) => active && setScore(next), () => active && setScore(null));
    return () => { active = false; };
  }, [contextId, jobId, loaded?.snapshot]);

  // The page is as wide as the column allows, up to its real size.
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCanvasWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [draft !== null]);
  // The canvas keeps 24px on the left and 84px on the right, where the lines' buttons sit.
  const scale = canvasWidth ? Math.min(1, Math.max(0.5, (canvasWidth - 108) / PAGE_WIDTH)) : 1;

  draftRef.current = draft;
  const pagedWatch = useMemo(() => [draft, theme], [draft, theme]);
  const dirty = Boolean(draft && history.current?.id !== savedStep);

  /** An edit to the draft. Using a suggestion keeps its card open for the other lines. */
  function change(mutate: (d: RenderedResume) => void, keepCard = false) {
    if (savingRef.current) return;
    const next = history.change(mutate);
    setPendingEdit(false);
    if (!next) return;
    if (!keepCard) setTailoring(null);
    setDraft(next.document);
  }

  const moveHistory = useCallback((direction: -1 | 1) => {
    if (savingRef.current) return;
    const next = history.move(direction);
    if (!next) return;
    setTailoring(null);
    setPendingEdit(false);
    setDraft(next.document);
  }, [history]);

  function resetChanges() {
    if (savingRef.current) return;
    const initial = history.restoreInitial();
    setTailoring(null);
    setPendingEdit(false);
    setSaveError(null);
    if (initial) setDraft(initial.document);
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
      // Text fields keep the browser's normal undo while a line is being typed.
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
      event.preventDefault();
      moveHistory(key === 'y' || event.shiftKey ? 1 : -1);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [moveHistory]);

  async function save() {
    const sent = history.current?.document;
    if (!sent || !workspace || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setPdfSnapshot(null);
    let cvSaved = false;
    try {
      const saved = await resumeApi.saveQuick(jobId, sent, {
        resumeId: workspace.resumeId, sourceResumeId: workspace.sourceResumeId, theme,
      }, job ? `Quick tailoring for ${jobName(job)}` : 'Quick tailoring');
      if (!saved.resumeId) throw new Error('The CV could not be created.');
      setWorkspace(saved);
      setName(saved.name);
      setLoaded(saved.document);
      const savedEdit = history.acceptSaved(sent, saved.document, !workspace.resumeId);
      if (savedEdit) { setDraft(savedEdit.document); setSavedStep(savedEdit.id); }
      cvSaved = true;
      setCreatingPdf(true);
      await resumeApi.createPdf(saved.resumeId);
      setPdfSnapshot(saved.document.snapshot);
      setLayoutChanged(false);
      notifyResumesChanged(saved.resumeId);
      useResumeInExtension(saved.resumeId);
      return true;
    } catch (err) {
      setSaveError(`${cvSaved ? 'CV saved, but the PDF could not be created: ' : 'CV could not be saved: '}${(err as Error).message}`);
      return false;
    } finally {
      savingRef.current = false;
      setCreatingPdf(false);
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty && !pendingEdit && !saving) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pendingEdit, saving]);

  // The card opens over what its ✦ was pressed on, and follows it as the page changes.
  // It moves only when its line does: text typing into the card resizes it many times a
  // second, and redrawing the whole page each time made the card (and the CV) jump.
  const placed = useRef('');
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!tailoring || !el) return;
    let frame = 0;
    const place = () => {
      const line = tailoring.anchor.getBoundingClientRect();
      const view = el.getBoundingClientRect();
      // The card is the line (or the lines) turned into a screen: the first line's text sits
      // exactly where it is on the CV, in the CV's own type, and the menu continues below.
      const card = cardRef.current;
      const old = card?.querySelector<HTMLElement>('.qt-screen-before, .qt-screen-text, .qt-shimmer');
      const lift = card && old ? old.getBoundingClientRect().top - card.getBoundingClientRect().top : 34;
      const style = getComputedStyle(tailoring.anchor);
      const pad = 15;
      // Measured against the visible width: the card's own size must not move it.
      const width = Math.round(Math.min(el.clientWidth - 16, Math.max(line.width + 2 * pad, 460)));
      const left = Math.round(Math.min(Math.max(8, line.left - view.left + el.scrollLeft - pad), el.scrollLeft + el.clientWidth - width - 8));
      const top = Math.round(Math.max(0, line.top - view.top + el.scrollTop - lift));
      const lineHeight = parseFloat(style.lineHeight);
      const font = {
        fontFamily: style.fontFamily,
        fontSize: `${parseFloat(style.fontSize) * scale}px`,
        ...(Number.isFinite(lineHeight) && { lineHeight: `${lineHeight * scale}px` }),
      };
      const key = JSON.stringify([top, left, width, font]);
      if (key === placed.current) return;
      placed.current = key;
      setCardBox({ left, width, font });
      setCardTop(top);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    place();
    const observer = new ResizeObserver(schedule);
    observer.observe(tailoring.anchor);
    if (cardRef.current) observer.observe(cardRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [tailoring, draft, scale]);

  // A newly opened card, once at its line: its box takes the cursor without moving the page
  // (focusing it earlier scrolled to where the card was drawn first), then the card comes
  // into view only as far as needed.
  useEffect(() => {
    if (!tailoring) return;
    const frame = requestAnimationFrame(() => {
      cardRef.current?.querySelector<HTMLTextAreaElement>('.qt-request textarea')?.focus({ preventScroll: true });
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [tailoring?.run]);

  // While the mouse is over the card, the wheel scrolls only the card: at its end (or when it
  // has nothing to scroll) the page behind it stays still.
  const cardOpen = Boolean(tailoring);
  useEffect(() => {
    const card = cardRef.current;
    if (!cardOpen || !card) return;
    const canScroll = (el: HTMLElement, down: boolean) => {
      const { overflowY } = getComputedStyle(el);
      if (el !== card && !/(auto|scroll)/.test(overflowY) && el.tagName !== 'TEXTAREA') return false;
      return down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0;
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY || event.ctrlKey) return; // Pinch zoom stays the browser's.
      const down = event.deltaY > 0;
      for (let el = event.target as HTMLElement | null; el; el = el.parentElement) {
        if (canScroll(el, down)) return; // Something inside the card still scrolls this way.
        if (el === card) break;
      }
      event.preventDefault();
    };
    card.addEventListener('wheel', onWheel, { passive: false });
    return () => card.removeEventListener('wheel', onWheel);
  }, [cardOpen]);

  /** Sends the AI's suggestions for this card's lines into it as they arrive. */
  const updateItem = (run: number, key: string, patch: Partial<Suggestion>) =>
    setTailoring((current) => current && current.run === run
      ? { ...current, items: current.items.map((item) => item.key === key ? { ...item, ...patch } : item) } : current);

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api/resumes/${encodeURIComponent(contextId)}/${path}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? `The AI did not answer (${response.status}). Try again.`);
    return response.json() as Promise<T>;
  }

  async function tailorLine(run: number, item: Suggestion, request: string) {
    const { target } = item;
    updateItem(run, item.key, { busy: true, error: undefined, after: undefined, value: undefined, report: undefined });
    try {
      // The summary has its own writer: the summary instructions, checked in code.
      if (target.kind === 'summary') {
        const result = await post<SummaryReport & { summary: string }>('tailor-summary', {
          ...(request.trim() ? { instruction: request.trim().slice(0, 500) } : {}),
          job: { jobId },
        });
        const { summary, ...report } = result;
        updateItem(run, item.key, { busy: false, after: summary, value: summary, report });
        return;
      }
      const result = await post<{ suggestion: string; cannotDo: string[] }>('tailor-line', {
        text: target.text, kind: target.kind,
        ...(request.trim() ? { instruction: request.trim().slice(0, 500) } : {}),
        ...(target.context ? { context: target.context.slice(0, 1_000) } : {}),
        job: { jobId },
      });
      updateItem(run, item.key, { busy: false, after: result.suggestion, value: result.suggestion, cannotDo: result.cannotDo });
    } catch (err) {
      updateItem(run, item.key, { busy: false, error: (err as Error).message });
    }
  }

  /** Skills lines go together, so a skill brought in lands on one line only. */
  async function tailorSkills(run: number, items: Suggestion[], request: string) {
    for (const item of items) updateItem(run, item.key, { busy: true, error: undefined, after: undefined, value: undefined });
    const categories = new Set(items.map((item) => item.target.skills!.category));
    try {
      const result = await post<{ groups: Array<{ category: string; skills: string[]; added: string[]; dropped: string[] }>; cannotDo: string[] }>('tailor-skills', {
        groups: items.map((item) => ({ category: item.target.skills!.category, skills: item.target.skills!.names.filter((name) => name.trim()) })),
        elsewhere: (draftRef.current?.skills ?? []).filter((skill) => !categories.has((skill.category ?? '').trim())).map((skill) => skill.name).filter((name) => name.trim()),
        ...(request.trim() ? { instruction: request.trim().slice(0, 500) } : {}),
        job: { jobId },
      });
      for (const item of items) {
        const group = result.groups.find((g) => g.category === item.target.skills!.category);
        if (!group) { updateItem(run, item.key, { busy: false, error: 'No suggestion came back for this line. Try again.' }); continue; }
        updateItem(run, item.key, { busy: false, after: group.skills.join(', '), value: JSON.stringify(group.skills), added: group.added, dropped: group.dropped });
      }
      if (result.cannotDo.length) setTailoring((current) => current && current.run === run ? { ...current, notes: result.cannotDo } : current);
    } catch (err) {
      for (const item of items) updateItem(run, item.key, { busy: false, error: (err as Error).message });
    }
  }

  /**
   * ✦ on a line, a job or a section opens it: one line turns into a small screen
   * with the menu under it. Nothing is asked of the AI until Generate, so the
   * person can say what should change first.
   */
  function tailor(targets: RewriteTarget | RewriteTarget[], anchor: HTMLElement) {
    if (!jobId) return;
    const list = (Array.isArray(targets) ? targets : [targets])
      .filter((target) => target.kind === 'skills' || target.kind === 'summary' || target.text.trim());
    if (!list.length) return;
    const run = ++tailorRun.current;
    const items: Suggestion[] = list.map((target, index) => ({ key: `${run}:${index}`, target, busy: false, before: target.text }));
    setTailoring({ run, anchor, items, stage: 'compose', request: '' });
  }

  /** Generate (again): every line not yet used or skipped, four at a time, skills together. */
  async function generate(current: Tailoring | null = tailoring) {
    if (!current || current.items.some((item) => item.busy)) return;
    const { run, request } = current;
    const open = current.items.filter((item) => !item.decided);
    setTailoring({ ...current, stage: 'generated', notes: undefined });
    const skills = open.filter((item) => item.target.kind === 'skills');
    const lines = open.filter((item) => item.target.kind !== 'skills');
    const work: Promise<unknown>[] = [];
    if (skills.length) work.push(tailorSkills(run, skills, request));
    const queue = [...lines];
    const worker = async () => { for (let next = queue.shift(); next; next = queue.shift()) await tailorLine(run, next, request); };
    // Four lines at a time: each is a few seconds, and they do not wait on one another.
    work.push(worker(), worker(), worker(), worker());
    await Promise.all(work);
  }

  function retry(item: Suggestion) {
    if (!tailoring) return;
    if (item.target.kind === 'skills') void tailorSkills(tailoring.run, [item], tailoring.request);
    else void tailorLine(tailoring.run, item, tailoring.request);
  }

  /** Marks lines decided; the card closes when every line is. */
  function decide(keys: string[], decision: 'used' | 'skipped') {
    setTailoring((current) => {
      if (!current) return current;
      const items = current.items.map((item) => keys.includes(item.key) ? { ...item, decided: decision } : item);
      // A line still showing an error keeps the card open, so it can be tried again.
      return items.every((item) => item.decided || (!item.busy && !item.error && item.after?.trim() === item.before.trim())) ? null : { ...current, items };
    });
  }

  /** Puts suggestions in the draft as one step, so one Undo takes them all back. */
  function use(items: Suggestion[]) {
    const ready = items.filter(isReady);
    if (!ready.length) return;
    change((d) => { for (const item of ready) item.target.apply(item.value!, d); }, true);
    decide(ready.map((item) => item.key), 'used');
  }

  // While the AI works: a running timer in the card, and the part being tailored pulses on the CV.
  const working = Boolean(tailoring?.items.some((item) => item.busy));
  const elapsed = useElapsed(working);
  const workingAnchor = working ? tailoring?.anchor : undefined;
  useEffect(() => {
    if (!workingAnchor) return;
    workingAnchor.classList.add('qt-working');
    return () => workingAnchor.classList.remove('qt-working');
  }, [workingAnchor]);

  if (!jobId) return <div className="studio-message"><h1>Quick tailoring</h1><p className="error">Open this page from a job: the job is missing.</p></div>;
  if (error) return <div className="studio-message"><h1>Quick tailoring</h1><p className="error">{error}</p></div>;
  if (!draft) return <div className="studio-message"><h1>Quick tailoring</h1><p className="muted">Loading…</p></div>;

  const pdfReady = !dirty && !pendingEdit && !layoutChanged && pdfSnapshot === draft.snapshot;
  const status = saving ? creatingPdf ? 'Creating PDF…' : 'Saving CV…'
    : saveError ? 'Save failed' : !resumeId ? 'Unsaved CV draft' : dirty || pendingEdit || layoutChanged ? 'Unsaved changes' : pdfReady ? 'CV and PDF saved' : 'Click Save to create the PDF';
  // A section's delete takes it off this CV; it comes back with "Show". Saved with the CV.
  const hidden = theme.hiddenSections ?? [];
  const setHidden = (next: string[]) => {
    setWorkspace((current) => current && { ...current, theme: { ...designOf(current.theme), hiddenSections: next } });
    setLayoutChanged(true);
  };
  const sectionName = (key: string) => key.startsWith('custom:')
    ? draft.customSections?.find((section) => `custom:${section.lineageId}` === key)?.title || 'Section'
    : ({ summary: 'Professional Summary', experience: 'Professional Experience', projects: 'Projects', skills: 'Skills', education: 'Education', certifications: 'Certifications' } as Record<string, string>)[key] ?? key;
  const matched = score?.keywords?.matched ?? [];
  const missing = score?.keywords?.missing ?? [];
  const skills = new Set(draft.skills.map((skill) => skill.name.toLowerCase()));
  const waiting = tailoring?.items.filter((item) => item.busy).length ?? 0;
  const ready = tailoring?.items.filter(isReady) ?? [];
  const many = (tailoring?.items.length ?? 0) > 1;
  /** Use / Skip / Try again / Dismiss for one suggestion, once it has come back. */
  const itemActions = (item: Suggestion) => {
    if (item.decided) return null;
    const same = item.after !== undefined && item.after.trim() === item.before.trim();
    return (
      <div className="ra-row qt-actions">
        {(item.after !== undefined || item.busy) && (
          <button className="primary" disabled={same || saving || item.busy} onClick={() => use([item])}>{same ? (item.target.kind === 'skills' ? 'Nothing new to add' : 'Already fits') : many ? 'Use' : 'Use this'}</button>
        )}
        {many && item.after !== undefined && !same && <button className="ghost" onClick={() => decide([item.key], 'skipped')}>Skip</button>}
        <button className="ghost" disabled={saving || item.busy} onClick={() => retry(item)}>Try again</button>
        {!many && <button className="ghost" onClick={() => setTailoring(null)}>Dismiss</button>}
      </div>
    );
  };

  return (
    <div className="studio qt"
      onInputCapture={(event) => { if (event.target instanceof HTMLElement && event.target.isContentEditable) setPendingEdit(true); }}
      onBlurCapture={() => setPendingEdit(false)}>
      <header className="studio-bar">
        {popup ? (
          <nav className="studio-crumb">
            <b>Quick tailoring</b>
            <span className="sep">·</span>
            <span className="qt-name">{name}</span>
          </nav>
        ) : (
          <nav className="studio-crumb">
            <Link to="/documents" onClick={(event) => { if (dirty && !confirm('Discard your unsaved changes?')) event.preventDefault(); }}>Documents</Link>
            <span className="sep">›</span>
            <b className="qt-name">{name}</b>
            <span className="sep">›</span>
            <span>Quick tailoring</span>
          </nav>
        )}
        <span className={`studio-status${saveError ? ' bad' : ''}`} title={saveError ?? undefined}>{status}</span>
        <span className="studio-actions">
          <span className="qt-history" role="group" aria-label="Change history">
            <button type="button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" aria-keyshortcuts="Control+Z Meta+Z"
              disabled={saving || (!history.canUndo && !pendingEdit)} onClick={() => moveHistory(-1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 4-5 5 5 5M4 9h9a7 7 0 0 1 7 7" /></svg>Undo
            </button>
            <button type="button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z or Ctrl Y)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
              disabled={saving || pendingEdit || !history.canRedo} onClick={() => moveHistory(1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5-5 5M20 9h-9a7 7 0 0 0-7 7" /></svg>Redo
            </button>
            <button type="button" aria-label="Reset changes" title="Reset all edits from this tailoring session"
              disabled={saving || (!history.canReset && !pendingEdit)} onClick={resetChanges}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /></svg>Reset
            </button>
          </span>
          {!resumeId
            ? <button className="ghost" disabled title="Save this CV before opening the full editor.">Open full editor</button>
            : popup
              ? <a className="ghost" href={`/documents/${resumeId}?job=${encodeURIComponent(jobId)}`} target="_blank" rel="noreferrer">Open full editor</a>
              : <Link className="ghost" to={`/documents/${resumeId}?job=${encodeURIComponent(jobId)}`}
                  onClick={(event) => { if (dirty && !confirm('Discard your unsaved changes?')) event.preventDefault(); }}>Open full editor</Link>}
          <button className="primary" disabled={saving} onClick={() => void save()}>
            {saving ? creatingPdf ? 'Creating PDF…' : 'Saving…' : 'Save'}
          </button>
          {pdfReady && !saving
            ? <a className="ghost" href={`/api/resumes/${resumeId}/pdf?download=1`}>Export PDF</a>
            : <button className="ghost" disabled title="Click Save to create the PDF first.">Export PDF</button>}
          {popup && (
            <button className="ghost" disabled={saving} title="Close this window" onClick={() => window.close()}>Close</button>
          )}
        </span>
      </header>
      {saveError && (
        <div className="studio-held bad"><span>{saveError}</span><button className="ghost" disabled={saving} onClick={() => void save()}>Try again</button></div>
      )}

      <div className="qt-body">
        <main className="qt-canvas" ref={canvas}>
          {hidden.length > 0 && (
            <div className="qt-hidden" role="status">
              <span>Hidden from this CV:</span>
              {hidden.map((key) => (
                <span key={key} className="qt-hidden-item">
                  {sectionName(key)}
                  <button type="button" className="ghost small" disabled={saving} onClick={() => setHidden(hidden.filter((item) => item !== key))}>Show</button>
                </span>
              ))}
            </div>
          )}
          <ScaledPage className="qt-zoom" scale={scale}>
            <PagedDocument watch={pagedWatch}>
              <ResumeDocument resumeId={contextId} resume={draft} theme={theme} readOnly={saving} onChange={change} onTailor={(target, anchor) => void tailor(target, anchor)}
                onHideSection={(key) => setHidden([...new Set([...hidden, key])])} />
            </PagedDocument>
          </ScaledPage>

          {tailoring && (() => {
            // ✦ turns what it was pressed on into a small screen over it: each line as it is,
            // then the AI's version typed in under it. The menu continues right below, as one piece.
            const composing = tailoring.stage === 'compose';
            const solo = many ? null : tailoring.items[0]!;
            const company = job?.company || (job ? jobName(job) : 'the job');
            const forJob = job ? jobName(job) : 'the job';
            const title = waiting > 0 ? `Writing for ${company}…`
              : many ? `${tailoring.items.length} lines · ${composing ? 'for' : 'tailored for'} ${forJob}`
                : `${KIND_NAMES[solo!.target.kind] ?? 'Line'} · ${composing ? 'for' : 'tailored for'} ${forJob}`;
            return (
              <div className="qt-card qt-unit" ref={cardRef} role="dialog" aria-label={many ? 'AI versions of these lines' : 'AI version of this line'}
                style={{ top: cardTop, ...(cardBox && { left: cardBox.left, width: cardBox.width }) }}>
                <div className="qt-screen" style={cardBox?.font}>
                  <div className="qt-screen-label">
                    <span className={`qt-dot${waiting > 0 ? ' busy' : ''}`} aria-hidden="true" />
                    <span className="qt-screen-title">{title}</span>
                    {waiting > 0 && <span className="qt-elapsed">{elapsed}s</span>}
                    <button className="qt-close" title="Close" aria-label="Close" onClick={() => setTailoring(null)}>×</button>
                  </div>
                  {tailoring.items.map((item) => {
                    const before = unmarked(item.before).trim();
                    return (
                      <div key={item.key} className={`qt-screen-line${item.decided ? ` is-${item.decided}` : ''}`}>
                        {many && <p className="qt-screen-line-label">{item.target.label ?? 'Line'}{item.decided && <span> · {item.decided === 'used' ? 'Used' : 'Skipped'}</span>}</p>}
                        {before ? <div className={`qt-screen-before${composing ? ' is-current' : ''}`}>{before}</div>
                          : composing && <div className="qt-screen-text qt-screen-empty">A new summary, written from your CV.</div>}
                        {composing ? null : item.busy ? <div className="qt-shimmer qt-shimmer-line" aria-hidden="true">{before || 'A new version is being written for this job.'}</div>
                          : item.error ? <p className="ra-error">{item.error}</p>
                            : item.after !== undefined ? <div className="qt-screen-text"><TypedLine key={item.after} text={item.after} /></div>
                              : null}
                        {many && !composing && itemActions(item)}
                        {many && !item.busy && item.after !== undefined && (
                          <>
                            {item.added?.length ? <p className="qt-note">+ From your CV: {item.added.join(', ')}</p> : null}
                            {item.dropped?.length ? <p className="qt-note">− Left out for this job: {item.dropped.join(', ')}</p> : null}
                            {item.cannotDo?.map((note, index) => <p key={index} className="qt-note">⚠ {note}</p>)}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="qt-menu">
                  {composing ? (
                    <div className="ra-row qt-actions">
                      <button className="primary qt-generate" disabled={saving} onClick={() => void generate()} title="Ctrl/⌘ Enter">✦ Generate</button>
                      <button className="ghost" onClick={() => setTailoring(null)}>Dismiss</button>
                    </div>
                  ) : many ? (
                    <div className="ra-row qt-actions">
                      <button className="primary" disabled={!ready.length || saving} onClick={() => use(ready)}>Use all{ready.length ? ` ${ready.length}` : ''}</button>
                      <button className="ghost" disabled={waiting > 0 || saving} onClick={() => void generate()}>✦ Generate again</button>
                      <button className="ghost" onClick={() => setTailoring(null)}>Close</button>
                    </div>
                  ) : itemActions(solo!)}
                  {waiting > 0 && (many || (solo!.target.kind !== 'bullet' && solo!.target.kind !== 'blurb' && solo!.target.kind !== 'headline')) && (
                    <WorkingStatus seconds={elapsed}
                      summary={tailoring.items.some((item) => item.busy && item.target.kind === 'summary')}
                      skills={tailoring.items.some((item) => item.busy && item.target.kind === 'skills')}
                      progress={many ? `Tailoring… ${tailoring.items.length - waiting} of ${tailoring.items.length} ready.` : null} />
                  )}
                  {/* Several lines: the progress line stays when done, so the menu does not move up. */}
                  {waiting === 0 && many && !composing && (
                    <p className="qt-working-status qt-working-done" role="status"><span>{tailoring.items.length} lines ready. Use each one, or all at once.</span></p>
                  )}
                  {tailoring.notes?.map((note, index) => <p key={index} className="qt-note">⚠ Not added: {note}</p>)}
                  {solo && !solo.busy && solo.after !== undefined && (
                    <>
                      {solo.report && <SummaryReportView report={solo.report} />}
                      {solo.added?.length ? <p className="qt-note">+ From your CV: {solo.added.join(', ')}</p> : null}
                      {solo.dropped?.length ? <p className="qt-note">− Left out for this job: {solo.dropped.join(', ')}</p> : null}
                      {solo.cannotDo?.map((note, index) => <p key={index} className="qt-note">⚠ {note}</p>)}
                    </>
                  )}
                  <label className="qt-request">
                    <span>What should change? <small>{composing || many ? '(optional)' : '(optional, then Try again)'}</small></span>
                    <textarea rows={2} maxLength={500} value={tailoring.request}
                      placeholder="e.g. shorter, lead with the payments work"
                      onChange={(e) => { const request = e.target.value; setTailoring((t) => t && { ...t, request }); }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || waiting > 0) return;
                        e.preventDefault();
                        if (composing || many) void generate(); else retry(solo!);
                      }} />
                  </label>
                  <div className="chips">
                    {REQUESTS.map((request) => (
                      <button key={request} type="button" onClick={() => setTailoring((t) => t && { ...t, request: t.request.trim() ? `${t.request.trim()}; ${request.toLowerCase()}` : request })}>{request}</button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </main>

        <aside className="qt-job">
          <JobAssessment jobId={jobId} />
          <section className="ra-card">
            <h3>Resume Score</h3>
            {score?.score !== null && score?.score !== undefined ? (
              <>
                <div className="ra-score"><Gauge score={score.score} /></div>
                <p className="ra-muted center">Mentions {matched.length} of {matched.length + missing.length} keywords from the job</p>
                <div className="ra-keywords">
                  {matched.map((kw) => <span key={kw} className="ra-kw have" tabIndex={0} {...keywordCard(kw)}>✓ {kw}</span>)}
                  {missing.map((kw) => <span key={kw} className="ra-kw miss" tabIndex={0} {...keywordCard(kw)}>{kw}</span>)}
                </div>
                {missing.some((kw) => !skills.has(kw.toLowerCase())) && (
                  <div className="qt-missing">
                    <p className="ra-muted">Add to Skills only the ones you have used:</p>
                    <div className="sf-chips">
                      {missing.filter((kw) => !skills.has(kw.toLowerCase())).map((kw) => (
                        <button key={kw} className="qt-add-skill" disabled={saving}
                          onClick={() => change((d) => { d.skills.push({ lineageId: newId(), name: kw, category: '' }); })}>
                          + {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : <p className="ra-muted">{score ? 'This job names none of the skills we look for.' : 'Scoring…'}</p>}
          </section>
          <section className="ra-card">
            <h3>{job ? jobName(job) : 'The job'}</h3>
            {job?.company && <p className="ra-muted">{job.company}</p>}
            <div className="qt-description">
              {job?.description ? highlight(job.description, matched, missing) : <span className="ra-muted">This job has no description yet.</span>}
            </div>
          </section>
          {keywordCards.card}
        </aside>
      </div>
    </div>
  );
}

/**
 * Opened by the extension's Quick Tailor button. Preview is read-only on the
 * backend: the document, its first version and its PDF wait for Save.
 */
export function QuickTailorStart({ popup = false }: { popup?: boolean }) {
  return <QuickTailor popup={popup} jobRoute />;
}
