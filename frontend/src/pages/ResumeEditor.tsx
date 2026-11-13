import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { withTechStacks } from '../resume/techStack';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { careerApi } from '../profile/careerApi';
import { groupLikeProfile } from '../profile/skillGroups';
import { resumeApi, type RenderedResume } from '../resumeApi';
import { notifyResumesChanged } from '../extensionBridge';
import { ResumeDocument } from '../resume/ResumeDocument';
import { PagedDocument, ScaledPage } from '../resume/PagedDocument';
import { ImportButton } from '../resume/ImportButton';
import { customKey, sectionOrder, type SectionKey } from '../resume/theme';
import { useEditableResumeTheme } from '../resume/useResumeTheme';
import {
  CertificationsForm, CustomSectionForm, EducationForm, ExperienceForm, HeaderForm, ProjectsForm, SkillsForm, SummaryForm,
} from '../resume/studio/SectionForms';
import { resumeFromProfile } from '../resume/studio/fromProfile';
import { NameSizeControl } from '../resume/studio/NameSizeControl';
import { AssistantPanel } from '../resume/studio/AssistantPanel';
import { AiSettingsForm } from '../resume/studio/AiSettingsForm';
import type { ChatSuggestion, IssueSection, ResumeScore } from '../resume/studio/assistantApi';
import '../resume/document.css';
import '../resume/studio/studio.css';
import { DashboardIcon } from '../jobs/DashboardIcon';

type Section = 'header' | SectionKey;

const LABELS: Record<string, string> = {
  header: 'Resume Header',
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects & Outside Experience',
  education: 'Education',
  certifications: 'Certifications',
  skills: 'Skills',
};

const customId = (section: Section) => (section.startsWith('custom:') ? section.slice('custom:'.length) : null);
const customIds = (resume: RenderedResume) =>
  (resume.customSections ?? []).flatMap((entry) => (entry.lineageId ? [entry.lineageId] : []));

function labelOf(section: Section, resume: RenderedResume): string {
  const id = customId(section);
  if (!id) return LABELS[section] ?? section;
  return resume.customSections?.find((entry) => entry.lineageId === id)?.title.trim() || 'Untitled section';
}

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const AUTOSAVE_MS = 2000;

const newId = () => crypto.randomUUID();

/** Every row gets its id in the browser, so a second save never makes it again. */
function withIds(resume: RenderedResume) {
  for (const role of resume.experiences) {
    role.lineageId ??= newId();
    for (const bullet of role.achievements) {
      bullet.lineageId ??= newId();
      bullet.experienceLineageId = role.lineageId;
    }
  }
  for (const row of resume.educations) row.lineageId ??= newId();
  for (const skill of resume.skills) skill.lineageId ??= newId();
  for (const row of resume.projects ?? []) row.lineageId ??= newId();
  for (const row of resume.certifications ?? []) row.lineageId ??= newId();
  for (const row of resume.customSections ?? []) row.lineageId ??= newId();
}

function summaryOf(section: Section, resume: RenderedResume): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const id = customId(section);
  if (id) {
    const item = resume.customSections?.find((entry) => entry.lineageId === id);
    const bullets = item?.bullets.filter((bullet) => bullet.trim()).length ?? 0;
    return bullets ? plural(bullets, 'bullet') : item?.text?.trim() ? 'Text' : 'Empty, left off the CV';
  }
  switch (section) {
    case 'header': {
      const c = resume.contact;
      return [c?.firstName, c?.lastName].filter(Boolean).join(' ') || 'Name and contact details';
    }
    case 'summary': {
      const words = (resume.summaries.default ?? '').trim().split(/\s+/).filter(Boolean).length;
      return words ? plural(words, 'word') : 'Empty';
    }
    case 'experience': return plural(resume.experiences.length, 'role');
    case 'education': return plural(resume.educations.length, 'entry').replace('entrys', 'entries');
    case 'skills': {
      const groups = new Set(resume.skills.map((skill) => (skill.category ?? '').trim()).filter(Boolean)).size;
      return plural(resume.skills.length, 'skill') + (groups ? ` in ${plural(groups, 'category').replace('categorys', 'categories')}` : '');
    }
    case 'projects': {
      const n = resume.projects?.length ?? 0;
      return n ? plural(n, 'project') : 'Empty, left off the CV';
    }
    case 'certifications': {
      const n = resume.certifications?.length ?? 0;
      return n ? plural(n, 'certification') : 'Empty, left off the CV';
    }
    default: return '';
  }
}

function savedAgo(at: number, now: number) {
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return 'Saved just now';
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Saved ${hours} h ago` : `Saved ${new Date(at).toLocaleDateString()}`;
}

/**
 * The CV editor, laid out like Simplify's: sections on the left, the CV as it
 * will print in the middle. Changes are saved a moment after you stop typing;
 * each save is a version you can go back to in History.
 */
export function ResumeEditor() {
  const { id = '' } = useParams();
  // "Full tailoring" in the extension opens the editor with its job chosen.
  const [searchParams] = useSearchParams();
  const jobParam = searchParams.get('job');

  const [loaded, setLoaded] = useState<RenderedResume | null>(null);
  const [draft, setDraft] = useState<RenderedResume | null>(null);
  const [theme, setTheme, saveTheme] = useEditableResumeTheme(id);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An imported CV waits for "Keep this CV" before anything is saved.
  const [held, setHeld] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const draftRef = useRef<RenderedResume | null>(null);
  draftRef.current = draft;
  const failed = useRef<RenderedResume | null>(null);
  const message = useRef<string | undefined>(undefined);

  const [tab, setTab] = useState<'editor' | 'layout' | 'ai'>('editor');
  const [rightOpen, setRightOpen] = useState(true);
  const [score, setScore] = useState<ResumeScore | null>(null);
  const [jobId, setJobId] = useState<string | null | undefined>(undefined);
  const [section, setSection] = useState<Section | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [zoom, setZoom] = useState<number | 'fit-width' | 'fit-page'>('fit-width');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState<SectionKey | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLElement>(null);

  useEffect(() => { void load(); }, [id]);

  async function load() {
    try {
      const [resume, list] = await Promise.all([resumeApi.read(id), resumeApi.list().catch(() => [])]);
      setLoaded(resume);
      const summary = list.find((item) => item.id === id);
      setName(summary?.name ?? 'Resume');
      if (summary?.updatedAt) setSavedAt(Date.parse(summary.updatedAt));
      setJobId(jobParam ?? summary?.jobId ?? null);
      // Not removed on read: StrictMode runs this twice in development. It is
      // removed once the import is kept or discarded.
      const pending = sessionStorage.getItem(`resume-draft:${id}`);
      if (pending) {
        const imported = JSON.parse(pending) as RenderedResume;
        withIds(imported);
        setDraft(imported);
        setHeld(true);
        message.current = 'imported from CV';
      } else {
        // A "Tech stack:" bullet becomes the job's tech stack; the next save keeps it.
        setDraft(withTechStacks(structuredClone(resume)));
        // Skills all on one line take the Profile's groups ("Core: TypeScript, Node.js").
        if (resume.skills.length && resume.skills.every((skill) => !(skill.category ?? '').trim()))
          void careerApi.read().then((career) => {
            const types = career.data.skillTypes?.value;
            if (!types) return;
            setDraft((current) => {
              const grouped = current && groupLikeProfile(current.skills, career.data.skills?.value ?? [], types);
              if (!current || !grouped) return current;
              message.current = 'skills grouped as on the Profile';
              return { ...current, skills: grouped };
            });
          }).catch(() => undefined);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const dirty = Boolean(loaded && draft && JSON.stringify(loaded) !== JSON.stringify(draft));
  const pagedWatch = useMemo(() => [draft, theme], [draft, theme]);

  function change(mutate: (d: RenderedResume) => void) {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      withIds(next);
      return next;
    });
  }

  async function save() {
    const sent = draftRef.current;
    if (!sent) return false;
    setSaving(true);
    try {
      const saved = await resumeApi.save(id, sent, message.current);
      sessionStorage.removeItem(`resume-draft:${id}`);
      message.current = undefined;
      failed.current = null;
      setLoaded(saved);
      // Typing during the save stays in the draft and is saved next.
      setDraft((current) => (current === sent ? structuredClone(saved) : current && { ...current, snapshot: saved.snapshot }));
      setSavedAt(Date.now());
      setSaveError(null);
      return true;
    } catch (err) {
      failed.current = sent;
      setSaveError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Autosave a moment after the last change. A draft that just failed waits for the next change.
  useEffect(() => {
    if (!dirty || held || saving || exporting || draft === failed.current) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty, held, saving, exporting]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Leaving the editor inside the app saves what the timer has not saved yet.
  const pendingSave = useRef(false);
  pendingSave.current = dirty && !held;
  useEffect(() => () => {
    if (pendingSave.current && draftRef.current) void resumeApi.save(id, draftRef.current, message.current).catch(() => undefined);
  }, [id]);

  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  // The preview's zoom follows its column's size.
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCanvasSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [draft !== null]);

  // Opens at 100%, the page's real size; a narrow window shrinks it to fit. + zooms past it.
  const scale = zoom === 'fit-width'
    ? Math.min(1, Math.max(0.3, (canvasSize.width - 108) / PAGE_WIDTH))
    : zoom === 'fit-page'
      ? Math.max(0.3, Math.min((canvasSize.width - 108) / PAGE_WIDTH, (canvasSize.height - 48) / PAGE_HEIGHT))
      : zoom;
  const zoomBy = (step: number) => setZoom(Math.round(Math.min(2, Math.max(0.3, scale + step)) * 10) / 10);

  async function rename() {
    const next = renaming?.trim();
    setRenaming(null);
    if (!next || next === name) return;
    const before = name;
    setName(next);
    try {
      const response = await fetch(`/api/resumes/${encodeURIComponent(id)}/name`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      notifyResumesChanged(id);
    } catch {
      setName(before);
      setSaveError('Could not rename the CV.');
    }
  }

  /** Saves, makes the PDF and downloads it: from the header's button or the chat's "Export to PDF". */
  async function exportPdf(e?: MouseEvent<HTMLAnchorElement>) {
    e?.preventDefault();
    if (exporting || saving || held) return;
    const href = `/api/resumes/${id}/pdf?download=1`;
    setExporting(true);
    try {
      // Content and layout must be persisted before the explicit PDF action.
      if (!await save()) return;
      await saveTheme();
      await resumeApi.createPdf(id);
      notifyResumesChanged(id);
      window.location.href = href;
    } catch (err) {
      setSaveError(`Could not create the PDF: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  async function resetToProfile() {
    if (!draft) return;
    if (!confirm('Fill this CV from your Profile? Its current content stays in History.')) return;
    try {
      const [profile, career] = await Promise.all([api.profile(), careerApi.read()]);
      setDraft(resumeFromProfile(draft, profile, career.data));
      setSection(null);
    } catch (err) {
      setSaveError(`Could not read your Profile: ${(err as Error).message}`);
    }
  }

  function keepImport() {
    setHeld(false);
  }

  function discardImport() {
    sessionStorage.removeItem(`resume-draft:${id}`);
    message.current = undefined;
    setHeld(false);
    setDraft(loaded && structuredClone(loaded));
  }

  function setOrder(order: SectionKey[]) {
    setTheme({ ...theme, sectionOrder: order });
  }

  function toggleHidden(key: SectionKey) {
    const hidden = new Set(theme.hiddenSections ?? []);
    if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
    setTheme({ ...theme, hiddenSections: [...hidden] });
  }

  function dropOn(target: SectionKey) {
    if (!dragging || dragging === target) return;
    const current = sectionOrder(theme, draft ? customIds(draft) : []);
    const order = current.filter((key) => key !== dragging);
    order.splice(order.indexOf(target), 0, dragging);
    if (order.join() !== current.join()) setOrder(order);
  }

  /** A click on the CV opens the form for the section clicked. */
  function openFromPreview(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[contenteditable="true"], input, textarea, select, button, a')) return;
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-section]')?.dataset.section as Section | undefined;
    if (key && (key in LABELS || customId(key))) {
      setTab('editor');
      setSection(key);
      setLeftOpen(true);
    }
  }

  /** Applies one chat suggestion. A line edited since the suggestion asks first. */
  function applySuggestion(suggestion: ChatSuggestion): boolean {
    const current = draftRef.current;
    if (!current) return false;
    const now = suggestion.target === 'summary' ? current.summaries.default ?? ''
      : suggestion.target === 'headline' ? current.contact?.headline ?? ''
        : suggestion.target === 'bullet'
          ? current.experiences.flatMap((role) => role.achievements).find((a) => a.lineageId === suggestion.lineageId)?.bullet
          : '';
    if (now === undefined) { alert('That bullet is no longer on the CV.'); return false; }
    if (suggestion.target !== 'add-skill' && now.trim() !== suggestion.before.trim()
      && !confirm('This text changed since the suggestion was made. Replace it anyway?')) return false;
    change((d) => {
      if (suggestion.target === 'summary') d.summaries = { ...d.summaries, default: suggestion.after };
      else if (suggestion.target === 'headline') d.contact = { ...(d.contact ?? { firstName: '', lastName: '', email: '' }), headline: suggestion.after };
      else if (suggestion.target === 'bullet') {
        const bullet = d.experiences.flatMap((role) => role.achievements).find((a) => a.lineageId === suggestion.lineageId);
        if (bullet) bullet.bullet = suggestion.after;
      } else if (!d.skills.some((skill) => skill.name.toLowerCase() === suggestion.after.toLowerCase())) {
        d.skills.push({ lineageId: newId(), name: suggestion.after, category: '' });
      }
    });
    return true;
  }

  function issuesIn(section: Section) {
    return score?.issues.filter((issue) => issue.section === section).length ?? 0;
  }
  const badge = (section: Section) => {
    const count = issuesIn(section);
    return count ? <span className="ra-badge" title={`${count} issue${count === 1 ? '' : 's'}`}>{count}</span> : null;
  };

  if (error && !draft) return <div className="studio-message"><h1>Resume</h1><p className="error">{error}</p></div>;
  if (!draft) return <div className="studio-message"><h1>Resume</h1><p className="muted">Loading…</p></div>;

  const order = sectionOrder(theme, customIds(draft));
  const hidden = new Set(theme.hiddenSections ?? []);
  const status = held ? 'Not saved yet'
    : saving ? 'Saving…'
      : saveError ? 'Not saved'
        : dirty ? 'Unsaved changes'
          : savedAt ? savedAgo(savedAt, now) : `Version ${draft.snapshot}`;
  const empty = draft.experiences.length === 0 && draft.snapshot === 0;

  const forms: Record<string, React.ReactNode> = {
    header: <HeaderForm resume={draft} onChange={change} />,
    summary: <SummaryForm resume={draft} resumeId={id} onChange={change} />,
    experience: <ExperienceForm resume={draft} resumeId={id} onChange={change} />,
    projects: <ProjectsForm resume={draft} onChange={change} />,
    education: <EducationForm resume={draft} onChange={change} />,
    certifications: <CertificationsForm resume={draft} onChange={change} />,
    skills: <SkillsForm resume={draft} onChange={change} />,
  };
  const openCustom = section && customId(section);
  const form = section && (openCustom
    ? <CustomSectionForm key={openCustom} resume={draft} lineageId={openCustom} onChange={change} onRemoved={() => setSection(null)} />
    : forms[section]);

  function addCustomSection() {
    const lineageId = newId();
    change((d) => { d.customSections = [...(d.customSections ?? []), { lineageId, title: 'New section', text: '', bullets: [] }]; });
    setSection(customKey(lineageId));
  }

  return (
    <div className="studio">
      <header className="studio-bar">
        <nav className="studio-crumb">
          <Link to="/documents">Documents</Link>
          <span className="sep">›</span>
          {renaming !== null
            ? <input className="studio-rename" autoFocus value={renaming} maxLength={200}
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={() => void rename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void rename();
                  if (e.key === 'Escape') setRenaming(null);
                }} />
            : <button className="studio-name" title="Rename" onClick={() => setRenaming(name)}>
                <b>{name}</b> <span className="pen" aria-hidden="true"><DashboardIcon name="edit" size={14} /></span>
              </button>}
        </nav>
        <span className={`studio-status${saveError ? ' bad' : ''}`} title={saveError ?? undefined}>{status}</span>
        {/* The view's tools sit in the header: fit, zoom, full screen. */}
        <div className="studio-tools" role="toolbar" aria-label="View">
          <button className={zoom === 'fit-page' ? 'on' : ''} onClick={() => setZoom('fit-page')}>Fit to Page</button>
          <button title="Zoom out" onClick={() => zoomBy(-0.1)}><DashboardIcon name="minus" size={16} /></button>
          <button className={zoom === 'fit-width' ? 'pct on' : 'pct'} title="Fit to width" onClick={() => setZoom('fit-width')}>
            {Math.round(scale * 100)}%
          </button>
          <button title="Zoom in" onClick={() => zoomBy(0.1)}><DashboardIcon name="plus" size={16} /></button>
          <button title="Full screen" onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void preview.current?.requestFullscreen();
          }}>⛶</button>
        </div>
        <span className="studio-actions">
          <Link className="ghost" to={`/documents/${id}/history`}>History</Link>
          <a className="studio-export" href={`/api/resumes/${id}/pdf?download=1`} onClick={(e) => void exportPdf(e)}>
            {exporting ? 'Creating PDF…' : 'Save & export PDF'}
          </a>
        </span>
      </header>

      {held && (
        <div className="studio-held">
          <span>Filled from your CV file. Check it, then keep it. Nothing is saved yet.</span>
          <button className="primary" onClick={keepImport}>Keep this CV</button>
          <button className="ghost" onClick={discardImport}>Discard</button>
        </div>
      )}
      {saveError && !held && (
        <div className="studio-held bad">
          <span>{saveError}</span>
          <button className="ghost" onClick={() => void save()}>Try again</button>
        </div>
      )}

      <div className={`studio-body${leftOpen ? '' : ' left-closed'}${rightOpen ? '' : ' right-closed'}`}>
        {leftOpen && (
          <aside className="studio-left">
            <div className="studio-tabs">
              <button className={tab === 'editor' ? 'on' : ''} onClick={() => setTab('editor')}>Editor</button>
              <button className={tab === 'layout' ? 'on' : ''} onClick={() => setTab('layout')}>Layout</button>
              <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>AI Settings</button>
            </div>

            {tab === 'editor' && section && (
              <div className="studio-form">
                <button className="studio-back" onClick={() => setSection(null)}>← All sections</button>
                <h2>{labelOf(section, draft)}</h2>
                {section === 'header' && <NameSizeControl theme={theme} onChange={setTheme} />}
                {form}
              </div>
            )}

            {tab === 'editor' && !section && (
              <div className="studio-cards">
                {empty && (
                  <div className="studio-start">
                    <b>Start from a CV</b>
                    <span>Reads a PDF or DOCX and fills this CV. You check it before it is saved.</span>
                    <ImportButton label="Choose a CV" onDraft={(imported) => {
                      withIds(imported);
                      setDraft(imported);
                      setHeld(true);
                      message.current = 'imported from CV';
                    }} />
                  </div>
                )}

                <button className="studio-card fixed" onClick={() => setSection('header')}>
                  <span className="grip" aria-hidden />
                  <span className="text"><b>{LABELS.header}</b><span>{summaryOf('header', draft)}</span></span>
                  {badge('header')}
                  <span className="chev">›</span>
                </button>

                {order.map((key) => (
                  <div key={key}
                    className={`studio-card${hidden.has(key) ? ' hidden' : ''}${dragging === key ? ' dragging' : ''}`}
                    draggable
                    onDragStart={(e) => { setDragging(key); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => { e.preventDefault(); dropOn(key); }}
                    onDrop={(e) => e.preventDefault()}
                    onClick={() => setSection(key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSection(key); }}>
                    <span className="grip" title="Drag to reorder">⋮⋮</span>
                    <span className="text">
                      <b>{labelOf(key, draft)}</b>
                      <span>{hidden.has(key) ? 'Hidden from the CV' : summaryOf(key, draft)}</span>
                    </span>
                    <button className="eye" title={hidden.has(key) ? 'Show on the CV' : 'Hide from the CV'}
                      onClick={(e) => { e.stopPropagation(); toggleHidden(key); }}>
                      {hidden.has(key) ? 'Show' : 'Hide'}
                    </button>
                    {badge(key)}
                    <span className="chev">›</span>
                  </div>
                ))}

                <button className="studio-add-section" onClick={addCustomSection}>+ Add Custom Section</button>
                <button className="studio-reset" onClick={() => void resetToProfile()}>↺ Reset to Profile</button>
              </div>
            )}

            {tab === 'ai' && <AiSettingsForm resumeId={id} />}

            {tab === 'layout' && (
              <div className="studio-layout">
                <p className="studio-design-note">
                  Every CV uses the one design for now: Roboto, black, the name in capitals and headings over a rule.
                  Choose which sections show, and in what order.
                </p>
                <NameSizeControl theme={theme} onChange={setTheme} />
                <div className="studio-visibility">
                  <p className="group">Sections</p>
                  {order.map((key, index) => (
                    <div className="row-vis" key={key}>
                      <label>
                        <input type="checkbox" checked={!hidden.has(key)} onChange={() => toggleHidden(key)} />
                        {labelOf(key, draft)}
                      </label>
                      <span className="sf-tools">
                        <button title="Move up" disabled={index === 0} onClick={() => {
                          const next = [...order];
                          [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                          setOrder(next);
                        }}><DashboardIcon name="arrowUp" size={14} /></button>
                        <button title="Move down" disabled={index === order.length - 1} onClick={() => {
                          const next = [...order];
                          [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                          setOrder(next);
                        }}><DashboardIcon name="arrowDown" size={14} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        <main className="studio-preview" ref={preview}>
          {/* Round handles on the panels' edges, halfway down: each folds its panel away and back. */}
          <button type="button" className="studio-fold left" aria-expanded={leftOpen}
            aria-label={leftOpen ? 'Hide the side panel' : 'Show the side panel'} title={leftOpen ? 'Hide the side panel' : 'Show the side panel'}
            onClick={() => setLeftOpen(!leftOpen)}>
            <DashboardIcon name={leftOpen ? 'chevronLeft' : 'chevron'} size={16} />
          </button>
          {jobId !== undefined && (
            <button type="button" className="studio-fold right" aria-expanded={rightOpen}
              aria-label={rightOpen ? 'Hide Resume Score and Chat' : 'Show Resume Score and Chat'} title={rightOpen ? 'Hide Resume Score and Chat' : 'Show Resume Score and Chat'}
              onClick={() => setRightOpen(!rightOpen)}>
              <DashboardIcon name={rightOpen ? 'chevron' : 'chevronLeft'} size={16} />
            </button>
          )}
          <div className="studio-canvas" ref={canvas}>
            <ScaledPage className="studio-zoom" scale={scale} onClick={openFromPreview}>
              {/* Drawn as the PDF's sheets, with the same page breaks. */}
              <PagedDocument watch={pagedWatch}>
                <ResumeDocument resumeId={id} resume={draft} theme={theme} onChange={change}
                  onHideSection={(key) => setTheme({ ...theme, hiddenSections: [...new Set([...(theme.hiddenSections ?? []), key])] })} />
              </PagedDocument>
            </ScaledPage>
          </div>
        </main>

        {rightOpen && jobId !== undefined && (
          <aside className="studio-right">
            <AssistantPanel
              resumeId={id}
              resume={draft}
              snapshot={loaded?.snapshot ?? 0}
              defaultJobId={jobId}
              onIssues={setScore}
              onApply={applySuggestion}
              onOpenSection={(key: IssueSection) => { setTab('editor'); setSection(key); setLeftOpen(true); }}
              onExport={() => void exportPdf()}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
