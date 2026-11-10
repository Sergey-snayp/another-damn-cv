import { useEffect, useState } from "react";
import { defaultsApi, type AutofillDefault } from "./answersApi";
import { useConfirm } from "../components/ConfirmDialog";

const LABELS: Record<AutofillDefault["kind"], string> = {
  requiresSponsorship: "Needs visa sponsorship",
  workAuthorization: "Allowed to work",
  workedHereBefore: "Worked here before",
  willingToRelocate: "Willing to relocate",
};

function where(row: AutofillDefault): string {
  if (row.kind === "workedHereBefore") return "For every company";
  if (row.kind === "willingToRelocate") return row.scope ? `To ${row.scope}` : "When a form names no country";
  return row.scope ? `In ${row.scope}` : "When a form names no country";
}

/**
 * Yes/No answers chosen from a field's icon in the extension. Each belongs to
 * one country (sponsorship, work authorization), so "Poland: Yes" never
 * answers a question about another country. "Worked here before" is one
 * answer for every company.
 */
export function DefaultAnswers() {
  const [rows, setRows] = useState<AutofillDefault[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    defaultsApi.list().then(
      (list) => active && setRows(list),
      (err: unknown) => active && setError(err instanceof Error ? err.message : "Could not load default answers."),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  async function change(row: AutofillDefault, value: string) {
    setBusy(row.id);
    setError("");
    try {
      const updated = await defaultsApi.update(row.id, value);
      setRows((list) => list?.map((item) => (item.id === row.id ? updated : item)) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change this answer.");
    } finally {
      setBusy(null);
    }
  }
  async function remove(row: AutofillDefault) {
    const yes = await confirm({
      title: "Are you sure you want to remove this answer?",
      body: (
        <p>
          Your answer to <b>{LABELS[row.kind] ?? row.kind}</b> will be removed. Autofill will ask the form again.
        </p>
      ),
      action: "Remove answer",
    });
    if (!yes) return;
    setBusy(row.id);
    setError("");
    try {
      await defaultsApi.remove(row.id);
      setRows((list) => list?.filter((item) => item.id !== row.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this answer.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="profile-panel" aria-labelledby="default-answers-heading">
      <div className="profile-panel-heading">
        <h2 id="default-answers-heading">Default answers</h2>
      </div>
      <p className="profile-muted">Your usual answers to common questions, set from the extension. Some are kept per country.</p>
      {error && (
        <p className="profile-error" role="alert">
          {error}{" "}
          {!rows && (
            <button className="profile-button is-secondary" onClick={() => setAttempt((value) => value + 1)}>
              Retry
            </button>
          )}
        </p>
      )}
      {!rows && !error && <p role="status">Loading default answers…</p>}
      {rows?.length === 0 && <p className="profile-muted">No default answers yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="saved-answers">
          {rows.map((row) => {
            const yesNo = row.value === "Yes" || row.value === "No";
            return (
              <li key={row.id}>
                <h3>
                  {LABELS[row.kind] ?? row.kind}
                  {where(row) && <span className="saved-answer-meta"> · {where(row)}</span>}
                </h3>
                <div className="saved-answer-actions">
                  {yesNo ? (
                    ["Yes", "No"].map((choice) => (
                      <button
                        key={choice}
                        className={`profile-button${row.value === choice ? "" : " is-secondary"}`}
                        aria-pressed={row.value === choice}
                        disabled={busy === row.id}
                        onClick={() => row.value !== choice && void change(row, choice)}
                      >
                        {choice}
                      </button>
                    ))
                  ) : (
                    <span className="saved-answer-text">{row.value}</span>
                  )}
                  <button className="profile-button is-secondary" disabled={busy === row.id} onClick={() => void remove(row)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
