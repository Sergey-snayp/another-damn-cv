import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { careerApi, type CareerSections, type CareerState } from "./careerApi";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import "./profile-import.css";
import "./profile-career-editor.css";

export type CareerSectionKey = keyof CareerSections;
/** One job or school by its place in the list, or a new one. */
export type CareerEntry = number | "new";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 6 - 1960 }, (_, i) => String(THIS_YEAR + 5 - i));
const NEW_ROLE = (): CareerSections["experiences"][number] => ({
  title: "",
  company: "",
  client: "",
  location: "",
  from: "",
  to: "",
  current: false,
  description: "",
  bullets: [],
  techStack: "",
});
const NEW_SCHOOL = (): CareerSections["educations"][number] => ({ institution: "", degree: "", field: "", from: "", to: "" });

function sectionsOf(career: CareerState): CareerSections {
  return structuredClone({
    summary: career.data.summary?.value ?? "",
    experiences: career.data.experiences?.value ?? [],
    educations: career.data.educations?.value ?? [],
    skills: career.data.skills?.value ?? [],
  });
}

/**
 * A date as a month and a year ("2024-10", or just "2024"). A date saved in
 * other words ("Spring 2019") stays editable as text.
 */
function DateField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange(value: string): void;
}) {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
  if (value.trim() && !match)
    return (
      <label className="career-date">
        {label}
        <input maxLength={80} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  const year = match?.[1] ?? "";
  const month = match?.[2] ?? "";
  const compose = (y: string, m: string) => (y ? (m ? `${y}-${m}` : y) : m ? `${THIS_YEAR}-${m}` : "");
  return (
    <fieldset className="career-date" disabled={disabled}>
      <legend>{label}</legend>
      {disabled && placeholder ? (
        <span className="career-date-fixed">{placeholder}</span>
      ) : (
        <div>
          <select aria-label={`${label} month`} value={month} onChange={(event) => onChange(compose(year, event.target.value))}>
            <option value="">Month</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>
            ))}
          </select>
          <select aria-label={`${label} year`} value={year} onChange={(event) => onChange(compose(event.target.value, month))}>
            <option value="">Year</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}
    </fieldset>
  );
}

/** Profile edits keep the complete career history independently of every CV. */
export function ProfileCareerEditor({
  section,
  entry,
  career,
  onClose,
  onSaved,
}: {
  section: CareerSectionKey;
  /** For experience and education: the one entry edited (others are saved as they are), or a new one. */
  entry?: CareerEntry;
  career: CareerState;
  onClose(): void;
  onSaved(state: CareerState): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [draft, setDraft] = useState(() => sectionsOf(career));
  const [skills, setSkills] = useState(draft.skills.join("\n"));
  const [revision, setRevision] = useState(career.revision);
  const [index, setIndex] = useState<number | null>(null);
  const [initial, setInitial] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // The footer asks before something is lost: closing with changes, or deleting the entry.
  const [confirm, setConfirm] = useState<null | "discard" | "delete">(null);
  const [focusBullet, setFocusBullet] = useState<number | null>(null);
  const entries = section === "experiences" || section === "educations";
  const isNew = entries && (entry === undefined || entry === "new");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    careerApi
      .read()
      .then((state) => {
        if (!active) return;
        const latest = sectionsOf(state);
        let at: number | null = null;
        if (section === "experiences" || section === "educations") {
          if (typeof entry === "number" && entry < latest[section].length) at = entry;
          else {
            if (section === "experiences") latest.experiences.push(NEW_ROLE());
            else latest.educations.push(NEW_SCHOOL());
            at = latest[section].length - 1;
          }
        }
        setDraft(latest);
        setSkills(latest.skills.join("\n"));
        setIndex(at);
        setRevision(state.revision);
        setInitial(JSON.stringify([latest, latest.skills.join("\n")]));
      })
      .catch((reason) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : "Could not load your latest Profile.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // The entry is fixed for the life of this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  useEffect(() => {
    if (focusBullet === null) return;
    dialog.current?.querySelector<HTMLTextAreaElement>(`[aria-label="Bullet ${focusBullet + 1}"]`)?.focus();
    setFocusBullet(null);
  }, [focusBullet, draft]);

  const dirty = !loading && !!initial && JSON.stringify([draft, skills]) !== initial;
  const requestClose = () => {
    if (lock.current) return;
    if (dirty) setConfirm("discard");
    else onClose();
  };

  const role = section === "experiences" && index !== null ? draft.experiences[index] : undefined;
  const school = section === "educations" && index !== null ? draft.educations[index] : undefined;
  function updateRole(patch: Partial<CareerSections["experiences"][number]>) {
    if (index === null) return;
    setDraft((value) => ({ ...value, experiences: value.experiences.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  }
  function updateSchool(patch: Partial<CareerSections["educations"][number]>) {
    if (index === null) return;
    setDraft((value) => ({ ...value, educations: value.educations.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  }
  const setBullets = (bullets: string[]) => updateRole({ bullets });

  /** Achievements as a list: Enter starts the next one, Backspace in an empty one removes it. */
  function bulletKey(event: KeyboardEvent<HTMLTextAreaElement>, at: number) {
    if (!role || event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (role.bullets.length >= 100) return;
      setBullets([...role.bullets.slice(0, at + 1), "", ...role.bullets.slice(at + 1)]);
      setFocusBullet(at + 1);
    } else if (event.key === "Backspace" && !event.currentTarget.value) {
      event.preventDefault();
      setBullets(role.bullets.filter((_, i) => i !== at));
      if (at > 0 || role.bullets.length > 1) setFocusBullet(Math.max(0, at - 1));
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const to = event.key === "ArrowUp" ? at - 1 : at + 1;
      if (to < 0 || to >= role.bullets.length) return;
      move(at, to);
    }
  }
  function move(from: number, to: number) {
    if (!role) return;
    const next = [...role.bullets];
    [next[from], next[to]] = [next[to]!, next[from]!];
    setBullets(next);
    setFocusBullet(to);
  }

  /** What Save sends: only the section edited, cleaned up. */
  function sectionsToSave(value: CareerSections): Partial<CareerSections> {
    if (section === "skills")
      return { skills: [...new Set(skills.split("\n").map((item) => item.trim()).filter(Boolean))] };
    if (section === "experiences")
      return {
        experiences: value.experiences.map((item) => ({
          ...item,
          techStack: item.techStack.trim(),
          bullets: item.bullets.map((bullet) => bullet.trim()).filter(Boolean),
        })),
      };
    return { [section]: value[section] };
  }
  async function persist(sections: Partial<CareerSections>) {
    if (lock.current || loading || loadError) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      onSaved(await careerApi.save(revision, sections));
    } catch (reason) {
      setConfirm(null);
      setError(reason instanceof Error ? reason.message : "Could not save your Profile. Your edits are still here.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void persist(sectionsToSave(draft));
  }
  function remove() {
    if (index === null || (section !== "experiences" && section !== "educations")) return;
    const rest = { ...draft, [section]: draft[section].filter((_, i) => i !== index) } as CareerSections;
    void persist(sectionsToSave(rest));
  }

  const noun = section === "educations" ? "education" : "experience";
  const title =
    section === "summary" ? "Professional summary" : section === "skills" ? "Skills" : `${isNew ? "Add" : "Edit"} ${noun}`;
  const subtitle = role
    ? [role.title, role.company].filter((part) => part.trim()).join(" · ")
    : school
      ? school.institution
      : "";

  return (
    <dialog
      ref={dialog}
      className="profile-import-dialog profile-career-editor"
      aria-labelledby="career-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <form onSubmit={save}>
        <header className="profile-import-header career-editor-header">
          <div>
            <h2 id="career-editor-title">{title}</h2>
            {entries && <p className="career-editor-subtitle">{subtitle || `New ${noun}`}</p>}
          </div>
          <button type="button" className="career-close" aria-label="Close career editor" disabled={saving} onClick={requestClose}>
            ×
          </button>
        </header>
        <div className="profile-import-body">
          {loading && <p role="status">Loading your latest Profile…</p>}
          {loadError && (
            <div role="alert">
              <p className="profile-error">{loadError}</p>
              <button className="profile-button is-secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>
                Retry loading Profile
              </button>
            </div>
          )}
          <fieldset disabled={saving || loading || !!loadError}>
            {section === "summary" && (
              <label>
                Professional summary
                <textarea
                  className="career-grow"
                  rows={8}
                  maxLength={10000}
                  value={draft.summary}
                  onChange={(event) => setDraft((value) => ({ ...value, summary: event.target.value }))}
                />
              </label>
            )}
            {section === "skills" && (
              <label>
                Skills — one per line
                <textarea
                  className="career-grow"
                  rows={10}
                  value={skills}
                  onChange={(event) => setSkills(event.target.value)}
                  placeholder={"Node.js\nPostgreSQL\nTeam leadership"}
                />
              </label>
            )}

            {role && index !== null && (
              <section className="career-edit-entry career-form" aria-label={`Experience ${index + 1}`}>
                <div className="career-grid">
                  <label>
                    Job title
                    <input
                      autoFocus={isNew}
                      required
                      maxLength={2000}
                      value={role.title}
                      onChange={(event) => updateRole({ title: event.target.value })}
                    />
                  </label>
                  <label>
                    Company
                    <input required maxLength={2000} value={role.company} onChange={(event) => updateRole({ company: event.target.value })} />
                  </label>
                  <label>
                    Client (optional)
                    <input maxLength={2000} placeholder="If you worked for a client" value={role.client} onChange={(event) => updateRole({ client: event.target.value })} />
                  </label>
                  <label>
                    Location (optional)
                    <input maxLength={2000} placeholder="City, or Remote" value={role.location} onChange={(event) => updateRole({ location: event.target.value })} />
                  </label>
                </div>

                <div className="career-dates">
                  <DateField label="Start date" value={role.from} onChange={(from) => updateRole({ from })} />
                  <DateField
                    label="End date"
                    value={role.current ? "" : role.to}
                    disabled={role.current}
                    placeholder="Present"
                    onChange={(to) => updateRole({ to })}
                  />
                  <label className="profile-import-check career-current">
                    <input type="checkbox" checked={role.current} onChange={(event) => updateRole({ current: event.target.checked })} />
                    I currently work here
                  </label>
                </div>

                <label>
                  Role description
                  <textarea
                    className="career-grow"
                    rows={2}
                    maxLength={12000}
                    placeholder="What the role or project was: the product, the team, the scale."
                    value={role.description}
                    onChange={(event) => updateRole({ description: event.target.value })}
                  />
                </label>

                <fieldset className="career-bullets">
                  <legend>Achievements and responsibilities</legend>
                  {role.bullets.length > 0 && (
                    <ol>
                      {role.bullets.map((bullet, at) => (
                        <li className="career-edit-bullet" key={at}>
                          <span className="career-bullet-mark" aria-hidden="true">•</span>
                          <textarea
                            className="career-grow"
                            aria-label={`Bullet ${at + 1}`}
                            rows={1}
                            maxLength={4000}
                            placeholder="What you did, and what it changed."
                            value={bullet}
                            onChange={(event) => setBullets(role.bullets.map((value, i) => (i === at ? event.target.value : value)))}
                            onKeyDown={(event) => bulletKey(event, at)}
                          />
                          <span className="career-bullet-tools">
                            <button type="button" aria-label={`Move bullet ${at + 1} up`} title="Move up (Alt ↑)" disabled={at === 0} onClick={() => move(at, at - 1)}>
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move bullet ${at + 1} down`}
                              title="Move down (Alt ↓)"
                              disabled={at === role.bullets.length - 1}
                              onClick={() => move(at, at + 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="career-remove"
                              aria-label={`Remove bullet ${at + 1} from experience ${index + 1}`}
                              title="Remove"
                              onClick={() => setBullets(role.bullets.filter((_, i) => i !== at))}
                            >
                              ×
                            </button>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <button
                    type="button"
                    className="add-bullet-button"
                    disabled={role.bullets.length >= 100}
                    onClick={() => {
                      setBullets([...role.bullets, ""]);
                      setFocusBullet(role.bullets.length);
                    }}
                  >
                    <Icon name="plus" size={18} />
                    Add Bullet
                  </button>
                </fieldset>

                <label>
                  Tech stack (optional)
                  <input
                    maxLength={2000}
                    placeholder="Node.js, TypeScript, PostgreSQL"
                    value={role.techStack}
                    onChange={(event) => updateRole({ techStack: event.target.value })}
                  />
                </label>
              </section>
            )}

            {school && index !== null && (
              <section className="career-edit-entry career-form" aria-label={`Education ${index + 1}`}>
                <label>
                  Institution or training provider
                  <input
                    autoFocus={isNew}
                    required
                    maxLength={2000}
                    value={school.institution}
                    onChange={(event) => updateSchool({ institution: event.target.value })}
                  />
                </label>
                <div className="career-grid">
                  <label>
                    Degree (optional)
                    <input maxLength={2000} placeholder="Bachelor's" value={school.degree} onChange={(event) => updateSchool({ degree: event.target.value })} />
                  </label>
                  <label>
                    Field of study or course
                    <input maxLength={2000} placeholder="Computer Science" value={school.field} onChange={(event) => updateSchool({ field: event.target.value })} />
                  </label>
                </div>
                <div className="career-dates">
                  <DateField label="Start date" value={school.from} onChange={(from) => updateSchool({ from })} />
                  <DateField label="End date" value={school.to} onChange={(to) => updateSchool({ to })} />
                </div>
              </section>
            )}
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="profile-error profile-import-status">
            {error}
          </p>
        )}
        <footer className="profile-import-footer career-editor-footer">
          {confirm ? (
            <div className="career-confirm" role="alertdialog" aria-label={confirm === "delete" ? `Delete this ${noun}?` : "Discard your changes?"}>
              <span>{confirm === "delete" ? `Delete this ${noun} from your Profile?` : "Discard your changes?"}</span>
              <button type="button" className="profile-button is-secondary" autoFocus disabled={saving} onClick={() => setConfirm(null)}>
                {confirm === "delete" ? "Keep" : "Keep editing"}
              </button>
              <button type="button" className="profile-button is-danger" disabled={saving} onClick={confirm === "delete" ? remove : onClose}>
                {confirm === "delete" ? (saving ? "Deleting…" : "Delete") : "Discard"}
              </button>
            </div>
          ) : (
            <>
              {entries && !isNew && index !== null && (
                <button
                  type="button"
                  className="career-delete"
                  aria-label={`Remove ${noun} ${index + 1}`}
                  disabled={saving || loading}
                  onClick={() => setConfirm("delete")}
                >
                  Delete {noun}
                </button>
              )}
              <button type="button" className="profile-button is-secondary" disabled={saving} onClick={requestClose}>
                Cancel
              </button>
              <button type="submit" className="profile-button" disabled={saving || loading || !!loadError}>
                {saving ? "Saving…" : "Save to Profile"}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}
