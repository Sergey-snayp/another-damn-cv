import { useEffect, useState } from "react";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import type { CareerLanguage } from "./careerApi";

export const LANGUAGE_LEVELS = ["Native", "Fluent", "Professional", "Conversational", "Basic"];

/**
 * Languages spoken, for forms that ask for them (Avature's Languages list), as
 * Jobright keeps them in its profile: each language with its level.
 */
export function LanguagesPanel({
  languages,
  disabled,
  onSave,
}: {
  languages: CareerLanguage[];
  disabled: boolean;
  onSave(languages: CareerLanguage[]): Promise<void>;
}) {
  const [rows, setRows] = useState<CareerLanguage[]>(languages);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setRows(languages), [languages]);

  const clean = rows.map((row) => ({ language: row.language.trim(), level: row.level })).filter((row) => row.language);
  const changed = JSON.stringify(clean) !== JSON.stringify(languages);
  const update = (index: number, patch: Partial<CareerLanguage>) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(clean);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not save your languages.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="languages">
      {rows.length === 0 && <p className="profile-empty-line">No languages saved yet. Forms that ask which languages you speak are filled from here.</p>}
      {rows.map((row, index) => (
        <div className="language-row" key={index}>
          <input
            className="language-name"
            aria-label={`Language ${index + 1}`}
            placeholder="Language, e.g. English"
            value={row.language}
            maxLength={80}
            disabled={disabled || saving}
            onChange={(event) => update(index, { language: event.target.value })}
          />
          <select
            className="language-level"
            aria-label={`Level of ${row.language || `language ${index + 1}`}`}
            value={row.level}
            disabled={disabled || saving}
            onChange={(event) => update(index, { level: event.target.value })}
          >
            <option value="">Level</option>
            {LANGUAGE_LEVELS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
          <button
            type="button"
            className="language-remove"
            aria-label={`Remove ${row.language || `language ${index + 1}`}`}
            title="Remove"
            disabled={disabled || saving}
            onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <div className="language-actions">
        <button type="button" className="ghost small" disabled={disabled || saving || rows.length >= 30} onClick={() => setRows((current) => [...current, { language: "", level: "" }])}>
          Add language
        </button>
        {changed && (
          <button type="button" className="primary" disabled={disabled || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save languages"}
          </button>
        )}
      </div>
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}
