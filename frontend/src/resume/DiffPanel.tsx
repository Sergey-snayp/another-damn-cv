import type { Change, SnapshotDiff } from '../resumeApi';

const MARK: Record<Change['kind'], string> = { added: '+', changed: '~', removed: '−' };

/**
 * What changed in one version.
 *
 * The classification comes from the schema, not from comparing text: a row
 * records the snapshot it appeared in and the one that replaced it, so added,
 * reworded and removed are facts rather than guesses.
 */
export function DiffPanel({ diff }: { diff: SnapshotDiff | null }) {
  if (!diff) return null;

  if (diff.changes.length === 0) {
    return (
      <div className="diffpanel">
        <p className="muted tiny">
          Nothing changed in this version — which should not happen, since a save
          with no changes creates none.
        </p>
      </div>
    );
  }

  return (
    <div className="diffpanel">
      <div className="diffhead">
        <span className="diffcounts">
          {diff.counts.added > 0 && <b className="added">+{diff.counts.added}</b>}
          {diff.counts.changed > 0 && <b className="changed">~{diff.counts.changed}</b>}
          {diff.counts.removed > 0 && <b className="removed">−{diff.counts.removed}</b>}
        </span>
        {diff.message && <span className="muted">{diff.message}</span>}
      </div>

      <ul className="changes">
        {diff.changes.map((change) => (
          <li key={`${change.section}-${change.lineageId}`} className={change.kind}>
            <div className="changehead">
              <span className="mark">{MARK[change.kind]}</span>
              <span className="section">{change.section}</span>
              <span className="label">{change.label}</span>
            </div>

            {change.fields.map((field) => (
              <div className="fieldchange" key={field.field}>
                <div className="fieldname">{field.field}</div>
                {field.before && <div className="before">{field.before}</div>}
                {field.after && <div className="after">{field.after}</div>}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
