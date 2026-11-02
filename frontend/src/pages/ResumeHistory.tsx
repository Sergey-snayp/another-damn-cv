import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { resumeApi, type RenderedResume, type Snapshot, type SnapshotDiff } from '../resumeApi';
import { DiffPanel } from '../resume/DiffPanel';
import { ResumeDocument } from '../resume/ResumeDocument';
import { DEFAULT_THEME, type ResumeTheme } from '../resume/theme';
import '../resume/document.css';

const when = (iso: string) => new Date(iso).toLocaleString('en-CA', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function ResumeHistory() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const table = params.get('table');
  const lineageId = params.get('lineageId');

  return table && lineageId
    ? <EntryHistory id={id} table={table} lineageId={lineageId} />
    : <SnapshotHistory id={id} navigate={navigate} requested={Number(params.get('snapshot')) || undefined} />;
}

/** Every version of one entry — "this bullet has been reworded four times". */
function EntryHistory({ id, table, lineageId }: { id: string; table: string; lineageId: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resumeApi.history(id, table, lineageId)
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, [id, table, lineageId]);

  return (
    <>
      <div className="bar">
        <h1>History of one entry</h1>
        <Link className="ghost" to={`/documents/${id}/history`}>All versions</Link>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>
          {table === 'achievement' ? 'Bullet' : table}
          <span className="muted">{rows?.length ?? 0} versions</span>
        </h2>

        {rows?.length === 0 && <p className="empty">No history yet — this has only one version.</p>}

        <ul className="entryversions">
          {rows?.map((row) => (
            <li key={String(row.id)}>
              <span className="vnum">
                v{String(row.createdInSnapshot)}
                {row.supersededInSnapshot == null && ' · current'}
              </span>
              <div className="vtext">
                {String(row.bullet ?? row.company ?? row.name ?? row.text ?? row.institution ?? '—')}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** The list of saves, with the resume as it stood at whichever you pick. */
function SnapshotHistory({ id, navigate, requested }: { id: string; navigate: (to: string) => void; requested?: number }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [resume, setResume] = useState<RenderedResume | null>(null);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [tab, setTab] = useState<'changes' | 'document'>('changes');
  const [theme] = useState<ResumeTheme>(() => {
    try {
      const stored = localStorage.getItem(`resume-theme:${id}`);
      return stored ? { ...DEFAULT_THEME, ...JSON.parse(stored) } : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    resumeApi.snapshots(id)
      .then((rows) => {
        setSnapshots(rows);
        const snapshot = rows.find((row) => row.number === requested) ?? rows[0];
        if (snapshot) void show(snapshot.number);
      })
      .catch((err: Error) => setError(err.message));
  }, [id, requested]);

  async function show(number: number) {
    setSelected(number);
    setDiff(null);

    try {
      // Both at once: what changed, and what the resume looked like after.
      const [at, changes] = await Promise.all([
        resumeApi.at(id, number),
        resumeApi.diff(id, number),
      ]);
      setResume(at);
      setDiff(changes);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function revert() {
    if (selected === null) return;

    setReverting(true);
    try {
      const result = await resumeApi.revert(id, selected);
      navigate(`/documents/${id}`);
      alert(`Restored version ${selected} as version ${result.snapshot}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReverting(false);
    }
  }

  const isLatest = snapshots?.[0]?.number === selected;

  return (
    <>
      <div className="bar">
        <h1>History</h1>
        <Link className="ghost" to={`/documents/${id}`}>Back to editing</Link>
      </div>

      {error && <p className="error">{error}</p>}

      {snapshots?.length === 0 && (
        <section className="card">
          <p className="empty">
            No versions yet. A version is created the first time you save.
          </p>
        </section>
      )}

      {snapshots && snapshots.length > 0 && (
        <div className="history">
          <section className="card">
            <h2>Versions <span className="muted">{snapshots.length}</span></h2>
            <ul className="snapshots">
              {snapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  <button
                    className={selected === snapshot.number ? 'on' : ''}
                    onClick={() => void show(snapshot.number)}
                  >
                    <div className="num">
                      v{snapshot.number}
                      {snapshots[0]?.number === snapshot.number && ' · current'}
                    </div>
                    {snapshot.message && <div className="msg">{snapshot.message}</div>}
                    <div className="when">{when(snapshot.createdAt)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div>
            {selected !== null && !isLatest && (
              <div className="versionbar">
                <span>
                  Viewing <b>version {selected}</b> — this is not the current resume.
                </span>
                <button className="primary" disabled={reverting} onClick={() => void revert()}>
                  {reverting ? 'Restoring…' : `Restore version ${selected}`}
                </button>
              </div>
            )}

            <div className="segmented" style={{ marginBottom: 12, maxWidth: 260 }}>
              <button className={tab === 'changes' ? 'on' : ''} onClick={() => setTab('changes')}>
                What changed
              </button>
              <button className={tab === 'document' ? 'on' : ''} onClick={() => setTab('document')}>
                The resume
              </button>
            </div>

            {tab === 'changes'
              ? <DiffPanel diff={diff} />
              : resume
                ? <ResumeDocument
                    readOnly
                    resume={resume}
                    theme={theme}
                    changes={diff?.changes}
                    onChange={() => {}}
                  />
                : <p className="muted">Loading…</p>}
          </div>
        </div>
      )}
    </>
  );
}
