import { useEffect, useRef, useState, type FormEvent } from "react";
import { careerApi, type CareerSections, type CareerState } from "./careerApi";
import "./profile-import.css";
import "./profile-career-editor.css";

export type CareerSectionKey = keyof CareerSections;
const LABELS: Record<CareerSectionKey, string> = {
  summary: "Professional summary",
  experiences: "Work experience",
  educations: "Education",
  skills: "Skills",
};
function sectionsOf(career: CareerState): CareerSections {
  return structuredClone({
    summary: career.data.summary?.value ?? "",
    experiences: career.data.experiences?.value ?? [],
    educations: career.data.educations?.value ?? [],
    skills: career.data.skills?.value ?? [],
  });
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
  /** Only this job or education entry is shown and changed; the others are saved as they are. */
  entry?: number;
  career: CareerState;
  onClose(): void;
  onSaved(state: CareerState): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [draft, setDraft] = useState(() => sectionsOf(career));
  const [skills, setSkills] = useState(draft.skills.join("\n"));
  const [revision, setRevision] = useState(career.revision);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // One entry: removing it leaves nothing to show, and Save then removes it.
  const [removed, setRemoved] = useState(false);
  const single = entry !== undefined;
  const shown = (index: number) => !single || (!removed && index === entry);
  const singular = section === "educations" ? "Education" : "Experience";
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
        setDraft(latest);
        setSkills(latest.skills.join("\n"));
        setRevision(state.revision);
      })
      .catch((reason) => {
        if (active)
          setLoadError(
            reason instanceof Error
              ? reason.message
              : "Could not load your latest Profile.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function updateRole(
    index: number,
    patch: Partial<CareerSections["experiences"][number]>,
  ) {
    setDraft((value) => ({
      ...value,
      experiences: value.experiences.map((role, i) =>
        i === index ? { ...role, ...patch } : role,
      ),
    }));
  }
  function updateEducation(
    index: number,
    patch: Partial<CareerSections["educations"][number]>,
  ) {
    setDraft((value) => ({
      ...value,
      educations: value.educations.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || loading || loadError) return;
    lock.current = true;
    setSaving(true);
    setError("");
    const sections: Partial<CareerSections> =
      section === "skills"
        ? {
            skills: [
              ...new Set(
                skills
                  .split("\n")
                  .map((value) => value.trim())
                  .filter(Boolean),
              ),
            ],
          }
        : section === "experiences"
          ? {
              experiences: draft.experiences.map((role) => ({
                ...role,
                bullets: role.bullets
                  .map((value) => value.trim())
                  .filter(Boolean),
              })),
            }
          : { [section]: draft[section] };
    try {
      onSaved(await careerApi.save(revision, sections));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save your Profile. Your edits are still here.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="profile-import-dialog profile-career-editor"
      aria-labelledby="career-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!lock.current) onClose();
      }}
    >
      <form onSubmit={save}>
        <header className="profile-import-header">
          <div>
            <h2 id="career-editor-title">{single ? singular : LABELS[section]}</h2>
            <p>
              Keep your full career details here. Job recommendations use this
              Profile, including details left out of your CVs.
            </p>
          </div>
          <button
            type="button"
            className="profile-edit-button"
            aria-label="Close career editor"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="profile-import-body">
          {loading && <p role="status">Loading your latest Profile…</p>}
          {loadError && (
            <div role="alert">
              <p className="profile-error">{loadError}</p>
              <button
                className="profile-button is-secondary"
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Retry loading Profile
              </button>
            </div>
          )}
          <fieldset disabled={saving || loading || !!loadError}>
            {section === "summary" && (
              <label>
                Professional summary
                <textarea
                  rows={8}
                  maxLength={10000}
                  value={draft.summary}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      summary: event.target.value,
                    }))
                  }
                />
              </label>
            )}
            {section === "skills" && (
              <label>
                Skills — one per line
                <textarea
                  rows={12}
                  value={skills}
                  onChange={(event) => setSkills(event.target.value)}
                  placeholder={"Node.js\nPostgreSQL\nTeam leadership"}
                />
              </label>
            )}
            {section === "experiences" && (
              <>
                {draft.experiences.map((role, index) => !shown(index) ? null : (
                  <section
                    className="profile-import-section career-edit-entry"
                    key={index}
                    aria-label={`Experience ${index + 1}`}
                  >
                    <div className="career-edit-heading">
                      <h3>
                        {role.title || `Experience ${index + 1}`}
                        {role.company ? ` · ${role.company}` : ""}
                      </h3>
                      <button
                        type="button"
                        className="profile-button is-secondary career-remove"
                        onClick={() =>
                        {
                          setDraft((value) => ({
                            ...value,
                            experiences: value.experiences.filter(
                              (_, i) => i !== index,
                            ),
                          }));
                          if (single) setRemoved(true);
                        }}
                      >
                        Remove experience {index + 1}
                      </button>
                    </div>
                    <div className="profile-import-grid">
                      <label>
                        Job title
                        <input
                          autoFocus={!role.title && !role.company}
                          required
                          maxLength={2000}
                          value={role.title}
                          onChange={(event) =>
                            updateRole(index, { title: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Company
                        <input
                          required
                          maxLength={2000}
                          value={role.company}
                          onChange={(event) =>
                            updateRole(index, { company: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Client (optional)
                        <input
                          maxLength={2000}
                          value={role.client}
                          onChange={(event) =>
                            updateRole(index, { client: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Location (optional)
                        <input
                          maxLength={2000}
                          value={role.location}
                          onChange={(event) =>
                            updateRole(index, { location: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Start date
                        <input
                          maxLength={80}
                          placeholder="2020-03"
                          value={role.from}
                          onChange={(event) =>
                            updateRole(index, { from: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        End date
                        <input
                          maxLength={80}
                          placeholder={role.current ? "Present" : "2024-06"}
                          disabled={role.current}
                          value={role.to}
                          onChange={(event) =>
                            updateRole(index, { to: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="profile-import-check">
                      <input
                        type="checkbox"
                        checked={role.current}
                        onChange={(event) =>
                          updateRole(index, { current: event.target.checked })
                        }
                      />
                      I currently work here
                    </label>
                    <label>
                      Role description
                      <textarea
                        rows={4}
                        maxLength={12000}
                        value={role.description}
                        onChange={(event) =>
                          updateRole(index, { description: event.target.value })
                        }
                      />
                    </label>
                    <h4>Achievements and responsibilities</h4>
                    {role.bullets.map((bullet, bulletIndex) => (
                      <div className="career-edit-bullet" key={bulletIndex}>
                        <label>
                          Bullet {bulletIndex + 1}
                          <textarea
                            autoFocus={!bullet}
                            rows={2}
                            maxLength={4000}
                            value={bullet}
                            onChange={(event) =>
                              updateRole(index, {
                                bullets: role.bullets.map((value, i) =>
                                  i === bulletIndex
                                    ? event.target.value
                                    : value,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="profile-button is-secondary career-remove"
                          aria-label={`Remove bullet ${bulletIndex + 1} from experience ${index + 1}`}
                          onClick={() =>
                            updateRole(index, {
                              bullets: role.bullets.filter(
                                (_, i) => i !== bulletIndex,
                              ),
                            })
                          }
                        >
                          Remove bullet
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="profile-button is-secondary"
                      disabled={role.bullets.length >= 100}
                      onClick={() =>
                        updateRole(index, { bullets: [...role.bullets, ""] })
                      }
                    >
                      + Add bullet
                    </button>
                  </section>
                ))}
                {single && removed && (
                  <p>This experience will be removed when you save. Close to keep it.</p>
                )}
                {!single && !draft.experiences.length && (
                  <p>
                    Add each role with its full responsibilities and
                    achievements.
                  </p>
                )}
                {!single && <button
                  type="button"
                  className="profile-button"
                  disabled={draft.experiences.length >= 100}
                  onClick={() =>
                    setDraft((value) => ({
                      ...value,
                      experiences: [
                        ...value.experiences,
                        {
                          title: "",
                          company: "",
                          client: "",
                          location: "",
                          from: "",
                          to: "",
                          current: false,
                          description: "",
                          bullets: [],
                        },
                      ],
                    }))
                  }
                >
                  + Add experience
                </button>}
              </>
            )}
            {section === "educations" && (
              <>
                {draft.educations.map((row, index) => !shown(index) ? null : (
                  <section
                    className="profile-import-section career-edit-entry"
                    key={index}
                    aria-label={`Education ${index + 1}`}
                  >
                    <div className="career-edit-heading">
                      <h3>{row.institution || `Education ${index + 1}`}</h3>
                      <button
                        type="button"
                        className="profile-button is-secondary career-remove"
                        onClick={() =>
                        {
                          setDraft((value) => ({
                            ...value,
                            educations: value.educations.filter(
                              (_, i) => i !== index,
                            ),
                          }));
                          if (single) setRemoved(true);
                        }}
                      >
                        Remove education {index + 1}
                      </button>
                    </div>
                    <label>
                      Institution or training provider
                      <input
                        autoFocus={!row.institution}
                        required
                        maxLength={2000}
                        value={row.institution}
                        onChange={(event) =>
                          updateEducation(index, {
                            institution: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="profile-import-grid">
                      <label>
                        Degree (optional)
                        <input
                          maxLength={2000}
                          value={row.degree}
                          onChange={(event) =>
                            updateEducation(index, {
                              degree: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Field of study or course
                        <input
                          maxLength={2000}
                          value={row.field}
                          onChange={(event) =>
                            updateEducation(index, {
                              field: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Start date
                        <input
                          maxLength={80}
                          value={row.from}
                          onChange={(event) =>
                            updateEducation(index, { from: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        End date
                        <input
                          maxLength={80}
                          value={row.to}
                          onChange={(event) =>
                            updateEducation(index, { to: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  </section>
                ))}
                {single && removed && (
                  <p>This education entry will be removed when you save. Close to keep it.</p>
                )}
                {!single && <button
                  type="button"
                  className="profile-button"
                  disabled={draft.educations.length >= 50}
                  onClick={() =>
                    setDraft((value) => ({
                      ...value,
                      educations: [
                        ...value.educations,
                        {
                          institution: "",
                          degree: "",
                          field: "",
                          from: "",
                          to: "",
                        },
                      ],
                    }))
                  }
                >
                  + Add education
                </button>}
              </>
            )}
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="profile-error profile-import-status">
            {error}
          </p>
        )}
        <footer className="profile-import-footer">
          <button
            type="button"
            className="profile-button is-secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="profile-button"
            disabled={saving || loading || !!loadError}
          >
            {saving ? "Saving…" : "Save to Profile"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
