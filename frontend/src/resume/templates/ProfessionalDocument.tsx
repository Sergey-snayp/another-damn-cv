import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { RenderedResume } from '../../resumeApi';
import { RewritePopover } from '../RewritePopover';
import { DiffText } from '../DiffText';
import { sectionOrder, themeVars, type BuiltInSection } from '../theme';
import type { ResumeDocumentProps, RewriteTarget } from '../ResumeDocument';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-10" → "Oct 2024"; anything else as written. */
export function monthYear(value?: string | null): string {
  const text = (value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : text;
}

const range = (from?: string | null, to?: string | null, current?: boolean) =>
  [monthYear(from), current ? 'Present' : monthYear(to)].filter(Boolean).join(' - ');

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

/**
 * The "professional" template: the layout of the candidate's own CV. Roboto,
 * black; the name in capitals; headings in capitals over a rule; per job the
 * company and dates in bold, then the title and place in italics; dash
 * bullets with the job's project first and skills set in bold; skills grouped
 * by category.
 */
export function ProfessionalDocument({ resume: given, theme, onChange, readOnly, resumeId, changes, onTailor }: ResumeDocumentProps) {
  // A CV saved before a section existed, or still loading, may lack it.
  const resume = {
    ...given,
    experiences: given.experiences ?? [],
    educations: given.educations ?? [],
    skills: given.skills ?? [],
    summaries: given.summaries ?? {},
  };
  const [rewritingOwn, setRewriting] = useState<RewriteTarget | null>(null);
  const rewriting = onTailor ? null : rewritingOwn;
  const ask = (target: RewriteTarget, event: React.MouseEvent<HTMLElement>) => {
    if (!onTailor) { setRewriting(target); return; }
    onTailor(target, event.currentTarget.closest<HTMLElement>('li, .doc-section, .doc-head') ?? event.currentTarget);
  };
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
  const groups = new Map<string, string[]>();
  for (const skill of resume.skills) {
    if (!skill.name.trim()) continue;
    const category = (skill.category ?? '').trim();
    groups.set(category, [...(groups.get(category) ?? []), skill.name.trim()]);
  }

  const sections: Record<BuiltInSection, ReactNode> = {
    summary: (resume.summaries.default ?? '').trim() || !readOnly ? (
      <section className="doc-section" data-section="summary">
        <h2>
          Professional Summary
          {!readOnly && resume.summaries.default && (
            <button className="ai" title={onTailor ? 'Tailor the summary for the job' : 'Rewrite with AI'}
              onClick={(event) => ask({
                text: resume.summaries.default ?? '',
                kind: 'summary',
                apply: (next, d) => { d.summaries = { ...d.summaries, default: next }; },
              }, event)}>✦</button>
          )}
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
        <h2>Professional Experience</h2>
        {resume.experiences.map((role, i) => (
          <article className={`doc-role${markOf(role.lineageId)}`} key={role.lineageId ?? i}>
            <div className="doc-roleline">
              <span className="doc-company">
                <RichText line value={role.company} placeholder="Company" bold={null} readOnly={readOnly} onChange={(v) => onChange((d) => { d.experiences[i]!.company = v; })} />
              </span>
              <span className="doc-dates">{range(role.from, role.to, role.current)}</span>
              {!readOnly && (
                <button className="doc-remove" title="Remove role" onClick={() => onChange((d) => { d.experiences.splice(i, 1); })}>×</button>
              )}
            </div>
            <div className="doc-subline">
              <span className="doc-title">
                <RichText line value={role.title} placeholder="Title" bold={null} readOnly={readOnly} onChange={(v) => onChange((d) => { d.experiences[i]!.title = v; })} />
                {role.client?.trim() && <span> at {role.client}</span>}
              </span>
              {role.location?.trim() && <span className="doc-place">{role.location}</span>}
            </div>
            <ul className="doc-bullets">
              {(role.blurb ?? '').trim() && (
                <li>
                  <RichText label="Project:" value={role.blurb ?? ''} bold={bold} readOnly={readOnly} placeholder="What the project is."
                    onChange={(v) => onChange((d) => { d.experiences[i]!.blurb = v; })} />
                </li>
              )}
              {(role.achievements ?? []).map((bullet, j) => (
                <li key={bullet.lineageId ?? j} className={markOf(bullet.lineageId)}>
                  {readOnly && changeFor.get(bullet.lineageId ?? '')?.kind === 'changed'
                    ? <DiffText before={String(changeFor.get(bullet.lineageId!)!.before?.bullet ?? '')} after={bullet.bullet} />
                    : <RichText value={bullet.bullet} bold={bold} readOnly={readOnly} placeholder="What you did, and what it changed."
                        onChange={(v) => onChange((d) => { d.experiences[i]!.achievements[j]!.bullet = v; })} />}
                  {!readOnly && (
                    <span className="doc-bulletmeta">
                      <button className="ai" title={onTailor ? 'Tailor this bullet for the job' : 'Rewrite with AI'}
                        onClick={(event) => ask({
                          text: bullet.bullet,
                          context: `${role.title} at ${role.company}`,
                          kind: 'bullet',
                          apply: (next, d) => { d.experiences[i]!.achievements[j]!.bullet = next; },
                        }, event)}>✦</button>
                      {!onTailor && (
                        <button className="doc-remove" title="Remove bullet"
                          onClick={() => onChange((d) => { d.experiences[i]!.achievements.splice(j, 1); })}>×</button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <button className="doc-add" onClick={() => onChange((d) => {
              d.experiences[i]!.achievements.push({ experienceLineageId: role.lineageId ?? crypto.randomUUID(), bullet: '' } as never);
            })}>+ bullet</button>
          </article>
        ))}
      </section>
    ),
    projects: projects.length > 0 && (
      <section className="doc-section" data-section="projects">
        <h2>Projects</h2>
        {projects.map((project, i) => (
          <article className={`doc-role${markOf(project.lineageId)}`} key={project.lineageId ?? i}>
            <div className="doc-roleline">
              <span className="doc-company"><b>{project.name || 'Project'}</b></span>
              <span className="doc-dates">{range(project.from, project.to, project.current)}</span>
            </div>
            {(project.role || project.link) && (
              <div className="doc-subline">
                <span className="doc-title">{[project.role, project.link].filter(Boolean).join(' | ')}</span>
              </div>
            )}
            {project.bullets.some((b) => b.trim()) && (
              <ul className="doc-bullets">
                {project.bullets.filter((b) => b.trim()).map((b, j) => <li key={j}><span className="pro-text">{rich(b, bold)}</span></li>)}
              </ul>
            )}
          </article>
        ))}
      </section>
    ),
    skills: groups.size > 0 && (
      <section className="doc-section" data-section="skills">
        <h2>Skills</h2>
        <ul className="doc-bullets">
          {[...groups].map(([category, names]) => (
            <li key={category || 'skills'}>
              <span className="pro-text">{category && <b>{category}: </b>}{names.join(names.some((n) => n.includes(',')) ? ' | ' : ', ')}</span>
            </li>
          ))}
        </ul>
      </section>
    ),
    education: resume.educations.length > 0 && (
      <section className="doc-section" data-section="education">
        <h2>Education</h2>
        {resume.educations.map((row, i) => (
          <article className={`doc-role doc-education${markOf(row.lineageId)}`} key={row.lineageId ?? i}>
            <div className="doc-roleline">
              <span className="doc-company">
                <RichText line value={row.institution} placeholder="Institution" bold={null} readOnly={readOnly} onChange={(v) => onChange((d) => { d.educations[i]!.institution = v; })} />
              </span>
              <span className="doc-dates">{[row.from, row.to].map((v) => monthYear(v)).filter(Boolean).join(' - ')}</span>
            </div>
            {[row.degree, row.field].some((v) => v?.trim()) && (
              <div className="doc-subline">
                <span className="doc-title">{[row.degree, row.field].map((v) => v?.trim()).filter(Boolean).join(', ')}</span>
              </div>
            )}
          </article>
        ))}
      </section>
    ),
    certifications: certifications.length > 0 && (
      <section className="doc-section" data-section="certifications">
        <h2>Certifications</h2>
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
    const bullets = item?.bullets.filter((b) => b.trim()) ?? [];
    if (!item || (!item.text?.trim() && !bullets.length)) return null;
    return (
      <section className={`doc-section${markOf(item.lineageId)}`} data-section={`custom:${lineageId}`}>
        <h2>{item.title || 'Section'}</h2>
        {item.text?.trim() && <p className="doc-paragraph pro-justify">{rich(item.text, bold)}</p>}
        {bullets.length > 0 && <ul className="doc-bullets">{bullets.map((b, j) => <li key={j}><span className="pro-text">{rich(b, bold)}</span></li>)}</ul>}
      </section>
    );
  };
  const hidden = new Set(theme.hiddenSections ?? []);
  const name = [contact.firstName, contact.lastName];

  return (
    <div className={`page tpl-professional${readOnly ? ' read-only' : ''}`} style={themeVars(theme)}>
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
