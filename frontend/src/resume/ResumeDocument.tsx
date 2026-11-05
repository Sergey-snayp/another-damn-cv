import { Fragment, useState } from 'react';
import type { RenderedResume } from '../resumeApi';
import { Editable } from './Editable';
import { RewritePopover } from './RewritePopover';
import { DiffText } from './DiffText';
import type { Change } from '../resumeApi';
import { sectionOrder, themeVars, type BuiltInSection, type ResumeTheme } from './theme';

const newId = () => crypto.randomUUID();

/**
 * The resume, rendered as the page it will become — and editable in place.
 *
 * Deliberately single column with real text and no tables: that is what an ATS
 * can parse, and it is what the whole project promises.
 */
/** Which line the rewrite popover is open on, if any. */
interface RewriteTarget {
  text: string;
  context?: string;
  kind: string;
  apply(next: string, draft: RenderedResume): void;
}

export function ResumeDocument({ resume, theme, onChange, readOnly, resumeId, changes }: {
  resume: RenderedResume;
  theme: ResumeTheme;
  onChange(change: (draft: RenderedResume) => void): void;
  /** Past versions are shown, never edited — history must not be rewritten. */
  readOnly?: boolean;
  resumeId?: string;
  /** When viewing history, marks what this version changed, in place. */
  changes?: Change[];
}) {
  const [rewriting, setRewriting] = useState<RewriteTarget | null>(null);

  // Indexed by lineage so any row can ask "what happened to me in this version?"
  const changeFor = new Map((changes ?? []).map((change) => [change.lineageId, change]));
  const removed = (table: string) =>
    (changes ?? []).filter((c) => c.kind === 'removed' && c.table === table);

  /** Marks a row added or reworded; removed rows are rendered separately. */
  const markOf = (lineageId?: string) => {
    const change = lineageId ? changeFor.get(lineageId) : undefined;
    return change && change.kind !== 'removed' ? ` diff-${change.kind}` : '';
  };
  const contact = resume.contact ?? { firstName: '', lastName: '', email: '' };
  const links = [contact.linkedin, contact.github, contact.website].filter(Boolean);

  const projects = resume.projects ?? [];
  const certifications = resume.certifications ?? [];
  const customs = resume.customSections ?? [];
  const span = (from?: string | null, to?: string | null, current?: boolean) =>
    [from, current ? 'Present' : to].filter(Boolean).join(' – ');

  // Each section, drawn in the order the editor saved; hidden ones are left out.
  // Projects, certifications and custom sections are edited in the editor's
  // forms and left off the CV while empty.
  const sections: Record<BuiltInSection, React.ReactNode> = {
    projects: projects.length > 0 && (
      <section className="doc-section" data-section="projects">
        <h2>Projects</h2>
        {projects.map((project, i) => (
          <article className={`doc-role${markOf(project.lineageId)}`} key={project.lineageId ?? i}>
            <div className="doc-roleline">
              <span className="doc-company doc-text"><b>{project.name || 'Project'}</b></span>
              {project.role && <><span className="doc-sep">|</span><span className="doc-text">{project.role}</span></>}
              {project.link && <><span className="doc-sep">|</span><span className="doc-text doc-link">{project.link}</span></>}
              <span className="doc-dates">{span(project.from, project.to, project.current)}</span>
            </div>
            {project.bullets.some((bullet) => bullet.trim()) && (
              <ul className="doc-bullets">
                {project.bullets.filter((bullet) => bullet.trim()).map((bullet, j) => <li key={j}><span>{bullet}</span></li>)}
              </ul>
            )}
          </article>
        ))}
      </section>
    ),
    certifications: certifications.length > 0 && (
      <section className="doc-section" data-section="certifications">
        <h2>Certifications</h2>
        {certifications.map((item, i) => (
          <div className={`doc-roleline${markOf(item.lineageId)}`} key={item.lineageId ?? i}>
            <span className="doc-company doc-text"><b>{item.name || 'Certification'}</b></span>
            {item.issuer && <><span className="doc-sep">|</span><span className="doc-text">{item.issuer}</span></>}
            {item.link && <><span className="doc-sep">|</span><span className="doc-text doc-link">{item.link}</span></>}
            <span className="doc-dates">{item.date}</span>
          </div>
        ))}
      </section>
    ),
    summary: (
      <section className="doc-section" data-section="summary">
        <h2>
          Summary
          {!readOnly && resume.summaries.default && (
            <button className="ai" title="Rewrite with AI"
              onClick={() => setRewriting({
                text: resume.summaries.default ?? '',
                kind: 'summary',
                apply: (next: string, d: RenderedResume) => { d.summaries = { ...d.summaries, default: next }; },
              })}>✦</button>
          )}
        </h2>
        {readOnly && (changes ?? []).some((c) => c.table === 'summaryVariant' && c.kind === 'changed')
          ? <DiffText
              before={String((changes ?? []).find((c) => c.table === 'summaryVariant')!.before?.text ?? '')}
              after={resume.summaries.default ?? ''}
            />
          : <Editable
              multiline
              className="doc-summary"
              value={resume.summaries.default ?? ''}
              placeholder="Two or three sentences. What you do, in what domain, at what depth."
              onChange={(v) => onChange((d) => { d.summaries = { ...d.summaries, default: v }; })}
            />}
      </section>
    ),
    experience: (
      <section className="doc-section" data-section="experience">
        <h2>Experience</h2>

        {resume.experiences.map((role, i) => (
          <article className={`doc-role${markOf(role.lineageId)}`} key={role.lineageId ?? i}>
            <div className="doc-roleline">
              <span className="doc-company">
                <Editable value={role.company} placeholder="Company"
                  onChange={(v) => onChange((d) => { d.experiences[i]!.company = v; })} />
              </span>
              <span className="doc-sep">|</span>
              <Editable value={role.title} placeholder="Title"
                onChange={(v) => onChange((d) => { d.experiences[i]!.title = v; })} />
              <span className="doc-dates">
                <Editable value={role.from} placeholder="2023-11"
                  onChange={(v) => onChange((d) => { d.experiences[i]!.from = v; })} />
                {' – '}
                <Editable value={role.current ? 'Present' : (role.to ?? '')} placeholder="2025-04"
                  onChange={(v) => onChange((d) => {
                    d.experiences[i]!.to = v;
                    d.experiences[i]!.current = /present/i.test(v);
                  })} />
              </span>
              <button className="doc-remove" title="Remove role"
                onClick={() => onChange((d) => { d.experiences.splice(i, 1); })}>×</button>
            </div>

            <ul className="doc-bullets">
              {role.achievements.map((bullet, j) => (
                <li key={bullet.lineageId ?? j} className={markOf(bullet.lineageId)}>
                  {readOnly && changeFor.get(bullet.lineageId ?? '')?.kind === 'changed'
                    ? <DiffText
                        before={String(changeFor.get(bullet.lineageId!)!.before?.bullet ?? '')}
                        after={bullet.bullet}
                      />
                    : <Editable
                        multiline
                        value={bullet.bullet}
                        placeholder="What you did, and what it changed."
                        onChange={(v) => onChange((d) => {
                          d.experiences[i]!.achievements[j]!.bullet = v;
                        })}
                      />}
                  <span className="doc-bulletmeta">
                    <button className="ai" title="Rewrite with AI"
                      onClick={() => setRewriting({
                        text: bullet.bullet,
                        context: `${role.title} at ${role.company}`,
                        kind: 'bullet',
                        apply: (next: string, d: RenderedResume) => { d.experiences[i]!.achievements[j]!.bullet = next; },
                      })}>✦</button>
                    <button
                      className={bullet.verified ? 'verified on' : 'verified'}
                      title={bullet.verified ? 'Evidenced' : 'Self-reported — click to mark evidenced'}
                      onClick={() => onChange((d) => {
                        const a = d.experiences[i]!.achievements[j]!;
                        a.verified = !a.verified;
                      })}>✓</button>
                    <button className="doc-remove" title="Remove bullet"
                      onClick={() => onChange((d) => {
                        d.experiences[i]!.achievements.splice(j, 1);
                      })}>×</button>
                  </span>
                </li>
              ))}
            </ul>

            {readOnly && removed('achievement')
              .filter((c) => c.before?.experienceLineageId === role.lineageId)
              .map((c) => (
                <ul className="doc-bullets" key={c.lineageId}>
                  <li className="diff-removed"><span>{String(c.before?.bullet ?? '')}</span></li>
                </ul>
              ))}

            <button className="doc-add" onClick={() => onChange((d) => {
              d.experiences[i]!.achievements.push({
                experienceLineageId: role.lineageId ?? newId(), bullet: '',
              } as never);
            })}>+ bullet</button>
          </article>
        ))}

        {readOnly && removed('experienceEntry').map((c) => (
          <article className="doc-role diff-removed" key={c.lineageId}>
            <div className="doc-roleline">
              <span className="doc-company">{String(c.before?.company ?? '')}</span>
              <span className="doc-sep">|</span>
              <span>{String(c.before?.title ?? '')}</span>
              <span className="doc-dates">
                {String(c.before?.from ?? '')} – {String(c.before?.to ?? '') || 'Present'}
              </span>
            </div>
          </article>
        ))}

        <button className="doc-add" onClick={() => onChange((d) => {
          d.experiences.push({ company: '', title: '', from: '', achievements: [] } as never);
        })}>+ role</button>
      </section>
    ),
    education: (
      <section className="doc-section" data-section="education">
        <h2>Education</h2>

        {resume.educations.map((row, i) => (
          <div className="doc-roleline" key={row.lineageId ?? i}>
            <span className="doc-company">
              <Editable value={row.institution} placeholder="Institution"
                onChange={(v) => onChange((d) => { d.educations[i]!.institution = v; })} />
            </span>
            <span className="doc-sep">|</span>
            <Editable value={row.degree} placeholder="B.Sc."
              onChange={(v) => onChange((d) => { d.educations[i]!.degree = v; })} />
            {' '}
            <Editable value={row.field ?? ''} placeholder="Field"
              onChange={(v) => onChange((d) => { d.educations[i]!.field = v; })} />
            <span className="doc-dates">
              <Editable value={row.from} placeholder="2012"
                onChange={(v) => onChange((d) => { d.educations[i]!.from = v; })} />
              {' – '}
              <Editable value={row.to ?? ''} placeholder="2016"
                onChange={(v) => onChange((d) => { d.educations[i]!.to = v; })} />
            </span>
            <button className="doc-remove"
              onClick={() => onChange((d) => { d.educations.splice(i, 1); })}>×</button>
          </div>
        ))}

        <button className="doc-add" onClick={() => onChange((d) => {
          d.educations.push({ institution: '', degree: '', from: '' } as never);
        })}>+ education</button>
      </section>
    ),
    skills: (
      <section className="doc-section" data-section="skills">
        <h2>Skills</h2>
        <div className="doc-skills">
          {resume.skills.map((skill, i) => (
            <span className={`doc-skill${markOf(skill.lineageId)}`} key={skill.lineageId ?? i}>
              <Editable value={skill.name} placeholder="Skill"
                onChange={(v) => onChange((d) => { d.skills[i]!.name = v; })} />
              <button className="doc-remove"
                onClick={() => onChange((d) => { d.skills.splice(i, 1); })}>×</button>
            </span>
          ))}
          {readOnly && removed('skillEntry').map((c) => (
            <span className="doc-skill diff-removed" key={c.lineageId}>
              {String(c.before?.name ?? '')}
            </span>
          ))}

          <button className="doc-add inline" onClick={() => onChange((d) => {
            d.skills.push({ name: '', category: '' } as never);
          })}>+</button>
        </div>
      </section>
    ),
  };
  const hidden = new Set(theme.hiddenSections ?? []);

  const custom = (lineageId: string) => {
    const item = customs.find((entry) => entry.lineageId === lineageId);
    const bullets = item?.bullets.filter((bullet) => bullet.trim()) ?? [];
    if (!item || (!item.text?.trim() && !bullets.length)) return null;
    return (
      <section className={`doc-section${markOf(item.lineageId)}`} data-section={`custom:${lineageId}`}>
        <h2>{item.title || 'Section'}</h2>
        {item.text?.trim() && <p className="doc-text doc-paragraph">{item.text}</p>}
        {bullets.length > 0 && (
          <ul className="doc-bullets">{bullets.map((bullet, j) => <li key={j}><span>{bullet}</span></li>)}</ul>
        )}
      </section>
    );
  };

  return (
    <div
      className={`page tpl-${theme.template}${readOnly ? ' read-only' : ''}`}
      style={themeVars(theme)}
    >

      <header className="doc-head" data-section="header">
        <h1>
          <Editable value={contact.firstName} placeholder="First"
            onChange={(v) => onChange((d) => { d.contact = { ...contact, firstName: v }; })} />
          {' '}
          <Editable value={contact.lastName} placeholder="Last"
            onChange={(v) => onChange((d) => { d.contact = { ...contact, lastName: v }; })} />
        </h1>

        {contact.headline?.trim() && <div className="doc-headline">{contact.headline}</div>}

        <div className="doc-contact">
          <Editable value={contact.email} placeholder="email@example.com"
            onChange={(v) => onChange((d) => { d.contact = { ...contact, email: v }; })} />
          <span className="sep">·</span>
          <Editable value={contact.phone ?? ''} placeholder="phone"
            onChange={(v) => onChange((d) => { d.contact = { ...contact, phone: v }; })} />
          <span className="sep">·</span>
          <Editable value={contact.location ?? ''} placeholder="City, Country"
            onChange={(v) => onChange((d) => { d.contact = { ...contact, location: v }; })} />
        </div>

        <div className="doc-contact">
          <Editable value={contact.linkedin ?? ''} placeholder="linkedin.com/in/…"
            onChange={(v) => onChange((d) => { d.contact = { ...contact, linkedin: v }; })} />
          {links.length > 0 && <span className="sep">·</span>}
          <Editable value={contact.github ?? ''} placeholder="github.com/…"
            onChange={(v) => onChange((d) => { d.contact = { ...contact, github: v }; })} />
        </div>
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
