import { useState, type ReactNode } from 'react';
import type { Contact, RenderedResume } from '../../resumeApi';
import { RewritePopover } from '../RewritePopover';
import { DashboardIcon } from '../../jobs/DashboardIcon';

export type Change = (mutate: (draft: RenderedResume) => void) => void;

const newId = () => crypto.randomUUID();

/** Moves the item at `from` one step up or down, in place. */
function move<T>(list: T[], from: number, step: -1 | 1) {
  const to = from + step;
  if (to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
}

function Field({ label, value, onChange, placeholder, multiline, wide }: {
  label: string;
  value: string;
  onChange(next: string): void;
  placeholder?: string;
  multiline?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`sf-field${wide || multiline ? ' wide' : ''}`}>
      <span>{label}</span>
      {multiline
        ? <textarea rows={4} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

/** Small up / down / remove buttons for a row in a list. */
function RowTools({ index, count, onMove, onRemove, removeLabel }: {
  index: number;
  count: number;
  onMove(step: -1 | 1): void;
  onRemove(): void;
  removeLabel: string;
}) {
  return (
    <span className="sf-tools">
      <button type="button" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><DashboardIcon name="arrowUp" size={14} /></button>
      <button type="button" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><DashboardIcon name="arrowDown" size={14} /></button>
      <button type="button" className="danger" title={removeLabel} onClick={onRemove}><DashboardIcon name="close" size={14} /></button>
    </span>
  );
}

interface Rewrite {
  text: string;
  context?: string;
  kind: string;
  apply(next: string, draft: RenderedResume): void;
}

/** One rewrite popover per form; the ✦ buttons open it on their line. */
function useRewrite(resumeId: string, onChange: Change): [(target: Rewrite) => void, ReactNode] {
  const [target, setTarget] = useState<Rewrite | null>(null);
  const popover = target && (
    <RewritePopover
      resumeId={resumeId}
      text={target.text}
      context={target.context}
      kind={target.kind}
      onAccept={(next) => onChange((d) => target.apply(next, d))}
      onClose={() => setTarget(null)}
    />
  );
  return [setTarget, popover];
}

export function HeaderForm({ resume, onChange }: { resume: RenderedResume; onChange: Change }) {
  const contact: Contact = resume.contact ?? { firstName: '', lastName: '', email: '' };
  const set = (key: keyof Contact) => (value: string) =>
    onChange((d) => { d.contact = { ...(d.contact ?? contact), [key]: value }; });
  return (
    <div className="sf-grid">
      <Field label="First name" value={contact.firstName} onChange={set('firstName')} />
      <Field label="Last name" value={contact.lastName} onChange={set('lastName')} />
      <Field label="Headline" value={contact.headline ?? ''} onChange={set('headline')} placeholder="Senior Backend Engineer" wide />
      <Field label="Email" value={contact.email} onChange={set('email')} placeholder="email@example.com" />
      <Field label="Phone" value={contact.phone ?? ''} onChange={set('phone')} />
      <Field label="Location" value={contact.location ?? ''} onChange={set('location')} placeholder="City, Country" wide />
      <label className="sf-check wide">
        <input type="checkbox" checked={Boolean(contact.openToRelocation)}
          onChange={(e) => onChange((d) => { d.contact = { ...(d.contact ?? contact), openToRelocation: e.target.checked }; })} />
        Open for relocation
      </label>
      <Field label="LinkedIn" value={contact.linkedin ?? ''} onChange={set('linkedin')} placeholder="linkedin.com/in/…" wide />
      <Field label="GitHub" value={contact.github ?? ''} onChange={set('github')} placeholder="github.com/…" />
      <Field label="Website" value={contact.website ?? ''} onChange={set('website')} />
    </div>
  );
}

export function SummaryForm({ resume, resumeId, onChange }: { resume: RenderedResume; resumeId: string; onChange: Change }) {
  const [rewrite, popover] = useRewrite(resumeId, onChange);
  const text = resume.summaries.default ?? '';
  return (
    <>
      <label className="sf-field wide">
        <span>
          Summary
          {text && (
            <button type="button" className="sf-ai" onClick={() => rewrite({
              text, kind: 'summary',
              apply: (next, d) => { d.summaries = { ...d.summaries, default: next }; },
            })}>✦ Rewrite</button>
          )}
        </span>
        <textarea rows={7} value={text}
          placeholder="Two or three sentences. What you do, in what domain, at what depth."
          onChange={(e) => onChange((d) => { d.summaries = { ...d.summaries, default: e.target.value }; })} />
      </label>
      <p className="sf-count">{text.trim() ? text.trim().split(/\s+/).length : 0} words</p>
      {popover}
    </>
  );
}

export function ExperienceForm({ resume, resumeId, onChange }: { resume: RenderedResume; resumeId: string; onChange: Change }) {
  const [open, setOpen] = useState<number | null>(resume.experiences.length === 1 ? 0 : null);
  const [rewrite, popover] = useRewrite(resumeId, onChange);
  const roles = resume.experiences;

  return (
    <>
      {roles.map((role, i) => {
        const set = (key: 'company' | 'title' | 'location' | 'from' | 'to') => (value: string) =>
          onChange((d) => { d.experiences[i]![key] = value; });
        return (
          <div className={`sf-item${open === i ? ' open' : ''}`} key={role.lineageId ?? i}>
            <div className="sf-item-head">
              <button type="button" className="sf-item-title" onClick={() => setOpen(open === i ? null : i)}>
                <b>{role.title || 'New role'}</b>
                <span>{[role.company, [role.from, role.current ? 'Present' : role.to].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</span>
              </button>
              <RowTools index={i} count={roles.length} removeLabel="Remove role"
                onMove={(step) => { onChange((d) => move(d.experiences, i, step)); setOpen(null); }}
                onRemove={() => {
                  if (!confirm(`Remove ${role.title || 'this role'}${role.company ? ` at ${role.company}` : ''}?`)) return;
                  onChange((d) => { d.experiences.splice(i, 1); });
                  setOpen(null);
                }} />
            </div>

            {open === i && (
              <div className="sf-item-body">
                <div className="sf-grid">
                  <Field label="Job title" value={role.title} onChange={set('title')} wide />
                  <Field label="Company" value={role.company} onChange={set('company')} />
                  <Field label="Location" value={role.location ?? ''} onChange={set('location')} />
                  <Field label="Start" value={role.from} onChange={set('from')} placeholder="2023-11" />
                  {role.current
                    ? <label className="sf-field"><span>End</span><input value="Present" disabled /></label>
                    : <Field label="End" value={role.to ?? ''} onChange={set('to')} placeholder="2025-04" />}
                  <label className="sf-check wide">
                    <input type="checkbox" checked={Boolean(role.current)}
                      onChange={(e) => onChange((d) => {
                        const r = d.experiences[i]!;
                        r.current = e.target.checked;
                        if (r.current) r.to = '';
                      })} />
                    I work here now
                  </label>
                  <label className="sf-field wide">
                    <span>Description</span>
                    <textarea rows={3} value={role.blurb ?? ''} placeholder="What the role or project was: the product, the team, the scale."
                      onChange={(e) => onChange((d) => { d.experiences[i]!.blurb = e.target.value; })} />
                  </label>
                  <label className="sf-field wide">
                    <span>Tech stack</span>
                    <input value={role.techStack ?? ''} placeholder="Node.js, TypeScript, PostgreSQL"
                      onChange={(e) => onChange((d) => { d.experiences[i]!.techStack = e.target.value; })} />
                  </label>
                </div>

                <p className="sf-label">Bullets</p>
                {role.achievements.map((bullet, j) => (
                  <div className="sf-bullet" key={bullet.lineageId ?? j}>
                    <textarea rows={2} value={bullet.bullet} placeholder="What you did, and what it changed."
                      onChange={(e) => onChange((d) => { d.experiences[i]!.achievements[j]!.bullet = e.target.value; })} />
                    <span className="sf-tools vertical">
                      <button type="button" title="Rewrite with AI" disabled={!bullet.bullet.trim()}
                        onClick={() => rewrite({
                          text: bullet.bullet,
                          context: `${role.title} at ${role.company}`,
                          kind: 'bullet',
                          apply: (next, d) => { d.experiences[i]!.achievements[j]!.bullet = next; },
                        })}><DashboardIcon name="sparkle" size={14} /></button>
                      <button type="button" title="Move up" disabled={j === 0}
                        onClick={() => onChange((d) => move(d.experiences[i]!.achievements, j, -1))}><DashboardIcon name="arrowUp" size={14} /></button>
                      <button type="button" title="Move down" disabled={j === role.achievements.length - 1}
                        onClick={() => onChange((d) => move(d.experiences[i]!.achievements, j, 1))}><DashboardIcon name="arrowDown" size={14} /></button>
                      <button type="button" className="danger" title="Remove bullet"
                        onClick={() => onChange((d) => { d.experiences[i]!.achievements.splice(j, 1); })}><DashboardIcon name="close" size={14} /></button>
                    </span>
                  </div>
                ))}
                <button type="button" className="sf-add" onClick={() => onChange((d) => {
                  const r = d.experiences[i]!;
                  r.lineageId ??= newId();
                  r.achievements.push({ lineageId: newId(), experienceLineageId: r.lineageId, bullet: '', verified: false });
                })}>+ Add bullet</button>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="sf-add big" onClick={() => {
        onChange((d) => { d.experiences.push({ lineageId: newId(), company: '', title: '', from: '', to: '', current: false, achievements: [] }); });
        setOpen(roles.length);
      }}>+ Add experience</button>
      {popover}
    </>
  );
}

export function EducationForm({ resume, onChange }: { resume: RenderedResume; onChange: Change }) {
  const [open, setOpen] = useState<number | null>(resume.educations.length === 1 ? 0 : null);
  const rows = resume.educations;
  return (
    <>
      {rows.map((row, i) => {
        const set = (key: 'institution' | 'degree' | 'field' | 'from' | 'to') => (value: string) =>
          onChange((d) => { d.educations[i]![key] = value; });
        return (
          <div className={`sf-item${open === i ? ' open' : ''}`} key={row.lineageId ?? i}>
            <div className="sf-item-head">
              <button type="button" className="sf-item-title" onClick={() => setOpen(open === i ? null : i)}>
                <b>{row.institution || 'New education'}</b>
                <span>{[[row.degree, row.field].filter(Boolean).join(', '), [row.from, row.to].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</span>
              </button>
              <RowTools index={i} count={rows.length} removeLabel="Remove education"
                onMove={(step) => { onChange((d) => move(d.educations, i, step)); setOpen(null); }}
                onRemove={() => {
                  if (!confirm(`Remove ${row.institution || 'this education'}?`)) return;
                  onChange((d) => { d.educations.splice(i, 1); });
                  setOpen(null);
                }} />
            </div>
            {open === i && (
              <div className="sf-item-body sf-grid">
                <Field label="School" value={row.institution} onChange={set('institution')} wide />
                <Field label="Degree (optional)" value={row.degree} onChange={set('degree')} placeholder="Leave blank if not applicable" />
                <Field label="Field of study" value={row.field ?? ''} onChange={set('field')} />
                <Field label="Start" value={row.from} onChange={set('from')} placeholder="2012" />
                <Field label="End" value={row.to ?? ''} onChange={set('to')} placeholder="2016" />
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="sf-add big" onClick={() => {
        onChange((d) => { d.educations.push({ lineageId: newId(), institution: '', degree: '', field: '', from: '', to: '' }); });
        setOpen(rows.length);
      }}>+ Add education</button>
    </>
  );
}

type Skill = RenderedResume['skills'][number];
const groupOf = (skill: Skill) => (skill.category ?? '').trim();

/** The categories in the order they appear on the CV ('' is skills without a category). */
function groupsOf(skills: Skill[]): string[] {
  const groups: string[] = [];
  for (const skill of skills) if (!groups.includes(groupOf(skill))) groups.push(groupOf(skill));
  return groups;
}

/** "a, b; c" → ["a", "b", "c"], trimmed, without blanks. */
const namesIn = (text: string) => text.split(/[,;\n]/).map((name) => name.trim()).filter(Boolean);

/**
 * Skills in named categories ("Languages: JavaScript, Node.js"), as Huntr does
 * and as Simplify's users ask for: each category is a card with its name, its
 * skills as chips and its own "add" box. Chips drag between categories; cards
 * move up and down. On the CV each category is one line, "Category: a, b, c";
 * skills without a category print on a line without a label.
 */
export function SkillsForm({ resume, onChange }: { resume: RenderedResume; onChange: Change }) {
  const [pending, setPending] = useState<string[]>([]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  /** Names being typed: a rename applies when the box is left, so a half-typed name never merges categories. */
  const [naming, setNaming] = useState<Record<string, string>>({});
  const existing = groupsOf(resume.skills);
  const groups = [...existing, ...pending.filter((name) => !existing.includes(name))];

  /** Puts skills in a category, after its last skill; a skill already elsewhere moves here. */
  const add = (category: string, names: string[]) => {
    if (!names.length) return;
    onChange((d) => {
      for (const name of names) {
        const at = d.skills.findIndex((skill) => skill.name.trim().toLowerCase() === name.toLowerCase());
        const skill: Skill = at >= 0 ? d.skills.splice(at, 1)[0]! : { lineageId: newId(), name, category: '' };
        skill.category = category;
        const last = d.skills.map(groupOf).lastIndexOf(category);
        d.skills.splice(last >= 0 ? last + 1 : d.skills.length, 0, skill);
      }
    });
    setPending((list) => list.filter((name) => name !== category));
    setTyped((all) => ({ ...all, [category]: '' }));
  };

  const rename = (from: string, typedName: string) => {
    const to = typedName.trim();
    setNaming((all) => { const { [from]: _done, ...rest } = all; return rest; });
    if (to === from) return;
    if (to && existing.includes(to) && existing.includes(from)
      && !confirm(`There is already a category "${to}". Put these skills in it?`)) return;
    if (existing.includes(from)) onChange((d) => { for (const skill of d.skills) if (groupOf(skill) === from) skill.category = to; });
    setPending((list) => list.map((name) => (name === from ? to : name)));
    setTyped((all) => { const { [from]: text, ...rest } = all; return { ...rest, [to]: text ?? '' }; });
  };

  /** Moves a whole category up or down: its skills move as one block. */
  const moveGroup = (category: string, step: -1 | 1) => onChange((d) => {
    const order = groupsOf(d.skills);
    const from = order.indexOf(category);
    if (from < 0 || from + step < 0 || from + step >= order.length) return;
    order.splice(from, 1);
    order.splice(from + step, 0, category);
    d.skills = order.flatMap((group) => d.skills.filter((skill) => groupOf(skill) === group));
  });

  const removeGroup = (category: string, count: number) => {
    if (count && !confirm(`Delete the category "${category || 'Other skills'}" and its ${count} skill${count === 1 ? '' : 's'}?`)) return;
    if (count) onChange((d) => { d.skills = d.skills.filter((skill) => groupOf(skill) !== category); });
    setPending((list) => list.filter((name) => name !== category));
  };

  /** A dragged chip lands before `before` (a skill's lineage), or at the end of the category. */
  const drop = (category: string, before?: string) => {
    const moving = dragging;
    setDragging(null);
    if (!moving || moving === before) return;
    onChange((d) => {
      const at = d.skills.findIndex((skill) => skill.lineageId === moving);
      if (at < 0) return;
      const [skill] = d.skills.splice(at, 1);
      skill!.category = category;
      const target = before ? d.skills.findIndex((s) => s.lineageId === before) : -1;
      const last = d.skills.map(groupOf).lastIndexOf(category);
      d.skills.splice(target >= 0 ? target : last >= 0 ? last + 1 : d.skills.length, 0, skill!);
    });
    setPending((list) => list.filter((name) => name !== category));
  };

  return (
    <>
      {groups.map((category, index) => {
        const skills = resume.skills.filter((skill) => groupOf(skill) === category);
        const isPending = !existing.includes(category);
        return (
          <div key={`${index}:${category}`} className={`sk-group${dragging ? ' droppable' : ''}`}
            onDragOver={(e) => { if (dragging) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); drop(category); }}>
            <div className="sk-head">
              <input className="sk-name" value={naming[category] ?? category} autoFocus={isPending && !category}
                placeholder={category || isPending ? 'Category, e.g. Languages' : 'Other skills (no label on the CV)'}
                aria-label="Category name"
                onChange={(e) => setNaming((all) => ({ ...all, [category]: e.target.value }))}
                onBlur={() => { if (category in naming) rename(category, naming[category]!); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') { setNaming((all) => { const { [category]: _x, ...rest } = all; return rest; }); }
                }} />
              <span className="sf-tools">
                <button type="button" title="Move category up" disabled={index === 0 || isPending} onClick={() => moveGroup(category, -1)}><DashboardIcon name="arrowUp" size={14} /></button>
                <button type="button" title="Move category down" disabled={index >= existing.length - 1 || isPending} onClick={() => moveGroup(category, 1)}><DashboardIcon name="arrowDown" size={14} /></button>
                <button type="button" className="danger" title="Delete category" onClick={() => removeGroup(category, skills.length)}><DashboardIcon name="close" size={14} /></button>
              </span>
            </div>
            <div className="sf-chips">
              {skills.map((skill) => (
                <span key={skill.lineageId} className={`sf-chip${dragging === skill.lineageId ? ' dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragging(skill.lineageId ?? null); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => { if (dragging) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(category, skill.lineageId); }}
                  title="Drag to another category or place">
                  {skill.name || '—'}
                  <button type="button" title={`Remove ${skill.name}`}
                    onClick={() => onChange((d) => { d.skills = d.skills.filter((s) => s.lineageId !== skill.lineageId); })}><DashboardIcon name="close" size={14} /></button>
                </span>
              ))}
            </div>
            <input className="sk-add" value={typed[category] ?? ''}
              placeholder="Add a skill, or several with commas"
              onChange={(e) => {
                const text = e.target.value;
                // A comma ends a skill, as in tag inputs; pasting "a, b, c" adds them all.
                if (/[,;\n]/.test(text)) {
                  const parts = text.split(/[,;\n]/);
                  const rest = parts.pop() ?? '';
                  add(category, namesIn(parts.join(',')));
                  setTyped((all) => ({ ...all, [category]: rest.trimStart() }));
                } else setTyped((all) => ({ ...all, [category]: text }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); add(category, namesIn(typed[category] ?? '')); }
                if (e.key === 'Backspace' && !(typed[category] ?? '') && skills.length) {
                  const last = skills[skills.length - 1]!;
                  onChange((d) => { d.skills = d.skills.filter((s) => s.lineageId !== last.lineageId); });
                }
              }}
              onBlur={() => add(category, namesIn(typed[category] ?? ''))} />
          </div>
        );
      })}
      <button type="button" className="sf-add big" onClick={() => setPending((list) => (list.includes('') ? list : [...list, '']))}>
        + Add category
      </button>
      {resume.skills.length === 0 && groups.length === 0 && <p className="sf-count">No skills yet. Add a category, such as Languages.</p>}
    </>
  );
}

/** Bullets kept as plain lines: add, edit, move and remove. */
function BulletList({ bullets, onChange, placeholder }: {
  bullets: string[];
  onChange(next: string[]): void;
  placeholder: string;
}) {
  const set = (mutate: (list: string[]) => void) => {
    const next = [...bullets];
    mutate(next);
    onChange(next);
  };
  return (
    <>
      <p className="sf-label">Bullets</p>
      {bullets.map((bullet, j) => (
        <div className="sf-bullet" key={j}>
          <textarea rows={2} value={bullet} placeholder={placeholder}
            onChange={(e) => set((list) => { list[j] = e.target.value; })} />
          <span className="sf-tools vertical">
            <button type="button" title="Move up" disabled={j === 0} onClick={() => set((list) => move(list, j, -1))}><DashboardIcon name="arrowUp" size={14} /></button>
            <button type="button" title="Move down" disabled={j === bullets.length - 1} onClick={() => set((list) => move(list, j, 1))}><DashboardIcon name="arrowDown" size={14} /></button>
            <button type="button" className="danger" title="Remove bullet" onClick={() => set((list) => { list.splice(j, 1); })}><DashboardIcon name="close" size={14} /></button>
          </span>
        </div>
      ))}
      <button type="button" className="sf-add" onClick={() => set((list) => { list.push(''); })}>+ Add bullet</button>
    </>
  );
}

export function ProjectsForm({ resume, onChange }: { resume: RenderedResume; onChange: Change }) {
  const projects = resume.projects ?? [];
  const [open, setOpen] = useState<number | null>(projects.length === 1 ? 0 : null);
  const edit = (mutate: (list: NonNullable<RenderedResume['projects']>) => void) =>
    onChange((d) => { d.projects ??= []; mutate(d.projects); });
  return (
    <>
      <p className="sf-count" style={{ margin: '0 0 12px' }}>Open source, side projects, volunteering and other work outside your jobs.</p>
      {projects.map((project, i) => {
        const set = (key: 'name' | 'role' | 'link' | 'from' | 'to') => (value: string) =>
          edit((list) => { list[i]![key] = value; });
        return (
          <div className={`sf-item${open === i ? ' open' : ''}`} key={project.lineageId ?? i}>
            <div className="sf-item-head">
              <button type="button" className="sf-item-title" onClick={() => setOpen(open === i ? null : i)}>
                <b>{project.name || 'New project'}</b>
                <span>{[project.role, [project.from, project.current ? 'Present' : project.to].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</span>
              </button>
              <RowTools index={i} count={projects.length} removeLabel="Remove project"
                onMove={(step) => { edit((list) => move(list, i, step)); setOpen(null); }}
                onRemove={() => {
                  if (!confirm(`Remove ${project.name || 'this project'}?`)) return;
                  edit((list) => { list.splice(i, 1); });
                  setOpen(null);
                }} />
            </div>
            {open === i && (
              <div className="sf-item-body">
                <div className="sf-grid">
                  <Field label="Name" value={project.name} onChange={set('name')} wide />
                  <Field label="Your role" value={project.role ?? ''} onChange={set('role')} placeholder="Maintainer" />
                  <Field label="Link" value={project.link ?? ''} onChange={set('link')} placeholder="github.com/…" />
                  <Field label="Start" value={project.from ?? ''} onChange={set('from')} placeholder="2023-11" />
                  {project.current
                    ? <label className="sf-field"><span>End</span><input value="Present" disabled /></label>
                    : <Field label="End" value={project.to ?? ''} onChange={set('to')} placeholder="2025-04" />}
                  <label className="sf-check wide">
                    <input type="checkbox" checked={Boolean(project.current)}
                      onChange={(e) => edit((list) => {
                        list[i]!.current = e.target.checked;
                        if (e.target.checked) list[i]!.to = '';
                      })} />
                    Still going
                  </label>
                </div>
                <BulletList bullets={project.bullets} placeholder="What you built, and what it did."
                  onChange={(next) => edit((list) => { list[i]!.bullets = next; })} />
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="sf-add big" onClick={() => {
        edit((list) => { list.push({ lineageId: newId(), name: '', role: '', link: '', from: '', to: '', current: false, bullets: [] }); });
        setOpen(projects.length);
      }}>+ Add project</button>
    </>
  );
}

export function CertificationsForm({ resume, onChange }: { resume: RenderedResume; onChange: Change }) {
  const items = resume.certifications ?? [];
  const [open, setOpen] = useState<number | null>(items.length === 1 ? 0 : null);
  const edit = (mutate: (list: NonNullable<RenderedResume['certifications']>) => void) =>
    onChange((d) => { d.certifications ??= []; mutate(d.certifications); });
  return (
    <>
      {items.map((item, i) => {
        const set = (key: 'name' | 'issuer' | 'date' | 'link') => (value: string) =>
          edit((list) => { list[i]![key] = value; });
        return (
          <div className={`sf-item${open === i ? ' open' : ''}`} key={item.lineageId ?? i}>
            <div className="sf-item-head">
              <button type="button" className="sf-item-title" onClick={() => setOpen(open === i ? null : i)}>
                <b>{item.name || 'New certification'}</b>
                <span>{[item.issuer, item.date].filter(Boolean).join(' · ')}</span>
              </button>
              <RowTools index={i} count={items.length} removeLabel="Remove certification"
                onMove={(step) => { edit((list) => move(list, i, step)); setOpen(null); }}
                onRemove={() => {
                  if (!confirm(`Remove ${item.name || 'this certification'}?`)) return;
                  edit((list) => { list.splice(i, 1); });
                  setOpen(null);
                }} />
            </div>
            {open === i && (
              <div className="sf-item-body sf-grid">
                <Field label="Name" value={item.name} onChange={set('name')} placeholder="AWS Solutions Architect" wide />
                <Field label="Issuer" value={item.issuer ?? ''} onChange={set('issuer')} placeholder="Amazon Web Services" />
                <Field label="Date" value={item.date ?? ''} onChange={set('date')} placeholder="2024-03" />
                <Field label="Link" value={item.link ?? ''} onChange={set('link')} placeholder="Credential URL" wide />
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="sf-add big" onClick={() => {
        edit((list) => { list.push({ lineageId: newId(), name: '', issuer: '', date: '', link: '' }); });
        setOpen(items.length);
      }}>+ Add certification</button>
    </>
  );
}

/** One custom section: its title, a paragraph and bullets. */
export function CustomSectionForm({ resume, lineageId, onChange, onRemoved }: {
  resume: RenderedResume;
  lineageId: string;
  onChange: Change;
  onRemoved(): void;
}) {
  const item = (resume.customSections ?? []).find((entry) => entry.lineageId === lineageId);
  if (!item) return <p className="sf-count">This section was removed.</p>;
  const edit = (mutate: (section: NonNullable<RenderedResume['customSections']>[number]) => void) =>
    onChange((d) => {
      const found = d.customSections?.find((entry) => entry.lineageId === lineageId);
      if (found) mutate(found);
    });
  return (
    <>
      <div className="sf-grid">
        <Field label="Section title" value={item.title} placeholder="Languages, Awards, Publications…" wide
          onChange={(value) => edit((section) => { section.title = value; })} />
        <Field label="Text" value={item.text ?? ''} multiline placeholder="A paragraph, or leave empty and use bullets."
          onChange={(value) => edit((section) => { section.text = value; })} />
      </div>
      <BulletList bullets={item.bullets} placeholder="One point."
        onChange={(next) => edit((section) => { section.bullets = next; })} />
      <button type="button" className="sf-remove-section" onClick={() => {
        if (!confirm(`Remove the section "${item.title || 'Untitled'}"?`)) return;
        onChange((d) => { d.customSections = (d.customSections ?? []).filter((entry) => entry.lineageId !== lineageId); });
        onRemoved();
      }}>Remove this section</button>
    </>
  );
}
