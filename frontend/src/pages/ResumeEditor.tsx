import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { careerApi } from '../profile/careerApi';
import { resumeApi, type RenderedResume } from '../resumeApi';
import { ResumeDocument } from '../resume/ResumeDocument';
import { ImportButton } from '../resume/ImportButton';
import { StylePanel } from '../resume/StylePanel';
import { sectionOrder, type SectionKey } from '../resume/theme';
import { useEditableResumeTheme } from '../resume/useResumeTheme';
import { EducationForm, ExperienceForm, HeaderForm, SkillsForm, SummaryForm } from '../resume/studio/SectionForms';
import { resumeFromProfile } from '../resume/studio/fromProfile';
import '../resume/document.css';
import '../resume/studio/studio.css';

type Section = 'header' | SectionKey;

const LABELS: Record<Section, string> = {
  header: 'Resume Header',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
};

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
}

function summaryOf(section: Section, resume: RenderedResume): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
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
    case 'skills': return plural(resume.skills.length, 'skill');
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

  const [loaded, setLoaded] = useState<RenderedResume | null>(null);
  const [draft, setDraft] = useState<RenderedResume | null>(null);
  const [theme, setTheme] = useEditableResumeTheme(id);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An imported CV waits for "Keep this CV" before anything is saved.
  const [held, setHeld] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const draftRef = useRef<RenderedResume | null>(null);
  draftRef.current = draft;
  const failed = useRef<RenderedResume | null>(null);
  const message = useRef<string | undefined>(undefined);

  const [tab, setTab] = useState<'editor' | 'layout'>('editor');
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
        setDraft(structuredClone(resume));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const dirty = Boolean(loaded && draft && JSON.stringify(loaded) !== JSON.stringify(draft));

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
    if (!sent) return;
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
    } catch (err) {
      failed.current = sent;
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Autosave a moment after the last change. A draft that just failed waits for the next change.
  useEffect(() => {
    if (!dirty || held || saving || draft === failed.current) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty, held, saving]);

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

  const scale = zoom === 'fit-width'
    ? Math.min(1.25, Math.max(0.3, (canvasSize.width - 48) / PAGE_WIDTH))
    : zoom === 'fit-page'
      ? Math.max(0.3, Math.min((canvasSize.width - 48) / PAGE_WIDTH, (canvasSize.height - 48) / PAGE_HEIGHT))
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
    } catch {
      setName(before);
      setSaveError('Could not rename the CV.');
    }
  }

  async function exportPdf(e: MouseEvent<HTMLAnchorElement>) {
    // Saved first, so the PDF has the latest changes. An import not kept yet is not in it.
    if (!dirty || held) return;
    e.preventDefault();
    const href = e.currentTarget.href;
    await save();
    window.location.href = href;
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
    const order = sectionOrder(theme).filter((key) => key !== dragging);
    order.splice(order.indexOf(target), 0, dragging);
    if (order.join() !== sectionOrder(theme).join()) setOrder(order);
  }

  /** A click on the CV opens the form for the section clicked. */
  function openFromPreview(e: MouseEvent<HTMLDivElement>) {
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-section]')?.dataset.section as Section | undefined;
    if (key && key in LABELS) {
      setTab('editor');
      setSection(key);
      setLeftOpen(true);
    }
  }

  if (error && !draft) return <div className="studio-message"><h1>Resume</h1><p className="error">{error}</p></div>;
  if (!draft) return <div className="studio-message"><h1>Resume</h1><p className="muted">Loading…</p></div>;

  const order = sectionOrder(theme);
  const hidden = new Set(theme.hiddenSections ?? []);
  const status = held ? 'Not saved yet'
    : saving ? 'Saving…'
      : saveError ? 'Not saved'
        : dirty ? 'Unsaved changes'
          : savedAt ? savedAgo(savedAt, now) : `Version ${draft.snapshot}`;
  const empty = draft.experiences.length === 0 && draft.snapshot === 0;

  const form = section && {
    header: <HeaderForm resume={draft} onChange={change} />,
    summary: <SummaryForm resume={draft} resumeId={id} onChange={change} />,
    experience: <ExperienceForm resume={draft} resumeId={id} onChange={change} />,
    education: <EducationForm resume={draft} onChange={change} />,
    skills: <SkillsForm resume={draft} onChange={change} />,
  }[section];

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
                <b>{name}</b> <span className="pen">✎</span>
              </button>}
        </nav>
        <span className={`studio-status${saveError ? ' bad' : ''}`} title={saveError ?? undefined}>{status}</span>
        <span className="studio-actions">
          <Link className="ghost" to={`/documents/${id}/history`}>History</Link>
          <a className="studio-export" href={`/api/resumes/${id}/pdf?download=1`} onClick={(e) => void exportPdf(e)}>
            Export PDF
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

      <div className={`studio-body${leftOpen ? '' : ' left-closed'}`}>
        {leftOpen && (
          <aside className="studio-left">
            <div className="studio-tabs">
              <button className={tab === 'editor' ? 'on' : ''} onClick={() => setTab('editor')}>Editor</button>
              <button className={tab === 'layout' ? 'on' : ''} onClick={() => setTab('layout')}>Layout</button>
            </div>

            {tab === 'editor' && section && (
              <div className="studio-form">
                <button className="studio-back" onClick={() => setSection(null)}>← All sections</button>
                <h2>{LABELS[section]}</h2>
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
                      <b>{LABELS[key]}</b>
                      <span>{hidden.has(key) ? 'Hidden from the CV' : summaryOf(key, draft)}</span>
                    </span>
                    <button className="eye" title={hidden.has(key) ? 'Show on the CV' : 'Hide from the CV'}
                      onClick={(e) => { e.stopPropagation(); toggleHidden(key); }}>
                      {hidden.has(key) ? 'Show' : 'Hide'}
                    </button>
                    <span className="chev">›</span>
                  </div>
                ))}

                <button className="studio-reset" onClick={() => void resetToProfile()}>↺ Reset to Profile</button>
              </div>
            )}

            {tab === 'layout' && (
              <div className="studio-layout">
                <StylePanel theme={theme} onChange={setTheme} />
                <div className="studio-visibility">
                  <p className="group">Sections</p>
                  {order.map((key, index) => (
                    <div className="row-vis" key={key}>
                      <label>
                        <input type="checkbox" checked={!hidden.has(key)} onChange={() => toggleHidden(key)} />
                        {LABELS[key]}
                      </label>
                      <span className="sf-tools">
                        <button title="Move up" disabled={index === 0} onClick={() => {
                          const next = [...order];
                          [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                          setOrder(next);
                        }}>↑</button>
                        <button title="Move down" disabled={index === order.length - 1} onClick={() => {
                          const next = [...order];
                          [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                          setOrder(next);
                        }}>↓</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        <main className="studio-preview" ref={preview}>
          <div className="studio-tools">
            <button title={leftOpen ? 'Hide the side panel' : 'Show the side panel'} onClick={() => setLeftOpen(!leftOpen)}>
              {leftOpen ? '«' : '»'}
            </button>
            <span className="spacer" />
            <button className={zoom === 'fit-page' ? 'on' : ''} onClick={() => setZoom('fit-page')}>Fit to Page</button>
            <button title="Zoom out" onClick={() => zoomBy(-0.1)}>−</button>
            <button className={zoom === 'fit-width' ? 'pct on' : 'pct'} title="Fit to width" onClick={() => setZoom('fit-width')}>
              {Math.round(scale * 100)}%
            </button>
            <button title="Zoom in" onClick={() => zoomBy(0.1)}>+</button>
            <button title="Full screen" onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void preview.current?.requestFullscreen();
            }}>⛶</button>
          </div>
          <div className="studio-canvas" ref={canvas}>
            <div className="studio-zoom" style={{ zoom: scale }} onClick={openFromPreview}>
              <ResumeDocument resumeId={id} resume={draft} theme={theme} onChange={change} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
