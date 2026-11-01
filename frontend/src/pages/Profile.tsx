import { useEffect, useState } from 'react';
import { api, type ContactFields } from '../api';
import { SECTIONS, type ContactKey } from '../fields';
import { onExtensionDetected, pushProfile } from '../extensionBridge';

const DERIVED: ContactKey[] = ['currentCompany', 'currentTitle', 'yearsExperience'];

/**
 * Contact details — what the extension types into application forms.
 *
 * Career facts are not here: they live in a resume, where they are versioned
 * and carry their evidence.
 */
export function Profile() {
  const [profile, setProfile] = useState<ContactFields | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extension, setExtension] = useState(false);

  useEffect(() => {
    api.profile().then(setProfile).catch((err: Error) => setStatus(err.message));
  }, []);

  useEffect(() => onExtensionDetected(setExtension), []);

  useEffect(() => {
    if (extension && profile) void pushProfile(profile);
  }, [extension, profile]);

  async function save() {
    if (!profile) return;

    setSaving(true);
    setStatus(null);

    try {
      const saved = await api.saveProfile(profile);
      setProfile(saved);

      const pushed = await pushProfile(saved);
      setStatus(pushed ? 'Saved and synced to the extension.' : 'Saved.');
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <><h1>Profile</h1><section className="card"><p className="muted">Loading…</p></section></>;
  }

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
          What application forms ask for. Saving pushes these to the extension
          automatically.
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
                    value={profile[field.key] ?? ''}
                    placeholder={field.placeholder}
                    onChange={(e) => setProfile({ ...profile, [field.key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <p className="group">Current role <span className="muted">from your resume</span></p>
        <div className="fieldgrid">
          {DERIVED.map((key) => (
            <label className="field half" key={key}>
              <span>{key === 'yearsExperience' ? 'Years of experience'
                : key === 'currentCompany' ? 'Company' : 'Title'}</span>
              <input type="text" value={profile[key] ?? ''} disabled />
            </label>
          ))}
        </div>
        <p className="muted tiny">
          Computed from the live experience in your primary resume — tick
          “I work here now” on a role to change it.
        </p>

        <button className="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {status && <p className="status">{status}</p>}
      </section>
    </>
  );
}
