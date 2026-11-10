import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BulletMeter } from '../resume/BulletMeter';
import { MarkedLine } from '../text/Marked';
import { boldOnly } from '../text/marks';
import { withTechStacks } from '../resume/techStack';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { jobName, jobsApi, type JobDetail } from '../jobsApi';
import { resumeApi, type QuickTailoringDraft, type RenderedResume } from '../resumeApi';
import { DiffText } from '../resume/DiffText';
import { lineDiff } from '../resume/lineDiff';
import { recruiterFlags } from '../resume/readability';
import { closeEmbed, downloadFromApi, embedded } from '../embed';
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
import './quick-tailor-theme.css';
import { AiBadge } from '../profile/AiBox';

const PAGE_WIDTH = 794;
/** The canvas's padding, left and right (see .qt-canvas): the right one holds the lines' buttons. */
const CANVAS_GUTTERS = 24 + 48;
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
  /** A job's bullet chosen from the Profile: which achievement, as written there, and where it came from. */
  chosenId?: string;
  original?: string;
  fromProfile?: boolean;
  fromSavedCv?: boolean;
  /** Alternatives belong to this generation batch and cannot cross role boundaries. */
  choiceGroup?: string;
  /** A bullet the job gains for this posting: shown after this line of the page. */
  insertAfter?: string;
}

/** A job's bullet the posting does not need: "Use" takes it off. */
const isRemoval = (item: Suggestion) => item.target.kind === 'bullet' && item.after === '' && Boolean(item.before.trim());
/** A bullet the job gains: nothing there before. */
const isAddition = (item: Suggestion) => item.insertAfter !== undefined;

/** An achievement chosen for a job from the Profile and the CV (see tailor-role). */
interface ChosenBullet {
  id: string;
  text: string;
  original: string;
  source: 'cv' | 'profile' | 'saved-cv';
  cvIndex: number | null;
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

/** "**Kafka**" in bold, as it will print. */
/** A line as the CV shows it: bold, italic, underline and links. */
const withBold = (text: string) => <MarkedLine text={text} />;

/**
 * The new version as a change of the old: what was taken out in red and crossed out, what
 * was put in in green. It types itself in, holding its finished size from the first letter.
 */
function DiffLine({ before, after }: { before: string; after: string }) {
  const pieces = useMemo(() => lineDiff(before, after), [before, after]);
  const total = pieces.reduce((sum, piece) => sum + piece.text.length + (piece.space ? 1 : 0), 0);
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(still ? total : 0);
  useEffect(() => {
    if (still) { setShown(total); return; }
    setShown(0);
    const timer = window.setInterval(() => setShown((count) => {
      if (count >= total) { window.clearInterval(timer); return count; }
      return Math.min(total, count + 3);
    }), 14);
    return () => window.clearInterval(timer);
  }, [pieces, total, still]);
  const draw = (limit: number) => {
    let left = limit;
    return pieces.map((piece, index) => {
      if (left <= 0) return null;
      // The space before a word joins its highlight only when the word before has the same one.
      const joined = piece.space && pieces[index - 1]?.op === piece.op;
      const lead = piece.space && !joined ? ' ' : '';
      const body = `${joined ? ' ' : ''}${piece.text}`;
      const shownLead = lead.slice(0, left);
      left -= lead.length;
      const shownBody = body.slice(0, Math.max(0, left));
      left -= body.length;
      const text = piece.bold ? <b>{shownBody}</b> : shownBody;
      return <Fragment key={index}>{shownLead}{piece.op === 'same' ? text : <span className={`qt-${piece.op}`}>{text}</span>}</Fragment>;
    });
  };
  if (shown >= total) return <>{draw(total)}</>;
  return (
    <span className="qt-typing">
      <span className="qt-typing-room" aria-hidden="true">{draw(total)}</span>
      <span className="qt-typing-live">{draw(shown)}<span className="qt-caret" aria-hidden="true" /></span>
    </span>
  );
}

/** What the card covers on the CV: the line, or a whole job or section for several lines. */
const regionOf = (anchor: HTMLElement, many: boolean) =>
  many ? anchor.closest<HTMLElement>('article') ?? anchor.closest<HTMLElement>('.doc-section') ?? anchor : anchor;

/**
 * A still copy of the CV part under the card, drawn exactly as on the page (same template
 * styles, same zoom), so the window can scroll through a whole job while the page holds.
 */
function copyOfRegion(region: HTMLElement, scale: number, live = false): HTMLElement {
  let copy = region.cloneNode(true) as HTMLElement;
  copy.classList.remove('qt-behind');
  // A live copy holds the new versions and their buttons: the page's own controls go.
  if (live) copy.querySelectorAll('button, .doc-bulletmeta, .doc-add, .doc-remove').forEach((el) => el.remove());
  copy.style.margin = '0';
  copy.style.width = `${region.offsetWidth}px`;
  copy.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  // Its parents up to the page, empty and without their own spacing: the template's styles
  // (".page.tpl-professional .doc-bullets li", "[data-section] article") still apply to it.
  const top = region.closest<HTMLElement>('.paged') ?? region.closest<HTMLElement>('.page');
  for (let el = region.parentElement; el && top && top.contains(el); el = el.parentElement) {
    const shell = el.cloneNode(false) as HTMLElement;
    shell.removeAttribute('id');
    shell.style.cssText += ';margin:0;padding:0;border:0;min-height:0;height:auto;width:auto;box-shadow:none;background:transparent;';
    shell.append(copy);
    copy = shell;
  }
  const zoom = document.createElement('div');
  if (live) {
    // Its height follows what is written into it: zoomed rather than transformed.
    zoom.className = 'qt-copy is-live';
    zoom.style.cssText = `width:${region.offsetWidth}px;zoom:${scale};`;
    zoom.append(copy);
    return zoom;
  }
  zoom.style.cssText = `width:${region.offsetWidth}px;transform:scale(${scale});transform-origin:top left;`;
  zoom.append(copy);
  const sizer = document.createElement('div');
  sizer.className = 'qt-copy';
  sizer.style.cssText = `width:${region.offsetWidth * scale}px;height:${region.offsetHeight * scale}px;`;
  sizer.append(zoom);
  return sizer;
}

/** The CV's zoom: 50% to 200% in steps of 10%, or fit to the window (null). */
const ZOOM_KEY = 'quick-tailoring-zoom';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

/** The window's margin above and below the CV lines it shows. */
const WINDOW_PAD = 4;

/** Lines read by a recruiter as prose: checked for tool names and unknown acronyms. */
const READ_AS_PROSE = new Set(['bullet', 'blurb']);

/** What the line is, for the screen's label. */
const KIND_NAMES: Record<string, string> = { summary: 'Summary', bullet: 'Bullet', blurb: 'Job description', headline: 'Headline', skills: 'Skills', techStack: 'Tech stack' };

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
  /** A job's next-best achievements, for Swap. */
  alternates?: Record<string, ChosenBullet[]>;
}

/** One-click requests for the card's box. */
const REQUESTS = ["Use the job's keywords", 'Shorter', 'Lead with the result', 'More technical'];

/** Lines the CV shows as a list item, with its "-" marker and hanging indent. */
const LISTED = new Set(['bullet', 'skills']);
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
  /** Close was pressed with unsaved changes: the header asks before anything is lost. */
  const [closing, setClosing] = useState(false);
  /** The window this runs in: a popup window, or CV Autofill's window inside a job page. */
  const closeWindow = () => { if (embedded) closeEmbed(); else window.close(); };
  const [tailoring, setTailoring] = useState<Tailoring | null>(null);
  const [cardTop, setCardTop] = useState(0);
  /** One line's card sits over that line: its left edge, width and the CV's type at this zoom. */
  const [cardBox, setCardBox] = useState<{ left: number; width: number; font: React.CSSProperties; window: number } | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const tailorRun = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<RenderedResume | null>(null);

  useEffect(() => {
    let active = true;
    if (!jobId) return;
    Promise.all([resumeApi.previewQuick(jobId, sourceId), jobsApi.get(jobId)]).then(
      ([prepared, detail]) => {
        if (!active) return;
        setWorkspace(prepared);
        // A "Tech stack:" bullet becomes the job's tech stack, so it is tailored as a list.
        withTechStacks(prepared.document);
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
  // The canvas keeps 24px on the left and 48px on the right, where the lines' buttons sit.
  const fitScale = canvasWidth ? Math.min(1, Math.max(0.5, (canvasWidth - CANVAS_GUTTERS) / PAGE_WIDTH)) : 1;
  // Zoom: "fit" follows the window; a chosen size (50% to 200%) stays, in this browser.
  const [zoom, setZoomState] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(ZOOM_KEY));
      return saved >= ZOOM_MIN && saved <= ZOOM_MAX ? saved : null;
    } catch {
      return null;
    }
  });
  const setZoom = (next: number | null) => {
    const value = next === null ? null : Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10;
    setZoomState(value);
    try {
      if (value === null) localStorage.removeItem(ZOOM_KEY);
      else localStorage.setItem(ZOOM_KEY, String(value));
    } catch {
      /* Only a convenience. */
    }
  };
  const scale = zoom ?? fitScale;

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

  /** The name being typed; a name chosen before the first Save is given to the CV when it is saved. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const chosenName = useRef<string | null>(null);
  async function renameSaved(resumeId: string, next: string) {
    const response = await fetch(`/api/resumes/${encodeURIComponent(resumeId)}/name`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: next }),
    });
    if (!response.ok) throw new Error(`${response.status}`);
    notifyResumesChanged(resumeId);
  }
  async function rename() {
    const next = renaming?.trim();
    setRenaming(null);
    if (!next || next === name) return;
    const before = name;
    setName(next);
    if (!workspace?.resumeId) {
      chosenName.current = next;
      return;
    }
    try {
      await renameSaved(workspace.resumeId, next);
    } catch {
      setName(before);
      setSaveError('Could not rename the CV.');
    }
  }

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
      // A name chosen before this first Save goes to the new CV.
      const wanted = chosenName.current;
      if (wanted && wanted !== saved.name) {
        chosenName.current = null;
        try {
          await renameSaved(saved.resumeId, wanted);
          setName(wanted);
        } catch {
          setSaveError('Saved, but the new name could not be set. Rename it again.');
        }
      }
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
  const heldFrame = useRef<{ run: number; scale: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!tailoring || !el) return;
    let frame = 0;
    const place = () => {
      const line = tailoring.anchor.getBoundingClientRect();
      const view = el.getBoundingClientRect();
      // The card is the line (or the lines) turned into a screen: the first line's text sits
      // exactly where it is on the CV, in the CV's own type, and the menu continues below.
      // Before the new version is back, the screen is a window onto the CV itself: the line, or
      // the whole job or section, shows through it. A job's lines then sit from the job's top.
      const card = cardRef.current;
      const many = tailoring.items.length > 1;
      const region = regionOf(tailoring.anchor, many);
      const area = region.getBoundingClientRect();
      const pane = card?.querySelector<HTMLElement>('.qt-window');
      const frame = pane ?? card?.querySelector<HTMLElement>('.qt-screen-body');
      const first = frame ?? card?.querySelector<HTMLElement>('.qt-screen-before, .qt-screen-text');
      const lift = card && first ? first.getBoundingClientRect().top - card.getBoundingClientRect().top + (frame ? WINDOW_PAD : 0) : 34;
      const style = getComputedStyle(tailoring.anchor);
      // The screen's padding and the card's border: the text inside starts where the CV's does.
      const pad = 15 + (card ? parseFloat(getComputedStyle(card).borderLeftWidth) || 0 : 0);
      // Measured against the visible width: the card's own size must not move it.
      const width = Math.round(Math.min(el.clientWidth - 16, Math.max(line.width + 2 * pad, 460)));
      const left = Math.min(Math.max(8, line.left - view.left + el.scrollLeft - pad), el.scrollLeft + el.clientWidth - width - 8);
      const top = Math.round(Math.max(0, (pane || many ? area.top : line.top) - view.top + el.scrollTop - lift));
      // The frame keeps the height it opened with while the card is open (using a line changes
      // the CV under it), unless the zoom changes.
      const held = heldFrame.current;
      const windowHeight = held && held.run === tailoring.run && held.scale === scale ? held.height : Math.round(area.height + 2 * WINDOW_PAD);
      heldFrame.current = { run: tailoring.run, scale, height: windowHeight };
      const lineHeight = parseFloat(style.lineHeight);
      // The text is set as on the CV: a bullet's marker and hanging indent, the column's width
      // (so lines break at the same words), the alignment (the summary is justified) and spacing.
      const anchor = tailoring.anchor;
      const item = anchor.matches('li') ? anchor : anchor.closest('article, .doc-section')?.querySelector<HTMLElement>('.doc-bullets li') ?? null;
      const text = (item ?? anchor).querySelector<HTMLElement>('.pro-text, [contenteditable]') ?? anchor;
      const textStyle = getComputedStyle(text);
      const indent = item ? Math.max(0, Math.round(text.getBoundingClientRect().left - item.getBoundingClientRect().left)) : 0;
      const mark = item ? (parseFloat(getComputedStyle(item, '::before').left) || 0) * scale : 0;
      const font = {
        fontFamily: style.fontFamily,
        fontSize: `${parseFloat(style.fontSize) * scale}px`,
        ...(Number.isFinite(lineHeight) && { lineHeight: `${lineHeight * scale}px` }),
        textAlign: textStyle.textAlign,
        letterSpacing: textStyle.letterSpacing,
        wordSpacing: textStyle.wordSpacing,
        hyphens: textStyle.hyphens,
        '--qt-column': `${Math.round(line.width)}px`,
        '--qt-indent': `${indent}px`,
        '--qt-mark': `${mark}px`,
      } as React.CSSProperties;
      const key = JSON.stringify([top, left, width, font, windowHeight]);
      if (key === placed.current) return;
      placed.current = key;
      setCardBox({ left, width, font, window: windowHeight });
      setCardTop(top);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    place();
    const observer = new ResizeObserver(schedule);
    observer.observe(tailoring.anchor);
    const region = regionOf(tailoring.anchor, tailoring.items.length > 1);
    if (region !== tailoring.anchor) observer.observe(region);
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

  /** The other bullets (and description) of a bullet's job, as the draft has them now. */
  function neighboursOf(target: RewriteTarget): string[] {
    const role = draftRef.current?.experiences.find((entry) =>
      entry.company === target.role?.company && entry.title === target.role?.title && entry.from === target.role?.from);
    if (!role) return [];
    return [role.blurb ?? '', ...role.achievements.map((item) => item.bullet)]
      .map((line) => line.trim())
      .filter((line) => line && line !== target.text.trim())
      .slice(0, 40);
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
        // A bullet chosen from the Profile is reworded from the achievement as written there.
        text: item.original ?? target.text, kind: target.kind,
        ...(request.trim() ? { instruction: request.trim().slice(0, 500) } : {}),
        // A tech stack is sent with the job's own lines, the only place a tool may come from.
        ...(target.context ? { context: target.context.slice(0, target.kind === 'techStack' ? 8_000 : 1_000) } : {}),
        // A bullet's neighbours: the job's other lines, which the rewrite must not repeat.
        ...(target.kind === 'bullet' && target.role ? { others: neighboursOf(target) } : {}),
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

  /**
   * One role's selected bullets, chosen from Profile facts and matching saved CVs.
   * Selected CV bullets keep their positions; other evidence fills the remaining slots.
   * Without additional evidence, each selected line is tailored on its own.
   */
  async function tailorRoleBullets(run: number, items: Suggestion[], request: string): Promise<boolean> {
    const role = items[0]?.target.role;
    if (!role) return false;
    const choiceGroup = items.map(item => item.key).join('|');
    for (const item of items) updateItem(run, item.key, { busy: true, error: undefined, after: undefined, value: undefined, chosenId: undefined, fromProfile: undefined, fromSavedCv: undefined, original: undefined });
    try {
      // The whole job: the posting decides how many bullets it gets.
      const { position, ...roleFields } = role;
      const whole = items.length > 1 && position !== undefined;
      const result = await post<{ matched: boolean; chosen: ChosenBullet[]; alternates: ChosenBullet[] }>('tailor-role', {
        role: { ...roleFields, bullets: items.map((item) => item.target.text) },
        ...(request.trim() ? { instruction: request.trim().slice(0, 500) } : {}),
        job: { jobId },
        ...(whole ? { position } : {}),
      });
      // An older job the posting does not need may get none: each of its bullets is offered for removal.
      if (!result.matched || (!result.chosen.length && !whole)) return false;
      const slots: (ChosenBullet | undefined)[] = items.map(() => undefined);
      for (const chosen of result.chosen)
        if (chosen.cvIndex !== null && chosen.cvIndex < slots.length && !slots[chosen.cvIndex]) slots[chosen.cvIndex] = chosen;
      const rest = result.chosen.filter((chosen) => !slots.includes(chosen));
      for (let i = 0; i < slots.length; i++) if (!slots[i]) slots[i] = rest.shift();
      const picked = (chosen: ChosenBullet) => ({ busy: false, after: chosen.text, value: chosen.text, chosenId: chosen.id, choiceGroup,
        fromProfile: chosen.source === 'profile', fromSavedCv: chosen.source === 'saved-cv', original: chosen.original });
      // More than the CV shows: new bullets after the job's last one, each added on its own.
      const last = items[items.length - 1]!;
      const added: Suggestion[] = whole && last.target.append ? rest.map((chosen, index) => ({
        key: `${last.key}:add:${crypto.randomUUID()}:${index}`,
        target: { ...last.target, text: '', label: `${role.company || 'Job'} · new bullet`, key: undefined, apply: last.target.append! },
        before: '',
        insertAfter: last.target.key,
        ...picked(chosen),
      })) : [];
      setTailoring((current) => (current && current.run === run
        ? { ...current, items: [...current.items.filter((item) => item.decided || !item.key.startsWith(`${last.key}:add:`)), ...added],
            alternates: { ...current.alternates, [choiceGroup]: result.alternates } } : current));
      items.forEach((item, i) => {
        const chosen = slots[i];
        // Fewer than the CV shows: the bullets left over are offered for removal.
        updateItem(run, item.key, chosen ? picked(chosen)
          : whole ? { busy: false, after: '', value: '', choiceGroup }
          : { busy: false, after: item.before, value: item.before });
      });
      return true;
    } catch (err) {
      for (const item of items) updateItem(run, item.key, { busy: false, error: (err as Error).message });
      return true;
    }
  }

  /** Swap: the next-best achievement in this bullet's place; the one it replaces goes back to the list. */
  function swap(item: Suggestion) {
    setTailoring((current) => {
      const choices = current?.alternates?.[item.choiceGroup ?? ''];
      if (!current || !choices?.length) return current;
      const [next, ...rest] = choices;
      const back: ChosenBullet[] = item.chosenId && item.after
        ? [{ id: item.chosenId, text: item.after, original: item.original ?? item.before, source: item.fromProfile ? 'profile' : item.fromSavedCv ? 'saved-cv' : 'cv', cvIndex: null }]
        : [];
      return {
        ...current,
        alternates: { ...current.alternates, [item.choiceGroup!]: [...rest, ...back] },
        items: current.items.map((row) => row.key === item.key
          ? { ...row, after: next!.text, value: next!.text, chosenId: next!.id, fromProfile: next!.source === 'profile', fromSavedCv: next!.source === 'saved-cv', original: next!.original, cannotDo: undefined, error: undefined }
          : row),
      };
    });
  }

  /** Generate (again): every line not yet used or skipped, four at a time, skills together. */
  async function generate(current: Tailoring | null = tailoring) {
    if (!current || current.items.some((item) => item.busy)) return;
    const { run, request } = current;
    // New bullets not yet added are chosen again with their job.
    const open = current.items.filter((item) => !item.decided && !isAddition(item));
    setTailoring({ ...current, stage: 'generated', notes: undefined, items: current.items.filter((item) => item.decided || !isAddition(item)) });
    const skills = open.filter((item) => item.target.kind === 'skills');
    const lines = open.filter((item) => item.target.kind !== 'skills');
    // Keep each employer/client's evidence separate, including when tailoring the whole section.
    const bullets = lines.filter((item) => item.target.kind === 'bullet' && item.target.role);
    const byRole = new Map<string, Suggestion[]>();
    for (const item of bullets) {
      const role = item.target.role!;
      const key = JSON.stringify([role.company, role.client ?? '', role.title, role.from]);
      byRole.set(key, [...(byRole.get(key) ?? []), item]);
    }
    const work: Promise<unknown>[] = [];
    if (skills.length) work.push(tailorSkills(run, skills, request));
    // Four lines at a time: each is a few seconds, and they do not wait on one another.
    const eachLine = (list: Suggestion[]) => {
      const queue = [...list];
      const worker = async () => { for (let next = queue.shift(); next; next = queue.shift()) await tailorLine(run, next, request); };
      return Promise.all([worker(), worker(), worker(), worker()]);
    };
    work.push(eachLine(lines.filter((item) => !bullets.includes(item))));
    for (const group of byRole.values())
      work.push(tailorRoleBullets(run, group, request).then((chosen) => (chosen ? undefined : eachLine(group))));
    await Promise.all(work);
  }

  function retry(item: Suggestion) {
    if (!tailoring) return;
    if (item.target.kind === 'skills') void tailorSkills(tailoring.run, [item], tailoring.request);
    else if (item.target.kind === 'bullet' && item.target.role) {
      const { run, request } = tailoring;
      void tailorRoleBullets(run, [item], request).then(chosen => chosen ? undefined : tailorLine(run, item, request));
    } else void tailorLine(tailoring.run, item, tailoring.request);
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

  // The part of the CV under the card holds still while it is open: no hover outline and no
  // editing buttons showing through the window, and nothing there to click by accident.
  const behind = tailoring ? regionOf(tailoring.anchor, tailoring.items.length > 1) : null;
  useEffect(() => {
    if (!behind) return;
    behind.classList.add('qt-behind');
    return () => behind.classList.remove('qt-behind');
  }, [behind]);

  // The window shows a still copy of that part of the CV, exactly where it is on the page; a
  // whole job scrolls inside the window while the window and the page hold still.
  const windowedNow = Boolean(tailoring && (tailoring.stage === 'compose'
    || tailoring.items.filter((item) => !item.decided).every((item) => item.after === undefined && !item.error)));
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane || !behind || !windowedNow) return;
    pane.replaceChildren(copyOfRegion(behind, scale));
    pane.scrollTop = 0;
  }, [behind, windowedNow, scale, draft]);

  // A job's new versions are shown in the job as the CV draws it (title, description, bullets,
  // tech stack): each line's change in its own place, with its own Use, Try again and Skip.
  const jobRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<{ run: number; at: Record<string, HTMLElement> } | null>(null);
  const keyOnPage = (key?: string) => Boolean(key && behind?.querySelector(`[data-edit-key="${CSS.escape(key)}"]`));
  // A job or a whole section: the new versions are drawn into the CV's own text, never a list in
  // another style, whenever every line is on the page (a skills line is not: it stays a list).
  const inJob = Boolean(tailoring && tailoring.items.length > 1 && behind?.matches('article, .doc-section')
    && tailoring.items.every((item) => keyOnPage(item.target.key ?? item.insertAfter)));
  const run = tailoring?.run;
  const lineCount = tailoring?.items.length;
  useLayoutEffect(() => {
    const host = jobRef.current;
    if (!host || !behind || !tailoring || windowedNow || !inJob) return;
    const copy = copyOfRegion(behind, scale, true);
    const at: Record<string, HTMLElement> = {};
    const lastAdded: Record<string, HTMLElement> = {};
    for (const item of tailoring.items) {
      let line = item.target.key ? copy.querySelector<HTMLElement>(`[data-edit-key="${CSS.escape(item.target.key)}"]`) : null;
      if (item.insertAfter !== undefined) {
        // A new bullet: a copy of the job's last line, placed after it (and after earlier new ones).
        const after = lastAdded[item.insertAfter] ?? copy.querySelector<HTMLElement>(`[data-edit-key="${CSS.escape(item.insertAfter)}"]`);
        if (!after) continue;
        line = after.cloneNode(true) as HTMLElement;
        line.removeAttribute('data-edit-key');
        line.classList.add('qt-new-line');
        after.after(line);
        lastAdded[item.insertAfter] = line;
      }
      if (!line) continue;
      const slot = document.createElement('span');
      slot.className = 'qt-slot qt-change';
      (line.querySelector<HTMLElement>('.pro-text') ?? line).replaceChildren(slot);
      at[item.key] = slot;
    }
    host.replaceChildren(copy);
    setSlots({ run: tailoring.run, at });
    // Built once per run; the lines' changes are drawn into it as they arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behind, windowedNow, inJob, scale, run, lineCount]);

  // While the AI works: a running timer in the card; the window onto the CV pulses.
  // The CV's own words, where an acronym may already be spelled out.
  const cvText = useMemo(() => (draft ? [
    ...Object.values(draft.summaries ?? {}),
    ...draft.experiences.flatMap((role) => [role.blurb ?? '', role.techStack ?? '', ...role.achievements.map((item) => item.bullet)]),
  ].join('\n') : ''), [draft]);
  const working = Boolean(tailoring?.items.some((item) => item.busy));
  const elapsed = useElapsed(working);

  if (!jobId) return <div className="studio-message"><h1>Quick tailoring</h1><p className="error">Open this page from a job: the job is missing.</p></div>;
  if (error) return <div className="studio-message"><h1>Quick tailoring</h1><p className="error">{error}</p></div>;
  if (!draft) return <div className="studio-message"><h1>Quick tailoring</h1><p className="muted">Loading…</p></div>;

  const nameControl = renaming !== null ? (
    <input className="studio-rename qt-rename" aria-label="CV name" autoFocus value={renaming} maxLength={200}
      onChange={(event) => setRenaming(event.target.value)}
      onBlur={() => void rename()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') void rename();
        if (event.key === 'Escape') setRenaming(null);
      }} />
  ) : (
    <button type="button" className="studio-name qt-name-button" title="Rename" aria-label={`Rename: ${name}`} disabled={saving} onClick={() => setRenaming(name)}>
      <b className="qt-name">{name}</b> <span className="pen" aria-hidden="true">✎</span>
    </button>
  );
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
  const skillsOnly = new Set(score?.keywords?.skillsOnly ?? []);
  const missing = score?.keywords?.missing ?? [];
  // The posting's keywords: what a bullet's "Keywords" check looks for.
  const jobKeywords = [...matched, ...missing];
  const skills = new Set(draft.skills.map((skill) => skill.name.toLowerCase()));
  const waiting = tailoring?.items.filter((item) => item.busy).length ?? 0;
  const ready = tailoring?.items.filter(isReady) ?? [];
  const many = (tailoring?.items.length ?? 0) > 1;
  /** Asked for (or queued) and not back yet. */
  const pending = (item: Suggestion) => !item.decided && item.after === undefined && !item.error;
  /** Use / Skip / Try again / Dismiss for one suggestion: shown from Generate on, usable once it is back. */
  const itemActions = (item: Suggestion) => {
    if (item.decided) return null;
    const same = item.after !== undefined && item.after.trim() === item.before.trim();
    const waits = item.busy || pending(item);
    return (
      <div className="ra-row qt-actions">
        {(item.after !== undefined || waits) && (
          <button className="primary" disabled={same || saving || waits} onClick={() => use([item])}>{same ? (item.target.kind === 'skills' ? 'Nothing new to add' : 'Already fits') : isRemoval(item) ? 'Remove' : isAddition(item) ? 'Add' : many ? 'Use' : 'Use this'}</button>
        )}
        {many && item.after !== undefined && !same && <button className="ghost" onClick={() => decide([item.key], 'skipped')}>Skip</button>}
        {(item.chosenId || isRemoval(item)) && Boolean(tailoring?.alternates?.[item.choiceGroup ?? '']?.length) && (
          <button className="ghost" disabled={saving || waits} title="Use the next-best achievement for this job" onClick={() => swap(item)}>Swap</button>
        )}
        {!isAddition(item) && <button className="ghost" disabled={saving || waits} onClick={() => retry(item)}>Try again</button>}
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
          <nav className="studio-crumb" aria-label="Quick tailoring">
            {nameControl}
          </nav>
        ) : (
          <nav className="studio-crumb">
            <Link to="/documents" onClick={(event) => { if (dirty && !confirm('Discard your unsaved changes?')) event.preventDefault(); }}>Documents</Link>
            <span className="sep">›</span>
            {nameControl}
          </nav>
        )}
        <span className={`studio-status${saveError ? ' bad' : ''}`} title={saveError ?? undefined}>{status}</span>
        <span className="studio-actions">
          <span className="qt-history" role="group" aria-label="Change history">
            <button type="button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" aria-keyshortcuts="Control+Z Meta+Z"
              disabled={saving || (!history.canUndo && !pendingEdit)} onClick={() => moveHistory(-1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 4-5 5 5 5M4 9h9a7 7 0 0 1 7 7" /></svg><span className="qt-history-label">Undo</span>
            </button>
            <button type="button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z or Ctrl Y)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
              disabled={saving || pendingEdit || !history.canRedo} onClick={() => moveHistory(1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5-5 5M20 9h-9a7 7 0 0 0-7 7" /></svg><span className="qt-history-label">Redo</span>
            </button>
            <button type="button" aria-label="Reset changes" title="Reset all edits from this tailoring session"
              disabled={saving || (!history.canReset && !pendingEdit)} onClick={resetChanges}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /></svg><span className="qt-history-label">Reset</span>
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
            ? <a className="ghost" href={`/api/resumes/${resumeId}/pdf?download=1`}
                onClick={embedded ? (event) => {
                  // In a job page a plain link would not carry this window's sign-in.
                  event.preventDefault();
                  downloadFromApi(event.currentTarget.href, `${name || 'CV'}.pdf`).catch((err: Error) => setSaveError(err.message));
                } : undefined}>Export PDF</a>
            : <button className="ghost" disabled title="Click Save to create the PDF first.">Export PDF</button>}
          {popup && (closing ? (
            <span className="qt-close-confirm" role="alert">
              Unsaved changes.
              <button className="ghost" onClick={closeWindow}>Close anyway</button>
              <button className="ghost" autoFocus onClick={() => setClosing(false)}>Keep editing</button>
            </span>
          ) : (
            <button className="ghost" disabled={saving} title="Close this window"
              onClick={() => { if (dirty || pendingEdit) setClosing(true); else closeWindow(); }}>Close</button>
          ))}
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
          <div className="qt-zoom-bar" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={scale <= ZOOM_MIN} onClick={() => setZoom((Math.ceil(scale * 10 - 1e-6) - 1) / 10)}>−</button>
            <button type="button" className="qt-zoom-value" title="Fit to the window" aria-label={`Zoom ${Math.round(scale * 100)}%: fit to the window`} onClick={() => setZoom(null)}>
              {Math.round(scale * 100)}%
            </button>
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={scale >= ZOOM_MAX} onClick={() => setZoom((Math.floor(scale * 10 + 1e-6) + 1) / 10)}>+</button>
            {zoom !== null && (
              <button type="button" className="qt-zoom-fit" onClick={() => setZoom(null)}>Fit</button>
            )}
          </div>
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
            // Until a new version (or an error) is back, the screen shows the CV through it.
            const windowed = windowedNow;
            const solo = many ? null : tailoring.items[0]!;
            const company = job?.company || (job ? jobName(job) : 'the job');
            const forJob = job ? jobName(job) : 'the job';
            const title = waiting > 0 ? `Writing for ${company}…`
              : many ? `${tailoring.items.length} lines · ${composing ? 'for' : 'tailored for'} ${forJob}`
                : `${KIND_NAMES[solo!.target.kind] ?? 'Line'} · ${composing ? 'for' : 'tailored for'} ${forJob}`;
            const wrapLines = (lines: ReactNode) => many ? <div key="lines" className="qt-screen-body" style={{ height: cardBox?.window }}>{lines}</div> : lines;
            return (
              <div className={`qt-card qt-unit${many ? ' is-many' : ''}${windowed ? ' is-windowed' : ''}`} ref={cardRef} role="dialog" aria-label={many ? 'AI versions of these lines' : 'AI version of this line'}
                style={{ top: cardTop, ...(cardBox && { left: cardBox.left, width: cardBox.width }) }}>
                <div className={`qt-screen${waiting > 0 ? ' is-busy' : ''}${windowed ? ' is-window' : ''}`} style={cardBox?.font}>
                  <div className="qt-screen-label">
                    <span className={`qt-dot${waiting > 0 ? ' busy' : ''}`} aria-hidden="true" />
                    <span className="qt-screen-title">{title}</span>
                    {waiting > 0 && <span className="qt-elapsed">{elapsed}s</span>}
                    <button className="qt-close" title="Close" aria-label="Close" onClick={() => setTailoring(null)}>×</button>
                  </div>
                  {/* A job or a section keeps one frame from the start: first a window onto the CV, then
                      the same frame with the new versions, which scroll inside it while it holds still. */}
                  {windowed ? <div key="window" className="qt-window" ref={paneRef} style={{ height: cardBox?.window }} aria-hidden="true" /> : inJob ? (
                    <div key="job" className="qt-screen-body" style={{ height: cardBox?.window }}>
                      <div ref={jobRef} />
                      {slots?.run === tailoring.run && tailoring.items.map((item) => {
                        const slot = slots.at[item.key];
                        if (!slot) return null;
                        const back = item.after !== undefined && !item.busy;
                        return createPortal(
                          <span className={`qt-slot-line${item.decided ? ` is-${item.decided}` : ''}`}>
                            {back ? <DiffLine key={item.after} before={boldOnly(item.before.trim())} after={boldOnly(item.after!)} /> : withBold(item.before.trim())}
                            {back && item.target.kind === 'bullet' && item.after!.trim() && (
                              <BulletMeter text={item.after!} keywords={jobKeywords} compact />
                            )}
                            {back && isRemoval(item) && <span className="qt-slot-note qt-cut">Not needed for this job: Remove takes it off, Swap puts another achievement here.</span>}
                            {back && isAddition(item) && <span className="qt-slot-note qt-from">New bullet for this job</span>}
                            {back && (item.fromProfile || item.fromSavedCv) && <span className="qt-slot-note qt-from">{item.fromProfile ? 'From your Profile' : 'From your saved CVs'}</span>}
                            {back && READ_AS_PROSE.has(item.target.kind) && recruiterFlags(item.after!, cvText).map((note, index) => (
                              <span key={`r${index}`} className="qt-slot-note qt-hint">{note}</span>
                            ))}
                            {item.error && !item.busy && <span className="qt-slot-note ra-error">{item.error}</span>}
                            {item.decided
                              ? <span className="qt-slot-note">{item.decided === 'used' ? '✓ Used' : 'Skipped'}</span>
                              : itemActions(item)}
                            {back && item.cannotDo?.map((note, index) => <span key={index} className="qt-slot-note">⚠ {note}</span>)}
                          </span>,
                          slot,
                          item.key,
                        );
                      })}
                    </div>
                  ) : wrapLines(tailoring.items.map((item) => {
                    const back = item.after !== undefined && !item.busy;
                    return (
                      <div key={item.key} className={`qt-screen-line${item.decided ? ` is-${item.decided}` : ''}${LISTED.has(item.target.kind) ? ' is-listed' : ''}`}>
                        {many && <p className="qt-screen-line-label">{item.target.label ?? 'Line'}{item.decided && <span> · {item.decided === 'used' ? 'Used' : 'Skipped'}</span>}</p>}
                        {/* Back: the change, red out and green in. Still waiting: the line as it is. */}
                        {back ? <div className="qt-screen-text qt-change"><DiffLine key={item.after} before={boldOnly(item.before.trim())} after={boldOnly(item.after!)} /></div>
                          : <div className="qt-screen-before is-current">{withBold(item.before.trim())}</div>}
                        {back && item.target.kind === 'bullet' && item.after!.trim() && (
                          <BulletMeter text={item.after!} keywords={jobKeywords} compact />
                        )}
                        {item.error && !item.busy && <p className="ra-error">{item.error}</p>}
                        {many && itemActions(item)}
                        {many && !item.busy && item.after !== undefined && (
                          <>
                            {isRemoval(item) && <p className="qt-note qt-cut">Not needed for this job: Remove takes it off, Swap puts another achievement here.</p>}
                            {item.fromProfile || item.fromSavedCv ? <p className="qt-note qt-from">{item.fromProfile ? 'From your Profile' : 'From your saved CVs'}</p> : null}
                            {READ_AS_PROSE.has(item.target.kind) && recruiterFlags(item.after, cvText).map((note, index) => (
                              <p key={`r${index}`} className="qt-note qt-hint">{note}</p>
                            ))}
                            {item.added?.length ? <p className="qt-note">+ From your CV: {item.added.join(', ')}</p> : null}
                            {item.dropped?.length ? <p className="qt-note">− Left out for this job: {item.dropped.join(', ')}</p> : null}
                            {item.cannotDo?.map((note, index) => <p key={index} className="qt-note">⚠ {note}</p>)}
                          </>
                        )}
                      </div>
                    );
                  }))}
                </div>
                <div className="qt-menu">
                  {composing ? (
                    <div className="ra-row qt-actions">
                      <button className="qt-ai-button qt-generate" disabled={saving} onClick={() => void generate()} title="Ctrl/⌘ Enter">Generate <AiBadge /></button>
                      <button className="ghost" onClick={() => setTailoring(null)}>Dismiss</button>
                    </div>
                  ) : many ? (
                    <div className="ra-row qt-actions">
                      <button className="primary" disabled={!ready.length || saving} onClick={() => use(ready)}>Use all{ready.length ? ` ${ready.length}` : ''}</button>
                      <button className="qt-ai-button" disabled={waiting > 0 || saving} onClick={() => void generate()}>Generate again <AiBadge /></button>
                      <button className="ghost" onClick={() => setTailoring(null)}>Close</button>
                    </div>
                  ) : itemActions(solo!)}
                  {waiting > 0 && (many || (solo!.target.kind !== 'bullet' && solo!.target.kind !== 'blurb' && solo!.target.kind !== 'headline')) && (
                    <WorkingStatus seconds={elapsed}
                      summary={tailoring.items.some((item) => item.busy && item.target.kind === 'summary')}
                      skills={tailoring.items.some((item) => item.busy && item.target.kind === 'skills')}
                      progress={many ? `Tailoring… ${tailoring.items.length - waiting} of ${tailoring.items.length} ready.` : null} />
                  )}
                  {/* Several lines: the progress line's place is kept before Generate and after the
                      lines are back, so the menu never moves. */}
                  {many && composing && <p className="qt-working-status qt-screen-room" aria-hidden="true"><span>&nbsp;</span></p>}
                  {waiting === 0 && many && !composing && (
                    <p className="qt-working-status qt-screen-room" aria-hidden="true"><span>&nbsp;</span></p>
                  )}
                  {tailoring.notes?.map((note, index) => <p key={index} className="qt-note">⚠ Not added: {note}</p>)}
                  {solo && !solo.busy && solo.after !== undefined && (
                    <>
                      {solo.fromProfile || solo.fromSavedCv ? <p className="qt-note qt-from">{solo.fromProfile ? 'From your Profile' : 'From your saved CVs'}</p> : null}
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
                  {matched.map((kw) => skillsOnly.has(kw)
                    ? <span key={kw} className="ra-kw have only" tabIndex={0} title={`${kw} is only in your skills list. Add it to a bullet or tech stack where you used it.`} {...keywordCard(kw)}>✓ {kw} · skills only</span>
                    : <span key={kw} className="ra-kw have" tabIndex={0} {...keywordCard(kw)}>✓ {kw}</span>)}
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
