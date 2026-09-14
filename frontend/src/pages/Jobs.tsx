import { useState } from 'react';

/**
 * Paste a posting, see what your fact base can support.
 *
 * The useful half is the missing list, not a score — a number tells you nothing
 * you can act on.
 */
export function Jobs() {
  const [description, setDescription] = useState('');

  return (
    <>
      <h1>Jobs</h1>

      <section className="card">
        <h2>Check a posting</h2>
        <p className="muted small">
          Paste a job description. You will get what is evidenced, what is only
          self-reported, and what cannot be supported at all.
        </p>

        <label className="field">
          <span>Job description</span>
          <textarea
            rows={8}
            value={description}
            placeholder="Paste the posting here…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <button className="primary" disabled>
          Analyse
        </button>
        <p className="muted tiny">
          Disabled until the tailorer is ported from cv-tailor.mjs. Until then it
          would report everything as missing, which is useless but honest.
        </p>
      </section>
    </>
  );
}
