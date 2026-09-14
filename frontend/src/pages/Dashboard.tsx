import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type FactBaseStats } from '../api';

export function Dashboard() {
  const [stats, setStats] = useState<FactBaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <h1>Dashboard</h1>

      {error && <p className="error">{error}</p>}

      <section className="grid">
        <Stat label="Skills" value={stats?.skills} sub={stats && `${stats.skillsVerified} verified`} />
        <Stat label="Projects" value={stats?.projects} />
        <Stat
          label="Achievements"
          value={stats?.achievements}
          sub={stats && `${stats.achievementsVerified} verified`}
        />
      </section>

      <section className="card">
        <h2>What to do next</h2>
        <ul className="next">
          <li><Link to="/documents">Import a CV</Link> — fills your profile in one go</li>
          <li><Link to="/jobs">Check a posting</Link> — see what you can and cannot support</li>
          <li><Link to="/tracker">Log an application</Link> — with what you did not claim</li>
        </ul>
      </section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value?: number; sub?: string | null }) {
  return (
    <div className="stat">
      <div className="value">{value ?? '—'}</div>
      <div className="label">{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
