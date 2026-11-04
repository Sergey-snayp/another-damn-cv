import { useEffect, useState } from "react";
import { api } from "../api";

const TYPES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

/**
 * The types of work you accept. The extension answers office, hybrid and
 * remote questions from them ("Work from the office 3 days a week?" is Yes
 * when you accept hybrid or on-site). Relocation is answered per country and
 * listed under Default answers.
 */
export function WorkPreferences() {
  const [kinds, setKinds] = useState<string[] | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.profile().then(
      (profile) => active && setKinds((profile.workArrangements ?? "").split(",").filter(Boolean)),
      () => active && setStatus({ text: "Could not load your work preferences.", error: true }),
    );
    return () => {
      active = false;
    };
  }, []);

  async function toggle(value: string) {
    if (!kinds) return;
    const next = kinds.includes(value) ? kinds.filter((kind) => kind !== value) : [...kinds, value];
    setBusy(true);
    setStatus(null);
    try {
      const saved = await api.saveProfile({
        workArrangements: TYPES.map((type) => type.value).filter((kind) => next.includes(kind)).join(","),
      });
      setKinds((saved.workArrangements ?? "").split(",").filter(Boolean));
      setStatus({ text: "Saved." });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Could not save.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-panel" aria-labelledby="work-preferences-heading">
      <div className="profile-panel-heading">
        <h2 id="work-preferences-heading">Work preferences</h2>
      </div>
      <p className="profile-muted">
        Tick every type of work you accept. The extension answers office, hybrid and remote questions from these, and
        asks about relocation once per country.
      </p>
      {kinds && (
        <div className="saved-answer-actions" role="group" aria-label="Types of work you accept">
          {TYPES.map((type) => (
            <label key={type.value} className="work-preference">
              <input
                type="checkbox"
                checked={kinds.includes(type.value)}
                disabled={busy}
                onChange={() => void toggle(type.value)}
              />{" "}
              {type.label}
            </label>
          ))}
        </div>
      )}
      {status && (
        <p className={status.error ? "profile-error" : "profile-muted"} role={status.error ? "alert" : "status"}>
          {status.text}
        </p>
      )}
    </section>
  );
}
