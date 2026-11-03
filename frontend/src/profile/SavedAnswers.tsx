import { useEffect, useState } from "react";
import { answersApi, type SavedAnswer } from "./answersApi";

/**
 * Answers saved from application forms in the extension. The extension fills
 * them when the same (or similar) question appears again; here they can be
 * corrected or removed.
 */
export function SavedAnswers() {
  const [answers, setAnswers] = useState<SavedAnswer[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    answersApi.list().then(
      (rows) => active && setAnswers(rows),
      (err: unknown) => active && setError(err instanceof Error ? err.message : "Could not load saved answers."),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  async function save(id: string, text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const updated = await answersApi.update(id, text);
      setAnswers((rows) => rows?.map((row) => (row.id === id ? updated : row)) ?? null);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this answer.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await answersApi.remove(id);
      setAnswers((rows) => rows?.filter((row) => row.id !== id) ?? null);
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-panel" aria-labelledby="saved-answers-heading">
      <div className="profile-panel-heading">
        <h2 id="saved-answers-heading">Saved answers</h2>
      </div>
      <p className="profile-muted">
        Answers to application questions, saved from the extension with <strong>Save answers from this form</strong>.
        Autofill uses them when the same or a similar question appears again.
      </p>
      {error && (
        <p className="profile-error" role="alert">
          {error}{" "}
          {!answers && (
            <button className="profile-button is-secondary" onClick={() => setAttempt((value) => value + 1)}>
              Retry
            </button>
          )}
        </p>
      )}
      {!answers && !error && <p role="status">Loading saved answers…</p>}
      {answers?.length === 0 && <p className="profile-muted">No saved answers yet.</p>}
      {answers && answers.length > 0 && (
        <ul className="saved-answers">
          {answers.map((row) => (
            <li key={row.id}>
              <h3>{row.question}</h3>
              {editing?.id === row.id ? (
                <>
                  <label className="saved-answers-sr-only" htmlFor={`answer-${row.id}`}>
                    Answer
                  </label>
                  <textarea
                    id={`answer-${row.id}`}
                    value={editing.text}
                    rows={Math.min(8, Math.max(2, editing.text.split("\n").length))}
                    onChange={(event) => setEditing({ id: row.id, text: event.target.value })}
                    disabled={busy}
                  />
                  <div className="saved-answer-actions">
                    <button className="profile-button" disabled={busy || !editing.text.trim()} onClick={() => void save(row.id, editing.text)}>
                      Save
                    </button>
                    <button className="profile-button is-secondary" disabled={busy} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="saved-answer-text">{row.answer}</p>
              )}
              <p className="saved-answer-meta">
                {[
                  row.company && `Written for ${row.company}`,
                  row.usedCount ? `used ${row.usedCount} time${row.usedCount === 1 ? "" : "s"}` : "not used yet",
                  row.lastUsedAt && `last ${new Date(row.lastUsedAt).toLocaleDateString()}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {editing?.id !== row.id && (
                <div className="saved-answer-actions">
                  {confirming === row.id ? (
                    <>
                      <span>Delete this answer?</span>
                      <button className="profile-button is-danger" disabled={busy} onClick={() => void remove(row.id)}>
                        Delete
                      </button>
                      <button className="profile-button is-secondary" disabled={busy} onClick={() => setConfirming(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="profile-button is-secondary" onClick={() => setEditing({ id: row.id, text: row.answer })}>
                        Edit
                      </button>
                      <button className="profile-button is-secondary" onClick={() => setConfirming(row.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
