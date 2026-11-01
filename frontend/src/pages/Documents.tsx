import { Link } from 'react-router-dom';

/**
 * Generated output. Importing a CV lives on the Resumes page now — it creates a
 * resume, so that is where it belongs.
 */
export function Documents() {
  return (
    <>
      <h1>Documents</h1>

      <section className="card">
        <h2>Generated resumes</h2>
        <p className="muted small">
          A sent resume is frozen here with the version it came from, so any
          application can be reproduced exactly — even after the resume changes.
        </p>
        <p className="empty">Nothing sent yet.</p>
      </section>

      <section className="card">
        <h2>Start from a CV</h2>
        <p className="muted small">
          Reads a PDF or DOCX and fills a new resume. You read it before anything
          is saved.
        </p>
        <Link className="ghost" to="/resumes" style={{ textDecoration: 'none' }}>
          Go to Resumes
        </Link>
      </section>
    </>
  );
}
