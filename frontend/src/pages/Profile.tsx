import { useEffect, useState } from 'react';
import { api, type CandidateProfile, type ExperienceEntry, type EducationEntry } from '../api';
import { SECTIONS, type ContactKey } from '../fields';
import { onExtensionDetected, pushProfile } from '../extensionBridge';

const newId = () => crypto.randomUUID();

const blankExperience = (): ExperienceEntry => ({
  id: newId(), company: '', title: '', from: '', to: '', current: false, description: '',
});

const blankEducation = (): EducationEntry => ({
  id: newId(), institution: '', degree: '', field: '', from: '', to: '',
});

export function Profile() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extension, setExtension] = useState(false);

  useEffect(() => {
    api.profile().then(setProfile).catch((err: Error) => setStatus(err.message));
  }, []);

  useEffect(() => onExtensionDetected(setExtension), []);

  function setField(key: ContactKey, value: string) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  }

  function setRow<K extends 'experience' | 'education'>(
    section: K, id: string, patch: Partial<CandidateProfile[K][number]>,
  ) {
    setProfile((p) => {
      if (!p) return p;
      const rows = p[section].map((row) => (row.id === id ? { ...row, ...patch } : row));
      return { ...p, [section]: rows };
    });
  }

  function addRow(section: 'experience' | 'education') {
    setProfile((p) => {
      if (!p) return p;
      const row = section === 'experience' ? blankExperience() : blankEducation();
      return { ...p, [section]: [...p[section], row] } as CandidateProfile;
    });
  }

  function removeRow(section: 'experience' | 'education', id: string) {
    setProfile((p) => (p ? { ...p, [section]: p[section].filter((r) => r.id !== id) } : p));
  }

  /**
   * Merges an import into the form. Existing values win over blanks, so a CV
   * that omits your phone number does not wipe the one you typed.
   */
  function applyImport(values: Partial<CandidateProfile>) {
    setProfile((current) => {
      if (!current) return current;

      const merged = { ...current };

      for (const [key, value] of Object.entries(values)) {
        if (key === 'experience' || key === 'education') continue;
        if (typeof value === 'string' && value) {
          (merged as Record<string, unknown>)[key] = value;
        }
      }

      if (values.experience?.length) merged.experience = values.experience;
      if (values.education?.length) merged.education = values.education;

      return merged;
    });

    setStatus('Form filled from your CV. Check it, then press Save.');
  }

  async function save() {
    if (!profile) return;

    setSaving(true);
    setStatus(null);

    try {
      const saved = await api.saveProfile(profile);
      setProfile(saved);

      // Only the flat fields reach the extension; history is not autofilled.
      const pushed = await pushProfile(saved);
      setStatus(pushed ? 'Saved and synced to the extension.' : 'Saved.');
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <section className="card"><p className="muted">Loading profile…</p></section>;
  }

  // Mirrors what the server computes, so the form shows it before saving.
  const currentRole = profile.experience.find((row) => row.current)
    ?? [...profile.experience].sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))[0];

  const earliest = profile.experience
    .map((row) => row.from)
    .filter(Boolean)
    .sort()[0];

  const derived = currentRole?.company
    ? {
        company: currentRole.company,
        title: currentRole.title,
        years: earliest ? String(new Date().getFullYear() - Number(earliest.slice(0, 4))) : '',
      }
    : null;

  return (
    <>
      <h1>Profile</h1>

      <section className="card">
        <h2>
          Your details
          <span className={extension ? 'pill on' : 'pill'}>
            {extension ? 'extension connected' : 'extension not detected'}
          </span>
        </h2>
        <p className="muted small">
          What application forms ask for. Saving pushes the contact fields to the
          extension automatically.
        </p>

        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="group">{section.title}</p>
            {section.hint && <p className="muted tiny">{section.hint}</p>}
            <div className="fieldgrid">
              {section.fields.map((field) => (
                <label className={field.half ? 'field half' : 'field'} key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="text"
                    value={profile[field.key]}
                    placeholder={field.placeholder}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>
          Experience <span className="muted">{profile.experience.length}</span>
        </h2>
        {derived && (
          <p className="derived">
            Forms asking for your current role will get
            {' '}<b>{derived.title}</b> at <b>{derived.company}</b>
            {derived.years && <> · <b>{derived.years} years</b> total</>}.
          </p>
        )}
        <p className="muted small">
          Your employment history. Not autofilled — forms vary too much — but it
          is what a generated CV draws on.
        </p>

        {profile.experience.map((row) => (
          <div className="entry" key={row.id}>
            <div className="fieldgrid">
              <label className="field half"><span>Company</span>
                <input value={row.company}
                  onChange={(e) => setRow('experience', row.id, { company: e.target.value })} />
              </label>
              <label className="field half"><span>Title</span>
                <input value={row.title}
                  onChange={(e) => setRow('experience', row.id, { title: e.target.value })} />
              </label>
              <label className="field half"><span>From</span>
                <input value={row.from} placeholder="2023-11"
                  onChange={(e) => setRow('experience', row.id, { from: e.target.value })} />
              </label>
              <label className="field half"><span>To</span>
                <input value={row.to} placeholder={row.current ? 'Present' : '2025-04'}
                  disabled={row.current}
                  onChange={(e) => setRow('experience', row.id, { to: e.target.value })} />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={row.current}
                onChange={(e) => setRow('experience', row.id, { current: e.target.checked })} />
              <span>I work here now</span>
            </label>
            <label className="field"><span>What you did</span>
              <textarea rows={2} value={row.description ?? ''}
                onChange={(e) => setRow('experience', row.id, { description: e.target.value })} />
            </label>
            <button className="remove" onClick={() => removeRow('experience', row.id)}>Remove</button>
          </div>
        ))}

        <button className="ghost" onClick={() => addRow('experience')}>Add a role</button>
      </section>

      <section className="card">
        <h2>Education <span className="muted">{profile.education.length}</span></h2>

        {profile.education.map((row) => (
          <div className="entry" key={row.id}>
            <div className="fieldgrid">
              <label className="field"><span>Institution</span>
                <input value={row.institution}
                  onChange={(e) => setRow('education', row.id, { institution: e.target.value })} />
              </label>
              <label className="field half"><span>Degree</span>
                <input value={row.degree} placeholder="B.Sc."
                  onChange={(e) => setRow('education', row.id, { degree: e.target.value })} />
              </label>
              <label className="field half"><span>Field</span>
                <input value={row.field}
                  onChange={(e) => setRow('education', row.id, { field: e.target.value })} />
              </label>
              <label className="field half"><span>From</span>
                <input value={row.from} placeholder="2012"
                  onChange={(e) => setRow('education', row.id, { from: e.target.value })} />
              </label>
              <label className="field half"><span>To</span>
                <input value={row.to} placeholder="2016"
                  onChange={(e) => setRow('education', row.id, { to: e.target.value })} />
              </label>
            </div>
            <button className="remove" onClick={() => removeRow('education', row.id)}>Remove</button>
          </div>
        ))}

        <button className="ghost" onClick={() => addRow('education')}>Add education</button>
      </section>

      <div className="savebar">
        <button className="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {status && <span className="status">{status}</span>}
      </div>
    </>
  );
}
