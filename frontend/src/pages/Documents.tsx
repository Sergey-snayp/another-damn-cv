import { useNavigate } from 'react-router-dom';
import { api, type CandidateProfile } from '../api';
import { ImportCv } from './ImportCv';

/**
 * Where documents come in and go out.
 *
 * Importing writes straight to the profile here rather than filling a form,
 * because there is no form on this page — so the review panel is the only
 * confirmation, and the page says so before you press it.
 */
export function Documents() {
  const navigate = useNavigate();

  async function applyImport(values: Partial<CandidateProfile>) {
    await api.saveProfile(values);
    navigate('/profile');
  }

  return (
    <>
      <h1>Documents</h1>

      <ImportCv onApply={(values) => void applyImport(values)} />

      <section className="card">
        <h2>Generated resumes</h2>
        <p className="muted small">
          Tailored PDFs appear here once the tailorer is ported, each one tied to
          the posting it was written for and the fact-base commit it came from.
        </p>
        <p className="empty">Nothing generated yet.</p>
      </section>
    </>
  );
}
