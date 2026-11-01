import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { resumeApi, type RenderedResume, type Tailoring } from '../resumeApi';
import { DiffText } from '../resume/DiffText';
import { applyTailoring, hasSuggestion, type Accepted } from '../resume/applyTailoring';
import '../resume/document.css';

export function TailorReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [resume, setResume] = useState<RenderedResume | null>(null);
  const [tailoring, setTailoring] = useState<Tailoring | null | undefined>(undefined);
  const [accepted, setAccepted] = useState<Accepted>({});
  const [reorder, setReorder] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([resumeApi.read(id), resumeApi.tailoring(id)]).then(([r, { tailoring: t }]) => {
      setResume(r);
      setTailoring(t);
      if (t) {
        const initial: Accepted = { summary: t.summary.after !== t.summary.before };
        for (const b of t.bullets) if (hasSuggestion(b)) initial[b.lineageId] = true;
        setAccepted(initial);
      }
    }, (err: Error) => setError(err.message));
  }, [id]);

  const decisions = useMemo(() => Object.keys(accepted), [accepted]);
  const acceptedCount = decisions.filter((key) => accepted[key]).length;

  if (error && !resume) return <><h1>Review suggestions</h1><p className="error">{error}</p></>;
  if (!resume || tailoring === undefined) return <p className="muted">Loading…</p>;

  if (!tailoring) {
    return (
      <>
        <h1>Review suggestions</h1>
        <p className="muted">There are no suggestions waiting for this resume.</p>
        <p><Link to={`/resumes/${id}`}>Open the resume</Link></p>
      </>
    );
  }

  const t = tailoring;
  const stale = resume.snapshot !== t.basedOnSnapshot;
  const toggle = (key: string) => setAccepted({ ...accepted, [key]: !accepted[key] });
  const setAll = (value: boolean) =>
    setAccepted(Object.fromEntries(decisions.map((key) => [key, value])));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await resumeApi.save(id, applyTailoring(resume!, t, accepted, reorder), `Tailored for ${t.jobTitle}`);
      await resumeApi.discardTailoring(id);
      navigate(`/resumes/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function discard() {
    if (!confirm('Drop all suggestions? The resume stays as it is.')) return;
    await resumeApi.discardTailoring(id);
    navigate(`/resumes/${id}`);
  }

  const changedCount = t.bullets.filter((b) => b.after !== b.before).length;
  const hiddenCount = t.bullets.filter((b) => !b.keep).length;
  const blockedCount = t.bullets.filter((b) => b.blocked).length + (t.summary.blocked ? 1 : 0);

  return (
    <>
      <p className="crumb"><Link to={`/jobs/${t.jobId}`}>← {t.jobTitle}</Link></p>
      <h1>Review suggestions</h1>
      <p className="muted small">
        For <b>{t.jobTitle}</b>{t.company ? ` at ${t.company}` : ''}: {changedCount} bullets reworded,{' '}
        {hiddenCount} suggested for hiding{blockedCount > 0 ? `, ${blockedCount} rewrites thrown out for adding facts` : ''}.
        Untick anything you don&rsquo;t want, then save.
      </p>

      {stale && (
        <p className="notice-line">
          This resume was changed after the suggestions were made. Saving now could undo those edits:
          tailor again from the <Link to={`/jobs/${t.jobId}`}>job page</Link>.
        </p>
      )}

      {t.cannotClaim.length > 0 && (
        <section className="card tailor-gaps">
          <h2>Not on your resume</h2>
          <p className="muted small">The posting asks for these. They were left out rather than made up. Be ready for them in an interview.</p>
          <ul>{t.cannotClaim.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Summary</h2>
        <SuggestionRow
          checked={accepted.summary}
          onToggle={'summary' in accepted && t.summary.after !== t.summary.before ? () => toggle('summary') : undefined}
          before={t.summary.before}
          after={t.summary.after}
          blocked={t.summary.blocked}
        />
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>
          Experience
          <label className="tailor-reorder muted small">
            <input type="checkbox" checked={reorder} onChange={() => setReorder(!reorder)} />
            Put the most relevant bullets and skills first
          </label>
        </h2>

        {resume.experiences.map((role) => {
          const rows = t.bullets
            .filter((b) => b.experienceLineageId === role.lineageId)
            .sort((x, y) => (reorder ? x.to - y.to : x.from - y.from));
          if (rows.length === 0) return null;

          return (
            <div key={role.lineageId} className="tailor-role">
              <h3>{role.title} <span className="muted">· {[role.company, role.client].filter(Boolean).join(' — ')}</span></h3>
              {rows.map((b) => (
                <SuggestionRow
                  key={b.lineageId}
                  checked={accepted[b.lineageId]}
                  onToggle={hasSuggestion(b) ? () => toggle(b.lineageId) : undefined}
                  before={b.before}
                  after={b.after}
                  blocked={b.blocked}
                  hide={b.keep ? null : b.reason}
                  moved={reorder && b.to < b.from ? b.from + 1 : null}
                />
              ))}
            </div>
          );
        })}
      </section>

      {reorder && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Skills, most relevant first</h2>
          <div className="tailor-skills">
            {t.skills.slice(0, 20).map((lineage) => {
              const skill = resume.skills.find((s) => s.lineageId === lineage);
              return skill ? <span key={lineage} className="badge">{skill.name}</span> : null;
            })}
            {t.skills.length > 20 && <span className="muted tiny">and {t.skills.length - 20} more after</span>}
          </div>
        </section>
      )}

      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}

      <div className="tailor-actions">
        <button className="primary" disabled={busy || stale} onClick={() => void save()}>
          {busy ? 'Saving…' : `Save ${acceptedCount} accepted`}
        </button>
        <button className="ghost" disabled={busy} onClick={() => setAll(true)}>Accept all</button>
        <button className="ghost" disabled={busy} onClick={() => setAll(false)}>Reject all</button>
        <button className="ghost" disabled={busy} onClick={() => void discard()}>Discard suggestions</button>
      </div>
    </>
  );
}

function SuggestionRow({ checked, onToggle, before, after, blocked, hide = null, moved = null }: {
  checked?: boolean;
  onToggle?: () => void;
  before: string;
  after: string;
  blocked: string | null;
  hide?: string | null;
  moved?: number | null;
}) {
  const reworded = after !== before;
  const on = Boolean(onToggle && checked);

  return (
    <div className={`tailor-row${onToggle ? '' : ' plain'}${on ? ' on' : ''}`}>
      {onToggle
        ? <input type="checkbox" checked={on} onChange={onToggle} aria-label="Accept this suggestion" />
        : <span className="tailor-spacer" />}
      <div>
        <div className="tailor-tags">
          {moved !== null && <span className="badge applied">moved up from #{moved}</span>}
          {hide !== null && <span className="badge rejected">hide: {hide}</span>}
          {blocked && <span className="badge interviewing" title={blocked}>kept original</span>}
          {!reworded && hide === null && !blocked && <span className="muted tiny">unchanged</span>}
        </div>
        <p className={`tailor-text${on && hide !== null ? ' hidden-line' : ''}`}>
          {reworded && on ? <DiffText before={before} after={after} /> : before}
        </p>
        {reworded && !on && <p className="muted tiny">Not accepted: {after}</p>}
        {blocked && <p className="muted tiny">{blocked}</p>}
      </div>
    </div>
  );
}
