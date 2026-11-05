import { useState, type ReactNode } from 'react';
import type { Contact, RenderedResume } from '../../resumeApi';
import { RewritePopover } from '../RewritePopover';

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
      <button type="button" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
      <button type="button" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
      <button type="button" className="danger" title={removeLabel} onClick={onRemove}>×</button>
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
      <Field label="Email" value={contact.email} onChange={set('email')} placeholder="email@example.com" />
      <Field label="Phone" value={contact.phone ?? ''} onChange={set('phone')} />
      <Field label="Location" value={contact.location ?? ''} onChange={set('location')} placeholder="City, Country" wide />
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
                        })}>✦</button>
                      <button type="button" title="Move up" disabled={j === 0}
                        onClick={() => onChange((d) => move(d.experiences[i]!.achievements, j, -1))}>↑</button>
                      <button type="button" title="Move down" disabled={j === role.achievements.length - 1}
                        onClick={() => onChange((d) => move(d.experiences[i]!.achievements, j, 1))}>↓</button>
                      <button type="button" className="danger" title="Remove bullet"
                        onClick={() => onChange((d) => { d.experiences[i]!.achievements.splice(j, 1); })}>×</button>
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
                <Field label="Degree" value={row.degree} onChange={set('degree')} placeholder="B.Sc." />
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

export function SkillsForm({ resume, onChange }: { resume: RenderedResume; onChange: Change }) {
  const [typed, setTyped] = useState('');
  const add = () => {
    const names = typed.split(',').map((name) => name.trim()).filter(Boolean);
    if (!names.length) return;
    onChange((d) => {
      const have = new Set(d.skills.map((skill) => skill.name.toLowerCase()));
      for (const name of names) {
        if (have.has(name.toLowerCase())) continue;
        have.add(name.toLowerCase());
        d.skills.push({ lineageId: newId(), name, category: '' });
      }
    });
    setTyped('');
  };
  return (
    <>
      <div className="sf-skill-add">
        <input value={typed} placeholder="Add a skill, or several separated by commas"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="ghost" disabled={!typed.trim()} onClick={add}>Add</button>
      </div>
      <div className="sf-chips">
        {resume.skills.map((skill, i) => (
          <span className="sf-chip" key={skill.lineageId ?? i}>
            {skill.name || '—'}
            <button type="button" title={`Remove ${skill.name}`}
              onClick={() => onChange((d) => { d.skills.splice(i, 1); })}>×</button>
          </span>
        ))}
        {resume.skills.length === 0 && <p className="sf-count">No skills yet.</p>}
      </div>
    </>
  );
}
