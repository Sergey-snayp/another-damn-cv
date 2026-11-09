import { useEffect, useState, type FormEvent } from "react";
import { api, type ContactFields } from "../api";
import { DashboardIcon } from "../jobs/DashboardIcon";
import { defaultsApi, type AutofillDefault } from "./answersApi";
import "./employment-information.css";

const COUNTRIES = {
  authorizedUS: "United States",
  authorizedCA: "Canada",
  authorizedUK: "United Kingdom",
} as const;
const YES_NO = ["Yes", "No", "Prefer not to answer"];
const QUESTIONS = [
  {
    key: "eeoRace",
    label: "What is your ethnicity?",
    choices: [
      "Prefer not to answer",
      "American Indian or Alaska Native",
      "Asian",
      "Black or African American",
      "Hispanic or Latino",
      "Native Hawaiian or Other Pacific Islander",
      "White",
      "Two or more races",
    ],
  },
  {
    key: "authorizedUS",
    label: "Are you authorized to work in the US?",
    choices: YES_NO,
  },
  {
    key: "authorizedCA",
    label: "Are you authorized to work in Canada?",
    choices: YES_NO,
  },
  {
    key: "authorizedUK",
    label: "Are you authorized to work in the United Kingdom?",
    choices: YES_NO,
  },
  {
    key: "requiresSponsorship",
    label:
      "Will you now or in the future require sponsorship for employment visa status?",
    choices: YES_NO,
  },
  { key: "eeoDisability", label: "Do you have a disability?", choices: YES_NO },
  { key: "eeoLgbtq", label: "Do you identify as LGBTQ+?", choices: YES_NO },
  {
    key: "eeoGender",
    label: "What is your gender?",
    choices: ["Man", "Woman", "Non-binary", "Prefer not to answer"],
  },
  { key: "eeoVeteran", label: "Are you a veteran?", choices: YES_NO },
] as const;
type Key = (typeof QUESTIONS)[number]["key"];
type Values = Record<Key, string>;
const CONTACT = QUESTIONS.filter(
  (question) => !Object.hasOwn(COUNTRIES, question.key),
).map((question) => question.key as keyof ContactFields);
const sameCountry = (a: string, b: string) =>
  a.trim().toLowerCase() === b.toLowerCase();
function valuesOf(profile: ContactFields, defaults: AutofillDefault[]): Values {
  return Object.fromEntries(
    QUESTIONS.map(({ key }) => [
      key,
      Object.hasOwn(COUNTRIES, key)
        ? (defaults.find(
            (row) =>
              row.kind === "workAuthorization" &&
              sameCountry(row.scope, COUNTRIES[key as keyof typeof COUNTRIES]),
          )?.value ?? "")
        : (profile[key as keyof ContactFields] ?? ""),
    ]),
  ) as Values;
}
function display(key: Key, value: string) {
  if (!value) return "—";
  if (key === "eeoGender")
    return (
      ({ Man: "Male", Woman: "Female" } as Record<string, string>)[value] ??
      value
    );
  if (key === "eeoVeteran" && value === "I am not a protected veteran")
    return "No";
  if (key === "eeoVeteran" && value === "I am a protected veteran")
    return "Yes";
  return value;
}

export function EmploymentInformation({
  profile,
  onSaved,
  disabled = false,
}: {
  profile: ContactFields;
  onSaved(profile: ContactFields): void;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<AutofillDefault[]>([]);
  const [draft, setDraft] = useState<Values>(() => valuesOf(profile, []));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    defaultsApi
      .list()
      .then(
        (result) => {
          if (active) setRows(result);
        },
        (reason) => {
          if (active)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not load employment information.",
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      // Use the same country-scoped defaults that the extension already reads.
      const latest = await defaultsApi.list();
      const add: Array<Pick<AutofillDefault, "kind" | "scope" | "value">> = [];
      for (const [key, country] of Object.entries(COUNTRIES)) {
        const existing = latest.find(
          (row) =>
            row.kind === "workAuthorization" && sameCountry(row.scope, country),
        );
        const value = draft[key as Key];
        if (!value && existing) await defaultsApi.remove(existing.id);
        else if (value && value !== existing?.value)
          add.push({ kind: "workAuthorization", scope: country, value });
      }
      if (add.length) await defaultsApi.save(add);
      const saved = await api.saveProfile(
        Object.fromEntries(CONTACT.map((key) => [key, draft[key as Key]])),
      );
      onSaved(saved);
      setRows(await defaultsApi.list());
      setEditing(false);
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : "Could not save employment information."} Your edits are still here. Some answers may already be saved; retry to finish.`,
      );
    } finally {
      setSaving(false);
    }
  }
  const values = editing ? draft : valuesOf(profile, rows);
  return (
    <section
      className="profile-panel employment-information"
      aria-labelledby="employment-information-title"
    >
      <div className="profile-panel-heading">
        <h2 id="employment-information-title">Employment Information</h2>
        {!editing && (
          <button
            type="button"
            className="profile-edit-button"
            aria-label="Edit employment information"
            disabled={disabled || loading || !!error}
            onClick={() => {
              setDraft(valuesOf(profile, rows));
              setEditing(true);
            }}
          >
            <DashboardIcon name="edit" />
          </button>
        )}
      </div>
      {loading ? (
        <p role="status">Loading employment information…</p>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={saving} className="employment-grid">
            {QUESTIONS.map((question) => (
              <div key={question.key} className="employment-item">
                {editing ? (
                  <label>
                    <span>{question.label}</span>
                    <select
                      value={values[question.key]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [question.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Not set</option>
                      {[
                        ...new Set(
                          [...question.choices, values[question.key]].filter(
                            Boolean,
                          ),
                        ),
                      ].map((value) => (
                        <option key={value} value={value}>
                          {display(question.key, value)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <>
                    <p>{question.label}</p>
                    <span>{display(question.key, values[question.key])}</span>
                  </>
                )}
              </div>
            ))}
          </fieldset>
          {editing && (
            <div className="employment-actions">
              <button
                type="button"
                className="profile-button is-secondary"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setAttempt((value) => value + 1);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="profile-button"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save employment information"}
              </button>
            </div>
          )}
        </form>
      )}
      {error && (
        <div role="alert" className="profile-error">
          {error}
          {!editing && (
            <button
              type="button"
              className="profile-button is-secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
