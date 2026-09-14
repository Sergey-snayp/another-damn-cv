import { useEffect, useState } from 'react';
import { api, type ApplicationRecord } from '../api';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', APPLIED: 'Applied', SCREENING: 'Screening',
  INTERVIEWING: 'Interviewing', REJECTED: 'Rejected', OFFER: 'Offer',
};

export function Tracker() {
  const [rows, setRows] = useState<ApplicationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.applications().then(setRows).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <h1>Tracker</h1>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Applications <span className="muted">{rows?.length ?? 0}</span></h2>

        {rows && rows.length === 0 && (
          <p className="empty">
            Nothing logged yet. Each entry records the fact-base commit it was
            generated from, so any resume you sent can be reproduced exactly —
            and what you deliberately did not claim, which is your interview prep.
          </p>
        )}

        {rows && rows.length > 0 && (
          <ul className="applications">
            {rows.map((row) => (
              <li key={row.id}>
                <div>
                  <div className="role">{row.role}</div>
                  <div className="muted tiny">{row.company} · {row.appliedAt.slice(0, 10)}</div>
                </div>
                <span className={`badge ${row.status.toLowerCase()}`}>
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
