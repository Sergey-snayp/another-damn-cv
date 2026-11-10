import { useEffect, useState } from "react";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import { useSetActiveBullet } from "./bulletFocus";

/**
 * The Profile's professional summary, edited in place: a card with its word
 * count and Cancel / Save, checked live by the panel beside the page.
 */
export function SummaryEditor({
  summary,
  keywords,
  disabled,
  onSave,
}: {
  summary: string;
  /** Every technology and skill on the Profile: what "Keywords" looks for. */
  keywords: string[];
  disabled: boolean;
  /** Saves the summary on the latest Profile; rejects with a message when it cannot. */
  onSave(text: string): Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setActive = useSetActiveBullet();
  useEffect(() => {
    setActive(editing === null ? null : { kind: "summary", text: editing, keywords, job: "Professional summary" });
    // The text decides it; the keywords are read as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function save() {
    if (editing === null) return;
    const text = editing.trim();
    if (text === summary.trim()) return setEditing(null);
    setBusy(true);
    setError("");
    try {
      await onSave(text);
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const words = editing?.trim() ? editing.trim().split(/\s+/).length : 0;
  return (
    <section className="profile-panel" aria-labelledby="profile-summary-heading">
      <div className="profile-panel-heading">
        <h2 id="profile-summary-heading">Professional summary</h2>
        {editing === null && (
          <button className="profile-edit-button" aria-label="Edit profile summary" title="Edit" disabled={disabled} onClick={() => setEditing(summary)}>
            <Icon name="edit" size={16} />
          </button>
        )}
      </div>
      {editing !== null ? (
        <>
          <div className="ach-editor">
            <textarea
              aria-label="Professional summary"
              autoFocus
              rows={4}
              maxLength={10000}
              placeholder="Your title, years of experience, core stack and your strongest result, in 3 or 4 sentences."
              value={editing}
              onChange={(event) => setEditing(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditing(null);
                }
              }}
            />
            <span className="ach-count">
              C: <b>{editing.trim().length}</b> W: <b>{words}</b>
            </span>
          </div>
          <div className="ach-editor-actions">
            <button type="button" className="profile-text-button" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="ach-save" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          {error && <p className="profile-error" role="alert">{error}</p>}
        </>
      ) : summary ? (
        <p className="profile-body profile-preserve-lines">{summary}</p>
      ) : (
        <p className="profile-empty-line">Your title, years of experience, core stack and strongest result, in 3 or 4 sentences.</p>
      )}
    </section>
  );
}
