import { useEffect, useState } from 'react';
import { api, type FactBaseStats } from './api';

/**
 * A shell, deliberately.
 *
 * It proves the frontend reaches the backend and reads the real fact base.
 * The screens from the brief — fact review, coverage per posting, scanner
 * confirmation, application log — go in from here.
 */
export function App() {
  const [stats, setStats] = useState<FactBaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main>
      <h1>CV Platform</h1>

      {error && (
        <p className="error">
          Cannot reach the API: {error}
          <br />
          <small>Start it with <code>npm run dev:backend</code> from the repo root.</small>
        </p>
      )}

      {stats && (
        <section className="grid">
          <Stat label="Skills" value={stats.skills} sub={`${stats.skillsVerified} verified`} />
          <Stat label="Projects" value={stats.projects} />
          <Stat
            label="Achievements"
            value={stats.achievements}
            sub={`${stats.achievementsVerified} verified`}
          />
        </section>
      )}

      {!stats && !error && <p className="muted">Loading…</p>}

      <ul className="todo">
        <li>Fact review — confirm or reject what the scanner proposes</li>
        <li>Coverage — paste a posting, see evidenced vs missing</li>
        <li>Applications — the log, with what was and was not claimed</li>
      </ul>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
