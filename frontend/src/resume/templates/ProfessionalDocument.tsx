import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { roleLines } from '../techStack';
import type { RenderedResume } from '../../resumeApi';
import { RewritePopover } from '../RewritePopover';
import { DiffText } from '../DiffText';
import { sectionOrder, themeVars, type BuiltInSection } from '../theme';
import type { ResumeDocumentProps, RewriteTarget } from '../ResumeDocument';
import { useSkillCard } from '../SkillInfo';
import { MONTHS, monthYear, range } from '../dates';


/** Keep dates typed as "Sep 2020" usable by the editor and education autofill. */
function dateForSave(value: string): string {
  const text = value.trim();
  const named = text.match(/^([a-z]+)\s+(\d{4})$/i);
  const month = named ? MONTHS.findIndex((name) => name.toLowerCase() === named[1]!.slice(0, 3).toLowerCase()) : -1;
  if (named && month >= 0) return `${named[2]}-${String(month + 1).padStart(2, '0')}`;
  const numeric = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (numeric && Number(numeric[2]) >= 1 && Number(numeric[2]) <= 12)
    return `${numeric[1]}-${numeric[2]!.padStart(2, '0')}`;
  return text;
}


const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


/**
 * The words set in bold, as in the CV this template copies: every skill on the
 * CV and every item of a "Tech stack:" line, wherever they appear in the text.
 * "**word**" in the text is bold too, for anything else.
 */
function boldPattern(resume: RenderedResume): RegExp | null {
  const terms = new Set<string>();
  for (const skill of resume.skills) if (skill.name.trim().length >= 2) terms.add(skill.name.trim());
  for (const role of resume.experiences)
    for (const bullet of role.achievements ?? []) {
      const stack = bullet.bullet.match(/^\s*tech(?:nology)? stack\s*:\s*(.+)$/i)?.[1];
      for (const item of stack?.split(/[|,]/) ?? []) if (item.trim().length >= 2) terms.add(item.trim());
    }
  if (!terms.size) return null;
  const words = [...terms].sort((a, b) => b.length - a.length).map(escape).join('|');
  // Case as written ("REST", not "rest"), and never inside a longer word.
  return new RegExp(`(?<![\\p{L}\\p{N}.#+/-])(${words})(?![\\p{L}\\p{N}#+]|\\.[\\p{L}\\p{N}])`, 'gu');
}

interface Piece {
  text: string;
  /** "label": a leading "Label:"; "mark": written as **bold**; "auto": one of the CV's terms. */
  kind: 'plain' | 'label' | 'mark' | 'auto';
}

/** A line's pieces: its "Label:", "**marked**" words and, unless it lists a stack, the CV's terms in bold. */
function pieces(text: string, bold: RegExp | null): Piece[] {
  const label = text.match(/^(\s*[A-Z][\p{L} &/-]{1,28}:)(\s.*)?$/u);
  const out: Piece[] = label ? [{ text: label[1]!, kind: 'label' }] : [];
  const body = label ? label[2] ?? '' : text;
  const isList = Boolean(label && /stack|skills|tools|technolog/i.test(label[1]!));
  body.split(/\*\*(.+?)\*\*/g).forEach((part, index) => {
    if (index % 2 === 1) { out.push({ text: part, kind: 'mark' }); return; }
    if (!bold || isList) { if (part) out.push({ text: part, kind: 'plain' }); return; }
    part.split(bold).forEach((piece, j) => { if (piece) out.push({ text: piece, kind: j % 2 === 1 ? 'auto' : 'plain' }); });
  });
  return out;
}

function rich(text: string, bold: RegExp | null): ReactNode {
  return pieces(text, bold).map((piece, index) => (piece.kind === 'plain' ? piece.text : <b key={index}>{piece.text}</b>));
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The same pieces as HTML for an editable line; "**marked**" words keep a marker so they stay marked. */
function richHtml(text: string, bold: RegExp | null): string {
  return pieces(text, bold)
    .map((piece) => piece.kind === 'plain' ? escapeHtml(piece.text)
      : `<b${piece.kind === 'mark' ? ' data-mark=""' : ''}>${escapeHtml(piece.text)}</b>`)
    .join('');
}

/** The text of an edited line, with "**" put back around words that were marked bold. */
function textOf(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
    else if (child instanceof HTMLElement) {
      const inner = textOf(child);
      out += child.matches('b[data-mark]') && inner.trim() ? `**${inner}**` : child.tagName === 'BR' ? ' ' : inner;
    }
  });
  return out.replace(/\u00a0/g, ' ');
}

/**
 * A line edited where it is, as it prints: same font, bold and spacing, so
 * nothing moves when you click it. The change is kept when you leave the line
 * (or press Enter); Escape puts the line back as it was.
 */
function RichText({ value, onChange, placeholder, readOnly, bold, label, line }: {
  value: string;
  onChange(next: string): void;
  placeholder: string;
  readOnly?: boolean;
  bold: RegExp | null;
  /** Shown before the text in bold, such as "Project:". */
  label?: string;
  /** One line (a name, a title): no bold terms. */
  line?: boolean;
}) {
  const terms = line ? null : bold;
  const html = useMemo(() => richHtml(value, terms), [value, terms]);
  if (readOnly) {
    return <span className="pro-text">{label && <b>{label} </b>}{value.trim() ? rich(value, terms) : null}</span>;
  }
  return (
    <span className="pro-text">
      {label && <b>{label} </b>}
      <span
        className="pro-edit"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-label={placeholder}
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: html }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === 'Escape') { event.currentTarget.innerHTML = html; event.currentTarget.blur(); }
        }}
        onPaste={(event) => {
          // Plain text only, on one line: a pasted list or formatting would not print as it looks.
          event.preventDefault();
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' '));
        }}
        onBlur={(event) => {
          const next = textOf(event.currentTarget).replace(/\s+$/, '');
          if (next !== value) onChange(next);
          else event.currentTarget.innerHTML = html;
        }}
      />
    </span>
  );
}

/** Courses can omit a degree entirely; an empty optional field stays out of the CV. */
function EducationDegree({ value, hasField, readOnly, onChange }: {
  value: string;
  hasField: boolean;
  readOnly?: boolean;
  onChange(next: string): void;
}) {
  const [adding, setAdding] = useState(false);
  const editor = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (adding && !readOnly) editor.current?.querySelector<HTMLElement>('[contenteditable]')?.focus();
  }, [adding, readOnly]);
  if (!value.trim() && (!adding || readOnly)) return readOnly ? null : (
    <button type="button" className="doc-add pro-add-degree" aria-label="Add degree" title="Add degree (optional)" onClick={() => setAdding(true)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  );
  return <>
    <span ref={editor} onBlurCapture={() => setAdding(false)}>
      <RichText line value={value} placeholder="Degree" bold={null} readOnly={readOnly} onChange={next => onChange(next.trim())} />
    </span>
    {hasField ? ', ' : !readOnly ? ' ' : null}
  </>;
}

function DocumentControl({ action, label, title = label, description = label, onClick, className = '', compact = action === 'remove', controlKey }: {
  action: 'add' | 'remove'; label: string; title?: string; description?: string;
  onClick(): void; className?: string; compact?: boolean; controlKey?: string;
}) {
  // A remove shows no text on hover: the red outline already shows what it takes away.
  const quiet = action === 'remove';
  return <button type="button" className={`doc-${action}${action === 'add' ? ' pro-add' : ''} ${className}`}
    title={quiet ? undefined : title} aria-label={description} data-control-label={compact && !quiet ? label : undefined} data-control-key={controlKey} onClick={onClick}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={action === 'add' ? 'M12 5v14M5 12h14' : 'M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 11v6M14 11v6'} />
    </svg>
    {!compact && label}
  </button>;
}

function BulletControls({ text, context, onAdd, onRemove, onRewrite, rewriteLabel = 'Rewrite with AI' }: {
  text: string; context: string; onAdd(): void; onRemove(): void;
  onRewrite?(event: React.MouseEvent<HTMLButtonElement>): void;
  rewriteLabel?: string;
}) {
  return <span className="doc-bulletmeta">
    {onRewrite && <button type="button" className="ai" title={rewriteLabel} onClick={onRewrite}>✦</button>}
    <DocumentControl action="add" compact label="Add bullet below" className="inline pro-insert"
      description={`Add a bullet below this one in ${context}`} onClick={onAdd} />
    <DocumentControl action="remove" compact label="Remove bullet" description={`Remove bullet: ${text || 'empty bullet'} — ${context}`} onClick={onRemove} />
  </span>;
}

/**
 * The "professional" template: the layout of the candidate's own CV. Roboto,
 * black; the name in capitals; headings in capitals over a rule; per job the
 * company and dates in bold, then the title and place in italics; dash
 * bullets with the job's project first and skills set in bold; skills grouped
 * by category.
 */
export function ProfessionalDocument({ resume: given, theme, onChange, readOnly, resumeId, changes, onTailor, onHideSection }: ResumeDocumentProps) {
  // A CV saved before a section existed, or still loading, may lack it.
  const resume = {
    ...given,
    experiences: given.experiences ?? [],
    educations: given.educations ?? [],
    skills: given.skills ?? [],
    summaries: given.summaries ?? {},
  };
  const [rewritingOwn, setRewriting] = useState<RewriteTarget | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ key: string } | null>(null);
  /** A skill just added on a line of its own, so its type can be written first (optional). */
  const [newSkillLine, setNewSkillLine] = useState<string | null>(null);
  /** The untyped skills line is getting a type: its box shows at the start of the line. */
  const [typingOther, setTypingOther] = useState(false);
  /** Pointing at a skill shows what it is and where the CV uses it. */
  const skillCard = useSkillCard(readOnly ? null : resumeId ?? null, resume);
  /** A job whose empty description is being written: shown until it is left empty. */
  const [describing, setDescribing] = useState<string | null>(null);
  /** The job whose empty tech stack line is open for typing. */
  const [stacking, setStacking] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!focusTarget || readOnly) return;
    const key = CSS.escape(focusTarget.key);
    const target = root.current?.querySelector<HTMLElement>(`[data-edit-key="${key}"], [data-control-key="${key}"]`);
    const field = target?.querySelector<HTMLElement>('[contenteditable="true"]') ?? target;
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'nearest' });
    setFocusTarget(null);
  }, [focusTarget, readOnly]);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 1800);
    return () => clearTimeout(timer);
  }, [added]);
  const addItem = (key: string, mutate: (draft: RenderedResume) => void) => {
    setAdded(key); setFocusTarget({ key }); onChange(mutate);
  };
  const removeItem = (nextKey: string, mutate: (draft: RenderedResume) => void) => {
    setAdded(null); setFocusTarget({ key: nextKey }); onChange(mutate);
  };
  const addExperienceBullet = (index: number, at: number) => {
    const id = crypto.randomUUID();
    addItem(id, draft => {
      const role = draft.experiences[index]!;
      role.lineageId ??= crypto.randomUUID();
      role.achievements.splice(at, 0, { lineageId: id, experienceLineageId: role.lineageId, bullet: '' });
    });
  };
  const rewriting = onTailor ? null : rewritingOwn;
  const ask = (target: RewriteTarget, event: React.MouseEvent<HTMLElement>) => {
    if (!onTailor) { setRewriting(target); return; }
    // The card opens at the line holding the pressed ✦ (a summary's whole paragraph, so it stays readable).
    const button = event.currentTarget;
    const anchor = button.closest<HTMLElement>('li, .doc-headline, .doc-role-desc')
      ?? (button.closest('h2') && button.closest<HTMLElement>('.doc-section')?.querySelector<HTMLElement>('.doc-summary'))
      ?? button.closest<HTMLElement>('h2, .doc-roleline, .doc-head')
      ?? button;
    onTailor(target, anchor);
  };
  /** Quick tailoring of a whole part (a job, a section): every line at once, the card under that part. */
  const askAll = (targets: RewriteTarget[], event: React.MouseEvent<HTMLElement>) => {
    if (!onTailor || !targets.length) return;
    // At the job's title line or the section's heading: where the ✦ was pressed, not the end of the part.
    onTailor(targets, event.currentTarget.closest<HTMLElement>('.doc-roleline, h2') ?? event.currentTarget);
  };
  /** A job's Project line and bullets, ready to tailor. */
  const roleTargets = (i: number): RewriteTarget[] => {
    const role = resume.experiences[i]!;
    const context = `${role.title} at ${role.company}`;
    const targets: RewriteTarget[] = [];
    if ((role.blurb ?? '').trim()) targets.push({ text: role.blurb ?? '', context, kind: 'blurb', label: `${role.company || 'Job'} · Description`, key: `description:${role.lineageId ?? i}`,
      apply: (next, d) => { d.experiences[i]!.blurb = next; } });
    role.achievements.forEach((bullet, j) => {
      if (bullet.bullet.trim()) targets.push({ text: bullet.bullet, context, kind: 'bullet', label: `${role.company || 'Job'} · bullet ${j + 1}`, key: bullet.lineageId,
        role: { company: role.company, title: role.title, from: role.from },
        apply: (next, d) => { d.experiences[i]!.achievements[j]!.bullet = next; } });
    });
    if ((role.techStack ?? '').trim()) targets.push({ text: role.techStack ?? '', context: roleLines(role), kind: 'techStack', label: `${role.company || 'Job'} · Tech stack`, key: `tech-stack:${role.lineageId ?? i}`,
      apply: (next, d) => { d.experiences[i]!.techStack = next; } });
    return targets;
  };
  /** One skills line, tailored as a whole: reordered, maybe with skills the CV shows. */
  const skillTarget = (category: string, indices: number[]): RewriteTarget => ({
    text: indices.map((index) => resume.skills[index]!.name).filter((name) => name.trim()).join(', '),
    kind: 'skills',
    label: category || 'Skills',
    skills: { category, names: indices.map((index) => resume.skills[index]!.name) },
    apply: (next, d) => {
      const names = JSON.parse(next) as string[];
      const inLine = (skill: { category?: string }) => (skill.category ?? '').trim() === category;
      const first = d.skills.findIndex(inLine);
      const old = d.skills.filter(inLine);
      const line = names.map((name) => old.find((skill) => skill.name.trim().toLowerCase() === name.toLowerCase())
        ?? { lineageId: crypto.randomUUID(), name, category });
      const rest = d.skills.filter((skill) => !inLine(skill));
      rest.splice(first < 0 ? rest.length : Math.min(first, rest.length), 0, ...line);
      d.skills = rest;
    },
  });
  /** A section heading's delete: takes the whole section off this CV (it can be shown again). */
  const removeSection = (key: string, title: string) => onHideSection && !readOnly
    ? <DocumentControl action="remove" compact label={`Remove ${title}`} className="pro-remove-section"
        description={`Remove the ${title} section from this CV`} onClick={() => onHideSection(key)} />
    : null;
  const tailorButton = (title: string, onClick: (event: React.MouseEvent<HTMLButtonElement>) => void, className = '') =>
    onTailor && !readOnly ? <button type="button" className={`ai pro-tailor ${className}`} title={title} aria-label={title} onClick={onClick}>✦</button> : null;
  const bold = useMemo(() => boldPattern(resume), [given]);

  const changeFor = new Map((changes ?? []).map((change) => [change.lineageId, change]));
  const markOf = (lineageId?: string) => {
    const change = lineageId ? changeFor.get(lineageId) : undefined;
    return change && change.kind !== 'removed' ? ` diff-${change.kind}` : '';
  };
  const contact = resume.contact ?? { firstName: '', lastName: '', email: '' };
  const setContact = (key: keyof typeof contact) => (value: string) => onChange((d) => { d.contact = { ...(d.contact ?? contact), [key]: value }; });
  const projects = resume.projects ?? [];
  const certifications = resume.certifications ?? [];
  const customs = resume.customSections ?? [];

  const textBullets = (bullets: string[], key: string, context: string,
    update: (draft: RenderedResume, index: number, text: string) => void,
    insert: (draft: RenderedResume, index: number) => void,
    remove: (draft: RenderedResume, index: number) => void) => <>
    {(bullets.some(text => text.trim()) || !readOnly) && <ul className="doc-bullets">
      {bullets.map((text, index) => readOnly && !text.trim() ? null : (
        <li key={index} data-edit-item="bullet" data-edit-key={`${key}:bullet:${index}`} data-added={added === `${key}:bullet:${index}` || undefined}>
          <RichText value={text} bold={bold} readOnly={readOnly} placeholder="What you did, and what it changed."
            onChange={value => onChange(draft => update(draft, index, value))} />
          {!readOnly && <BulletControls text={text} context={context}
            rewriteLabel={onTailor ? 'Tailor this bullet for the job' : 'Rewrite with AI'}
            onRewrite={text.trim() ? (event) => ask({ text, context, kind: 'bullet', apply: (next, d) => update(d, index, next) }, event) : undefined}
            onAdd={() => addItem(`${key}:bullet:${index + 1}`, draft => insert(draft, index + 1))}
            onRemove={() => removeItem(bullets.length > 1 ? `${key}:bullet:${Math.min(index, bullets.length - 2)}` : `add-bullet:${key}`, draft => remove(draft, index))} />}
        </li>
      ))}
    </ul>}
    {!readOnly && <DocumentControl action="add" label="Add bullet" className="pro-add-bullet" controlKey={`add-bullet:${key}`}
      description={`Add a bullet to ${context}`} onClick={() => addItem(`${key}:bullet:${bullets.length}`, draft => insert(draft, bullets.length))} />}
  </>;

  /** A contact line: the filled fields, joined by " | ", with "Open for relocation" after the location when ticked. */
  const contactLine = (keys: Array<'phone' | 'email' | 'location' | 'linkedin' | 'github' | 'website'>) => {
    const filled = keys.filter((key) => String(contact[key] ?? '').trim());
    const relocation = keys.includes('location') && Boolean(contact.openToRelocation);
    if (!filled.length && !relocation) return null;
    return (
      <div className="doc-contact">
        {filled.map((key, index) => (
          <Fragment key={key}>
            {index > 0 && <span className="sep"> | </span>}
            <RichText line value={String(contact[key] ?? '')} placeholder={key} bold={null} readOnly={readOnly} onChange={setContact(key)} />
          </Fragment>
        ))}
        {relocation && <>{filled.length > 0 && <span className="sep"> | </span>}<span className="pro-text">Open for relocation</span></>}
      </div>
    );
  };

  // Skills grouped by category, in the order the groups first appear.
  const groups = new Map<string, number[]>();
  for (const [index, skill] of resume.skills.entries()) {
    if (readOnly && !skill.name.trim()) continue;
    if (!readOnly && skill.lineageId && skill.lineageId === newSkillLine) continue;
    const category = (skill.category ?? '').trim();
    groups.set(category, [...(groups.get(category) ?? []), index]);
  }

  const sections: Record<BuiltInSection, ReactNode> = {
    summary: (resume.summaries.default ?? '').trim() || !readOnly ? (
      <section className="doc-section" data-section="summary">
        <h2>
          Professional Summary
          {!readOnly && (resume.summaries.default || onTailor) && (
            <button className="ai" title={onTailor ? (resume.summaries.default ? 'Tailor the summary for the job' : 'Write a summary for the job from your CV') : 'Rewrite with AI'}
              onClick={(event) => ask({
                text: resume.summaries.default ?? '',
                kind: 'summary',
                apply: (next, d) => { d.summaries = { ...d.summaries, default: next }; },
              }, event)}>✦</button>
          )}
          {removeSection('summary', 'Professional Summary')}
        </h2>
        <p className="doc-summary pro-justify">
          <RichText value={resume.summaries.default ?? ''} bold={bold} readOnly={readOnly}
            placeholder="Two or three sentences: what you do, in what domain, at what depth."
            onChange={(v) => onChange((d) => { d.summaries = { ...d.summaries, default: v }; })} />
        </p>
      </section>
    ) : null,
    experience: (
      <section className="doc-section" data-section="experience">
        <h2 tabIndex={-1} data-control-key="experience-heading">
          Professional Experience
          {tailorButton('Tailor every job for this job posting', (event) => askAll(resume.experiences.flatMap((_, i) => roleTargets(i)), event))}
          {removeSection('experience', 'Professional Experience')}
        </h2>
        {resume.experiences.map((role, i) => (
          <article className={`doc-role pro-editable-role${markOf(role.lineageId)}`} key={role.lineageId ?? i} data-edit-item="role" data-edit-key={role.lineageId}>
            <div className="doc-roleline">
              <span className="doc-company">
                <RichText line value={role.company} placeholder="Company" bold={null} readOnly={readOnly} onChange={(v) => onChange((d) => { d.experiences[i]!.company = v; })} />
              </span>
              <span className="doc-dates">{range(role.from, role.to, role.current)}</span>
              {tailorButton(`Tailor ${role.title || 'this job'} at ${role.company || 'this company'}: its project and bullets`, (event) => askAll(roleTargets(i), event), 'pro-tailor-role')}
              {!readOnly && (
                <DocumentControl action="remove" label="Remove experience" title="Remove role" description={`Remove experience: ${role.title} at ${role.company}`}
                  onClick={() => removeItem(resume.experiences[i + 1]?.lineageId ?? resume.experiences[i - 1]?.lineageId ?? 'experience-heading', d => { d.experiences.splice(i, 1); })} />
              )}
            </div>
            <div className="doc-subline">
              <span className="doc-title">
                <RichText line value={role.title} placeholder="Title" bold={null} readOnly={readOnly} onChange={(v) => onChange((d) => { d.experiences[i]!.title = v; })} />
                {role.client?.trim() && <span> at {role.client}</span>}
              </span>
              {role.location?.trim() && <span className="doc-place">{role.location}</span>}
            </div>
            {/* The job's description: its own paragraph under the title line, before the bullets. */}
            {((role.blurb ?? '').trim() || (!readOnly && describing === (role.lineageId ?? String(i)))) && (
              <div className="doc-role-desc" data-edit-item="description" data-edit-key={`description:${role.lineageId ?? i}`}
                onBlur={(event) => {
                  // Left empty: the place closes again, so it takes no room on the page.
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.querySelector('.pro-text')?.textContent?.trim()) setDescribing(null);
                }}>
                <RichText value={role.blurb ?? ''} bold={bold} readOnly={readOnly} placeholder="What the role or project was: the product, the team, the scale."
                  onChange={(v) => { onChange((d) => { d.experiences[i]!.blurb = v; }); if (!v.trim()) setDescribing(null); }} />
                {!readOnly && <span className="doc-bulletmeta">
                  {tailorButton('Tailor the description for the job', (event) => ask({ text: role.blurb ?? '', context: `${role.title} at ${role.company}`, kind: 'blurb',
                    apply: (next, d) => { d.experiences[i]!.blurb = next; } }, event))}
                  <DocumentControl action="remove" compact label="Remove description" description={`Remove the description of ${role.title} at ${role.company}`}
                    onClick={() => { setDescribing(null); removeItem(`add-description:${role.lineageId ?? i}`, (d) => { d.experiences[i]!.blurb = ''; }); }} />
                </span>}
              </div>
            )}
            {!readOnly && !(role.blurb ?? '').trim() && describing !== (role.lineageId ?? String(i)) && (
              <DocumentControl action="add" label="Add description" className="pro-add-description" controlKey={`add-description:${role.lineageId ?? i}`}
                description={`Add a description to ${role.title} at ${role.company}`}
                onClick={() => { setDescribing(role.lineageId ?? String(i)); setFocusTarget({ key: `description:${role.lineageId ?? i}` }); }} />
            )}
            <ul className="doc-bullets">
              {(role.achievements ?? []).map((bullet, j) => readOnly && !bullet.bullet.trim() ? null : (
                <li key={bullet.lineageId ?? j} className={markOf(bullet.lineageId)} data-edit-item="bullet" data-edit-key={bullet.lineageId} data-added={added === bullet.lineageId || undefined}>
                  {readOnly && changeFor.get(bullet.lineageId ?? '')?.kind === 'changed'
                    ? <DiffText before={String(changeFor.get(bullet.lineageId!)!.before?.bullet ?? '')} after={bullet.bullet} />
                    : <RichText value={bullet.bullet} bold={bold} readOnly={readOnly} placeholder="What you did, and what it changed."
                        onChange={(v) => onChange((d) => { d.experiences[i]!.achievements[j]!.bullet = v; })} />}
                  {!readOnly && <BulletControls text={bullet.bullet} context={`${role.title} at ${role.company}`}
                    rewriteLabel={onTailor ? 'Tailor this bullet for the job' : 'Rewrite with AI'}
                    onAdd={() => addExperienceBullet(i, j + 1)}
                    onRemove={() => removeItem(role.achievements[j + 1]?.lineageId ?? role.achievements[j - 1]?.lineageId ?? `add-bullet:${role.lineageId ?? i}`, d => { d.experiences[i]!.achievements.splice(j, 1); })}
                    onRewrite={(event) => ask({
                          text: bullet.bullet,
                          context: `${role.title} at ${role.company}`,
                          kind: 'bullet',
                          apply: (next, d) => { d.experiences[i]!.achievements[j]!.bullet = next; },
                        }, event)} />}
                </li>
              ))}
            </ul>
            {/* The job's tools: one line under its bullets, "Tech stack: Node.js, TypeScript". */}
            {((role.techStack ?? '').trim() || (!readOnly && stacking === (role.lineageId ?? String(i)))) && (
              <div className="doc-role-stack" data-edit-item="tech-stack" data-edit-key={`tech-stack:${role.lineageId ?? i}`}
                onBlur={(event) => {
                  // Left empty: the line closes again, so it takes no room on the page.
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.querySelector('.pro-text')?.textContent?.trim()) setStacking(null);
                }}>
                <b className="doc-stack-label">Tech stack: </b>
                <RichText line value={role.techStack ?? ''} bold={null} readOnly={readOnly} placeholder="The tools of this job, separated by commas"
                  onChange={(v) => {
                    const list = v.replace(/^\s*tech(?:nology)?\s+stack\s*:\s*/i, '').trim();
                    onChange((d) => { d.experiences[i]!.techStack = list; });
                    if (!list) setStacking(null);
                  }} />
                {!readOnly && <span className="doc-bulletmeta">
                  {tailorButton('Tailor the tech stack for the job', (event) => ask({ text: role.techStack ?? '', context: roleLines(role), kind: 'techStack',
                    apply: (next, d) => { d.experiences[i]!.techStack = next; } }, event))}
                  <DocumentControl action="remove" compact label="Remove tech stack" description={`Remove the tech stack of ${role.title} at ${role.company}`}
                    onClick={() => { setStacking(null); removeItem(`add-tech-stack:${role.lineageId ?? i}`, (d) => { d.experiences[i]!.techStack = ''; }); }} />
                </span>}
              </div>
            )}
            {!readOnly && <DocumentControl action="add" label="Add bullet" className="pro-add-bullet" controlKey={`add-bullet:${role.lineageId ?? i}`}
              description={`Add a bullet to ${role.title} at ${role.company}`} onClick={() => addExperienceBullet(i, role.achievements.length)} />}
            {!readOnly && !(role.techStack ?? '').trim() && stacking !== (role.lineageId ?? String(i)) && (
              <DocumentControl action="add" label="Add tech stack" className="pro-add-stack" controlKey={`add-tech-stack:${role.lineageId ?? i}`}
                description={`Add a tech stack to ${role.title} at ${role.company}`}
                onClick={() => { setStacking(role.lineageId ?? String(i)); setFocusTarget({ key: `tech-stack:${role.lineageId ?? i}` }); }} />
            )}
          </article>
        ))}
      </section>
    ),
    projects: projects.length > 0 && (
      <section className="doc-section" data-section="projects">
        <h2>Projects{removeSection('projects', 'Projects')}</h2>
        {projects.map((project, i) => (
          <article className={`doc-role pro-editable-role${markOf(project.lineageId)}`} key={project.lineageId ?? i}>
            <div className="doc-roleline">
              <span className="doc-company"><b>{project.name || 'Project'}</b></span>
              <span className="doc-dates">{range(project.from, project.to, project.current)}</span>
              {tailorButton(`Tailor ${project.name || 'this project'} for the job`, (event) => askAll(project.bullets.flatMap((text, j) => text.trim()
                ? [{ text, context: project.name, kind: 'bullet', label: `${project.name || 'Project'} · bullet ${j + 1}`,
                    apply: (next: string, d: RenderedResume) => { d.projects![i]!.bullets[j] = next; } }] : []), event), 'pro-tailor-role')}
            </div>
            {(project.role || project.link) && (
              <div className="doc-subline">
                <span className="doc-title">{[project.role, project.link].filter(Boolean).join(' | ')}</span>
              </div>
            )}
            {textBullets(project.bullets, `project:${project.lineageId ?? i}`, project.name || 'this project',
              (d, j, value) => { d.projects![i]!.bullets[j] = value; },
              (d, j) => { d.projects![i]!.bullets.splice(j, 0, ''); },
              (d, j) => { d.projects![i]!.bullets.splice(j, 1); })}
          </article>
        ))}
      </section>
    ),
    skills: (groups.size > 0 || !readOnly) && (
      <section className="doc-section pro-section" data-section="skills">
        <h2>
          Skills
          {tailorButton('Tailor every skills line for the job', (event) => askAll([...groups].map(([category, indices]) => skillTarget(category, indices)), event))}
          {removeSection('skills', 'Skills')}
        </h2>
        <ul className="doc-bullets">
          {[...groups].map(([category, indices]) => {
            const separator = indices.some((index) => resume.skills[index]!.name.includes(',')) ? ' | ' : ', ';
            return (
              <li key={category} data-edit-item="skill-group">
                <span className="pro-text">
                  {(category || (!readOnly && typingOther)) && <b>
                    <span data-edit-key={category ? undefined : 'skill-type:other'}
                      onBlur={(event) => { if (!category && !event.currentTarget.contains(event.relatedTarget as Node | null)) setTypingOther(false); }}>
                      <RichText line value={category} placeholder="Skill type" bold={null} readOnly={readOnly}
                        onChange={(value) => { onChange((d) => { for (const index of indices) d.skills[index]!.category = value.trim(); }); setTypingOther(false); }} />
                    </span>
                    {': '}
                  </b>}
                  {indices.map((index, position) => {
                    const skill = resume.skills[index]!;
                    return (
                      <Fragment key={skill.lineageId ?? index}>
                        {position > 0 && separator}
                        <span className="pro-skill" data-edit-item="skill" data-edit-key={skill.lineageId} data-added={added === skill.lineageId || undefined}
                          onMouseEnter={(event) => skillCard.point(skill.name, event.currentTarget, { notWhileTyping: true })} onMouseLeave={skillCard.leave} onFocus={skillCard.leave}>
                          <RichText line value={skill.name.trim()} placeholder="Skill" bold={null} readOnly={readOnly}
                            onChange={(value) => onChange((d) => { d.skills[index]!.name = value.trim(); })} />
                          {!readOnly && <DocumentControl action="remove" label="Remove skill" title={`Remove ${skill.name || 'skill'}`} description={`Remove skill: ${skill.name || 'empty skill'}`}
                            onClick={() => removeItem(resume.skills[index + 1]?.lineageId ?? resume.skills[index - 1]?.lineageId ?? 'add-skill', d => { d.skills.splice(index, 1); })} />}
                        </span>
                      </Fragment>
                    );
                  })}
                </span>
                {!readOnly && <span className="doc-bulletmeta">
                  {tailorButton(`Tailor the ${category || 'skills'} line for the job`, (event) => ask(skillTarget(category, indices), event))}
                  <DocumentControl action="add" compact label="Add skill" className="inline" description={`Add a skill at the end of ${category || 'the untyped skills'}`} onClick={() => {
                    const id = crypto.randomUUID(); addItem(id, d => { d.skills.push({ lineageId: id, name: '', category }); });
                  }} />
                  {!category && <button type="button" className="doc-add pro-add inline pro-add-type" title="Add skill type"
                    aria-label="Add a type, such as Languages, at the start of this skills line"
                    onClick={() => { setTypingOther(true); setFocusTarget({ key: 'skill-type:other' }); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" />
                    </svg>
                  </button>}
                </span>}
              </li>
            );
          })}
          {/* A new line: its type first (optional), then the skill. Leaving it puts the skill on
              the line of that type, or with the untyped skills; an empty skill goes away. */}
          {!readOnly && newSkillLine && (() => {
            const index = resume.skills.findIndex((skill) => skill.lineageId === newSkillLine);
            const skill = resume.skills[index];
            if (!skill) return null;
            return (
              <li data-edit-item="skill-group" className="pro-new-skill-line"
                onBlur={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  const id = newSkillLine;
                  setNewSkillLine(null);
                  // The line's own fields commit first (their blur runs before this one), and
                  // both editors apply changes on top of the latest draft.
                  onChange((d) => { d.skills = d.skills.filter((s) => s.lineageId !== id || s.name.trim()); });
                }}>
                <span className="pro-text">
                  <b>
                    <span data-edit-key={`skill-type:${newSkillLine}`} onKeyDownCapture={(event) => {
                      // Enter goes on to the skill rather than leaving the line.
                      if (event.key !== 'Enter') return;
                      event.preventDefault(); event.stopPropagation();
                      event.currentTarget.closest('li')?.querySelector<HTMLElement>('.pro-skill [contenteditable="true"]')?.focus();
                    }}>
                      <RichText line value={skill.category ?? ''} placeholder="Skill type (optional)" bold={null}
                        onChange={(value) => onChange((d) => { const s = d.skills.find((x) => x.lineageId === newSkillLine); if (s) s.category = value.trim(); })} />
                    </span>
                    {': '}
                  </b>
                  <span className="pro-skill" data-edit-key={`skill-name:${newSkillLine}`}>
                    <RichText line value={skill.name} placeholder="Skill" bold={null}
                      onChange={(value) => onChange((d) => { const s = d.skills.find((x) => x.lineageId === newSkillLine); if (s) s.name = value.trim(); })} />
                  </span>
                </span>
              </li>
            );
          })()}
        </ul>
        {!readOnly && <DocumentControl action="add" label="Add skill" controlKey="add-skill"
          description="Add a skill on a new line, with an optional type such as Languages" onClick={() => {
          const id = crypto.randomUUID();
          setNewSkillLine(id);
          onChange((d) => { d.skills.push({ lineageId: id, name: '', category: '' }); });
          setFocusTarget({ key: `skill-type:${id}` });
        }} />}
      </section>
    ),
    education: (resume.educations.length > 0 || !readOnly) && (
      <section className="doc-section pro-section" data-section="education">
        <h2>Education{removeSection('education', 'Education')}</h2>
        {resume.educations.map((row, i) => (
          <article className={`doc-role doc-education${markOf(row.lineageId)}`} key={row.lineageId ?? i} data-edit-item="education" data-edit-key={row.lineageId} data-added={added === row.lineageId || undefined}>
            <div className="doc-roleline">
              <span className="doc-company">
                <RichText line value={row.institution} placeholder="Institution" bold={null} readOnly={readOnly} onChange={(v) => onChange((d) => { d.educations[i]!.institution = v; })} />
              </span>
              <span className="doc-dates">
                {(row.from || !readOnly) && <RichText line value={monthYear(row.from)} placeholder="Education start date" bold={null} readOnly={readOnly}
                  onChange={(value) => onChange((d) => { d.educations[i]!.from = dateForSave(value); })} />}
                {((row.from && row.to) || !readOnly) && ' - '}
                {(row.to || !readOnly) && <RichText line value={monthYear(row.to)} placeholder="Education end date" bold={null} readOnly={readOnly}
                  onChange={(value) => onChange((d) => { d.educations[i]!.to = dateForSave(value); })} />}
              </span>
              {!readOnly && <DocumentControl action="remove" label="Remove education" description={`Remove education: ${row.institution || 'empty education'}`}
                onClick={() => removeItem(resume.educations[i + 1]?.lineageId ?? resume.educations[i - 1]?.lineageId ?? 'add-education', d => { d.educations.splice(i, 1); })} />}
            </div>
            {([row.degree, row.field].some((v) => v?.trim()) || !readOnly) && (
              <div className="doc-subline">
                <span className="doc-title">
                  <EducationDegree value={row.degree ?? ''} hasField={Boolean(row.field?.trim())} readOnly={readOnly}
                    onChange={(value) => onChange((d) => { d.educations[i]!.degree = value; })} />
                  {(row.field?.trim() || !readOnly) && <RichText line value={row.field ?? ''} placeholder="Field of study" bold={null} readOnly={readOnly}
                    onChange={(value) => onChange((d) => { d.educations[i]!.field = value; })} />}
                </span>
              </div>
            )}
          </article>
        ))}
        {!readOnly && <DocumentControl action="add" label="Add education" controlKey="add-education" onClick={() => {
          const id = crypto.randomUUID(); addItem(id, d => { d.educations.push({ lineageId: id, institution: '', degree: '', field: '', from: '', to: '' }); });
        }} />}
      </section>
    ),
    certifications: certifications.length > 0 && (
      <section className="doc-section" data-section="certifications">
        <h2>Certifications{removeSection('certifications', 'Certifications')}</h2>
        {certifications.map((item, i) => (
          <article className={`doc-role doc-education${markOf(item.lineageId)}`} key={item.lineageId ?? i}>
            <div className="doc-roleline">
              <span className="doc-company"><b>{item.name || 'Certification'}</b></span>
              <span className="doc-dates">{monthYear(item.date)}</span>
            </div>
            {(item.issuer || item.link) && (
              <div className="doc-subline"><span className="doc-title">{[item.issuer, item.link].filter(Boolean).join(' | ')}</span></div>
            )}
          </article>
        ))}
      </section>
    ),
  };

  const custom = (lineageId: string) => {
    const item = customs.find((entry) => entry.lineageId === lineageId);
    if (!item || (readOnly && !item.text?.trim() && !item.bullets.some(text => text.trim()))) return null;
    return (
      <section className={`doc-section pro-editable-role${markOf(item.lineageId)}`} data-section={`custom:${lineageId}`}>
        <h2>{item.title || 'Section'}{removeSection(`custom:${lineageId}`, item.title || 'this section')}</h2>
        {item.text?.trim() && <p className="doc-paragraph pro-justify">{rich(item.text, bold)}</p>}
        {textBullets(item.bullets, `custom:${lineageId}`, item.title || 'this section',
          (d, j, value) => { d.customSections!.find(row => row.lineageId === lineageId)!.bullets[j] = value; },
          (d, j) => { d.customSections!.find(row => row.lineageId === lineageId)!.bullets.splice(j, 0, ''); },
          (d, j) => { d.customSections!.find(row => row.lineageId === lineageId)!.bullets.splice(j, 1); })}
      </section>
    );
  };
  const hidden = new Set(theme.hiddenSections ?? []);
  const name = [contact.firstName, contact.lastName];

  return (
    <div ref={root} className={`page tpl-professional${readOnly ? ' read-only' : ''}`} style={themeVars(theme)}>
      <header className="doc-head" data-section="header">
        <h1>
          <RichText line value={name[0] ?? ''} placeholder="First" bold={null} readOnly={readOnly} onChange={setContact('firstName')} />
          {' '}
          <RichText line value={name[1] ?? ''} placeholder="Last" bold={null} readOnly={readOnly} onChange={setContact('lastName')} />
        </h1>
        {contact.headline?.trim() && (
          <div className="doc-headline">
            {contact.headline}
            {onTailor && (
              <button className="ai doc-headline-ai" title="Tailor the headline for the job"
                onClick={(event) => ask({
                  text: contact.headline ?? '',
                  kind: 'headline',
                  apply: (next, d) => { d.contact = { ...(d.contact ?? contact), headline: next }; },
                }, event)}>✦</button>
            )}
          </div>
        )}
        {contactLine(['phone', 'email', 'location'])}
        {contactLine(['linkedin', 'github', 'website'])}
      </header>

      {sectionOrder(theme, customs.flatMap((entry) => (entry.lineageId ? [entry.lineageId] : [])))
        .filter((key) => !hidden.has(key))
        .map((key) => (
          <Fragment key={key}>
            {key.startsWith('custom:') ? custom(key.slice('custom:'.length)) : sections[key as BuiltInSection]}
          </Fragment>
        ))}

      {skillCard.card}

      {rewriting && resumeId && (
        <RewritePopover
          resumeId={resumeId}
          text={rewriting.text}
          context={rewriting.context}
          kind={rewriting.kind}
          onAccept={(next) => onChange((d) => rewriting.apply(next, d))}
          onClose={() => setRewriting(null)}
        />
      )}
    </div>
  );
}
