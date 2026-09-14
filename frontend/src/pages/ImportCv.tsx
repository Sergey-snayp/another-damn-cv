import { useRef, useState } from 'react';
import { api, type CandidateProfile, type ImportProposal } from '../api';

const LABELS: Record<string, string> = {
  fullName: 'Name', email: 'Email', phone: 'Phone', location: 'Location',
  city: 'City', state: 'State', country: 'Country', postalCode: 'Postal code',
  linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio', website: 'Website',
  currentCompany: 'Current company', currentTitle: 'Current title',
  yearsExperience: 'Years of experience', preferredName: 'Preferred name',
  firstName: 'First name', lastName: 'Last name',
};

/**
 * Reads a CV and proposes values. Nothing is written until the person accepts,
 * and then only into the form — they still have to press Save.
 *
 * Two confirmations on purpose: a parser that writes straight into your history
 * is how a CV quietly acquires things you never did.
 */
export function ImportCv({ onApply }: { onApply(values: Partial<CandidateProfile>): void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ImportProposal | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setProposal(null);
    setFileName(file.name);

    try {
      setProposal(await api.importCv(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!proposal) return;
    onApply(proposal.proposed);
    setProposal(null);
  }

  const scalars = proposal
    ? Object.entries(proposal.proposed)
        .filter(([key, value]) => typeof value === 'string' && value && LABELS[key])
    : [];

  return (
    <section className="card">
      <h2>Import from a CV</h2>
      <p className="muted small">
        Reads a PDF or DOCX and fills the form below. You review everything
        before it is saved.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      <button className="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? `Reading ${fileName}…` : 'Choose a CV'}
      </button>

      {error && <p className="error small">{error}</p>}

      {proposal && (
        <div className="proposal">
          <p className="group">Found in {fileName}</p>

          <ul className="fields">
            {scalars.map(([key, value]) => (
              <li key={key}>
                <span className="key">{LABELS[key]}</span>
                <span className="val">{String(value)}</span>
              </li>
            ))}
          </ul>

          {proposal.proposed.experience?.length ? (
            <>
              <p className="group">Experience — {proposal.proposed.experience.length} roles</p>
              <ul className="fields">
                {proposal.proposed.experience.map((row) => (
                  <li key={row.id}>
                    <span className="key">{row.title}</span>
                    <span className="val">{row.company} · {row.from}–{row.to || 'now'}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {proposal.proposed.education?.length ? (
            <>
              <p className="group">Education — {proposal.proposed.education.length}</p>
              <ul className="fields">
                {proposal.proposed.education.map((row) => (
                  <li key={row.id}>
                    <span className="key">{row.degree} {row.field}</span>
                    <span className="val">{row.institution} · {row.from}–{row.to}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {proposal.notFound.length > 0 && (
            <p className="muted tiny">
              Not stated in the CV, so left blank: {proposal.notFound.join(', ')}.
            </p>
          )}

          <div className="row">
            <button className="primary" onClick={apply}>Fill the form with this</button>
            <button className="ghost" onClick={() => setProposal(null)}>Discard</button>
          </div>
          <p className="muted tiny">
            This only fills the form. Nothing is saved until you press Save profile.
          </p>
        </div>
      )}
    </section>
  );
}
