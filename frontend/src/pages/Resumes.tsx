import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { resumeApi, type ResumeSummary } from '../resumeApi';
import { ImportButton } from '../resume/ImportButton';
import type { RenderedResume } from '../resumeApi';

export function Resumes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ResumeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [targetRole, setTargetRole] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    try {
      setRows(await resumeApi.list());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function create() {
    if (!name.trim()) return;

    try {
      await resumeApi.create(name.trim(), targetRole.trim() || undefined);
      setName('');
      setTargetRole('');
      setCreating(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /**
   * An imported CV becomes an unsaved draft in the editor, not a saved resume.
   * The person reads it in the document first; their Save is what makes it
   * version 1.
   */
  async function startFromDraft(draft: RenderedResume) {
    const name = draft.experiences[0]?.title || 'Imported CV';
    const created = await resumeApi.create(name);

    sessionStorage.setItem(`resume-draft:${created.id}`, JSON.stringify(draft));
    navigate(`/resumes/${created.id}`);
  }

  return (
    <>
      <h1>Resumes</h1>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>
          Your resumes <span className="muted">{rows?.length ?? 0}</span>
        </h2>
        <p className="muted small">
          One per angle you apply from. Each keeps its own history.
        </p>

        {rows?.length === 0 && (
          <p className="empty">
            Nothing yet. A resume starts empty and gains a version every time you
            save — so the first import becomes version 1.
          </p>
        )}

        {rows && rows.length > 0 && (
          <ul className="resumes">
            {rows.map((row) => (
              <li key={row.id}>
                <Link to={`/resumes/${row.id}`}>
                  <div>
                    <div className="role">
                      {row.name}
                      {row.isPrimary && <span className="badge offer">primary</span>}
                      {row.jobId && <span className="badge applied">tailored</span>}
                      {!row.currentSnapshotId && <span className="badge">empty</span>}
                    </div>
                    <div className="muted tiny">
                      {/* A tailored copy is named after its role already. */}
                      {row.targetRole && !row.name.startsWith(row.targetRole) ? `${row.targetRole} · ` : ''}
                      updated {new Date(row.updatedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <span className="chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <ImportButton
            label="Start from a CV"
            onDraft={(draft) => void startFromDraft(draft)}
          />
          {!creating && <button className="ghost" onClick={() => setCreating(true)}>New resume</button>}
        </div>

        {creating ? (
          <div className="entry">
            <label className="field">
              <span>Name</span>
              <input
                autoFocus
                value={name}
                placeholder="Backend Engineer"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void create()}
              />
            </label>
            <label className="field">
              <span>Target role (optional)</span>
              <input
                value={targetRole}
                placeholder="Senior Backend Engineer, payments"
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </label>
            <div className="row">
              <button className="primary" onClick={() => void create()}>Create</button>
              <button className="ghost" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
