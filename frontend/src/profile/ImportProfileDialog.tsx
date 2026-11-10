import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type ContactFields } from "../api";
import { resumeApi, type ResumeSummary } from "../resumeApi";
import { importCv } from "../resume/fromImport";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import {
  careerApi,
  IMPORT_CONTACT_LABELS,
  importInput,
  profileDraftFromFile,
  profileDraftFromResume,
  type CareerSections,
  type CareerState,
  type ImportContactKey,
  type ProfileImportDraft,
} from "./careerApi";
import "./profile-import.css";

export function ImportProfileDialog({
  profile,
  career,
  initialResumeId,
  onClose,
  onApplied,
}: {
  profile: ContactFields;
  career: CareerState;
  /** A saved CV to read straight away, from Profile's CV list. */
  initialResumeId?: string;
  onClose(): void;
  onApplied(state: CareerState): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const [base, setBase] = useState(() => ({ profile: { ...profile }, career }));
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState("");
  const [baseAttempt, setBaseAttempt] = useState(0);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [resumeId, setResumeId] = useState(initialResumeId ?? "");
  const autoRead = useRef(false);
  const [draft, setDraft] = useState<ProfileImportDraft | null>(null);
  const [selectedContact, setSelectedContact] = useState<ImportContactKey[]>(
    [],
  );
  const [selectedSections, setSelectedSections] = useState<
    (keyof CareerSections)[]
  >([]);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => {
      alive.current = false;
      element?.close();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setBaseLoading(true);
    setBaseError("");
    void Promise.all([api.profile(), careerApi.read()])
      .then(([currentProfile, currentCareer]) => {
        if (active) setBase({ profile: currentProfile, career: currentCareer });
      })
      .catch((err: unknown) => {
        if (active)
          setBaseError(
            err instanceof Error
              ? err.message
              : "Could not load the latest profile.",
          );
      })
      .finally(() => {
        if (active) setBaseLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseAttempt]);
  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError("");
    void resumeApi
      .list()
      .then((rows) => {
        if (active) setResumes(rows);
      })
      .catch((err: unknown) => {
        if (active)
          setListError(
            err instanceof Error ? err.message : "Could not load saved CVs.",
          );
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listAttempt]);

  // Opened for one CV: read it once the latest profile has loaded, so the
  // review compares against current values.
  useEffect(() => {
    if (!initialResumeId || autoRead.current || baseLoading || baseError)
      return;
    autoRead.current = true;
    void read();
  });

  function review(next: ProfileImportDraft) {
    setDraft(next);
    setSelectedContact(
      (Object.keys(next.contact) as ImportContactKey[]).filter(
        (key) => !base.profile[key]?.trim(),
      ),
    );
    setSelectedSections(
      (Object.keys(next.sections) as (keyof CareerSections)[]).filter(
        (key) => !!next.sections[key].length && !base.career.data[key],
      ),
    );
    requestAnimationFrame(() =>
      dialog.current
        ?.querySelector<HTMLElement>("#profile-import-review")
        ?.focus(),
    );
  }
  async function read(upload?: File) {
    if (lock.current || baseLoading || baseError || (!upload && !resumeId))
      return;
    lock.current = true;
    setBusy("reading");
    setError("");
    try {
      if (upload && upload.size >= 10 * 1024 * 1024)
        throw new Error("Choose a CV smaller than 10 MB.");
      if (upload && !/\.(pdf|docx|txt|md)$/i.test(upload.name))
        throw new Error("Choose a PDF, DOCX, TXT or Markdown CV.");
      const next = upload
        ? profileDraftFromFile(
            await importCv(upload),
            upload.name.slice(0, 250),
          )
        : profileDraftFromResume(await resumeApi.read(resumeId), resumeId);
      if (
        !Object.keys(next.contact).length &&
        !Object.values(next.sections).some((value) => value.length)
      )
        throw new Error(
          "No profile information was found in this CV. Try another file.",
        );
      if (alive.current) review(next);
    } catch (err) {
      if (alive.current)
        setError(
          err instanceof Error
            ? err.message
            : "Could not read this CV. Your profile is unchanged.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      !draft ||
      lock.current ||
      (!selectedContact.length && !selectedSections.length)
    )
      return;
    lock.current = true;
    setBusy("saving");
    setError("");
    try {
      const input = importInput(
        draft,
        selectedContact,
        selectedSections,
        base.profile,
        base.career.revision,
      );
      if (new Blob([JSON.stringify(input)]).size > 90_000)
        throw new Error(
          "This selection is too large. Import fewer sections at a time.",
        );
      const saved = await careerApi.apply(input);
      if (alive.current) onApplied(saved);
    } catch (err) {
      if (alive.current)
        setError(
          err instanceof Error
            ? err.message
            : "Could not save this import. Your review is still here.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  function toggleContact(key: ImportContactKey) {
    setSelectedContact((values) =>
      values.includes(key)
        ? values.filter((value) => value !== key)
        : [...values, key],
    );
  }
  function toggleSection(key: keyof CareerSections) {
    setSelectedSections((values) =>
      values.includes(key)
        ? values.filter((value) => value !== key)
        : [...values, key],
    );
  }
  function section<K extends keyof CareerSections>(
    key: K,
    value: CareerSections[K],
  ) {
    setDraft((current) =>
      current
        ? { ...current, sections: { ...current.sections, [key]: value } }
        : current,
    );
  }

  return (
    <dialog
      ref={dialog}
      className="profile-import-dialog"
      aria-labelledby="profile-import-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (busy !== "saving") onClose();
      }}
    >
      <form onSubmit={(event) => void save(event)}>
        <header className="profile-import-header">
          <div>
            <h2 id="profile-import-heading">Import from CV</h2>
            <p>Review the information before adding it to your profile.</p>
          </div>
          <button
            type="button"
            className="profile-edit-button"
            aria-label="Close CV import"
            disabled={busy === "saving"}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {!draft ? (
          <div className="profile-import-body">
            {baseLoading && <p role="status">Loading the latest profile…</p>}
            {baseError && (
              <p className="profile-error" role="alert">
                {baseError}{" "}
                <button
                  type="button"
                  className="profile-button is-secondary"
                  onClick={() => setBaseAttempt((value) => value + 1)}
                >
                  Reload profile for import
                </button>
              </p>
            )}
            <section className="profile-import-source">
              <h3>Upload a CV</h3>
              <p>
                PDF, DOCX, TXT or Markdown · smaller than 10 MB. Parsing uses
                Claude and may take a few minutes.
              </p>
              <input
                ref={file}
                type="file"
                aria-label="CV file"
                accept=".pdf,.docx,.txt,.md"
                hidden
                disabled={!!busy || baseLoading || !!baseError}
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = "";
                  if (picked) void read(picked);
                }}
              />
              <button
                type="button"
                className="profile-button"
                disabled={!!busy || baseLoading || !!baseError}
                onClick={() => file.current?.click()}
              >
                Upload CV
              </button>
            </section>
            <section className="profile-import-source">
              <h3>Use a saved CV</h3>
              <p>
                Choose a CV from Documents. This uses its saved content and does
                not call AI.
              </p>
              {listLoading ? (
                <p role="status">Loading your CVs…</p>
              ) : listError ? (
                <p className="profile-error" role="alert">
                  {listError}{" "}
                  <button
                    type="button"
                    className="profile-button is-secondary"
                    onClick={() => setListAttempt((value) => value + 1)}
                  >
                    Retry CV list
                  </button>
                </p>
              ) : resumes.length ? (
                <>
                  <label>
                    Saved CV
                    <select
                      value={resumeId}
                      disabled={!!busy}
                      onChange={(event) => setResumeId(event.target.value)}
                    >
                      <option value="">Choose a CV</option>
                      {resumes.map((cv) => (
                        <option
                          key={cv.id}
                          value={cv.id}
                          disabled={!cv.currentSnapshotId}
                        >
                          {cv.name}
                          {cv.isPrimary ? " (primary)" : ""}
                          {!cv.currentSnapshotId ? " — no saved version" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="profile-button is-secondary"
                    disabled={!!busy || baseLoading || !!baseError || !resumeId}
                    onClick={() => void read()}
                  >
                    Review saved CV
                  </button>
                </>
              ) : (
                <p>No saved CVs yet. Upload a file to start.</p>
              )}
            </section>
          </div>
        ) : (
          <div
            className="profile-import-body"
            id="profile-import-review"
            tabIndex={-1}
          >
            <div className="profile-import-review-note">
              <h3>Choose what to import</h3>
              <p>
                {draft.source.kind === "file"
                  ? draft.source.name
                  : draft.source.kind === "resume"
                    ? `${resumes.find((cv) => cv.id === (draft.source.kind === "resume" ? draft.source.id : ""))?.name || "Saved CV"} · version ${draft.source.snapshot}`
                    : "Profile"}
              </p>
              <p>
                Filled contact fields and previously imported sections start
                unchecked. Selected career sections replace that section in
                Profile. Your CVs stay unchanged.
              </p>
              <button
                type="button"
                className="profile-button is-secondary"
                disabled={!!busy}
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                Choose another CV
              </button>
            </div>
            <fieldset disabled={!!busy}>
              <legend className="profile-import-sr-only">
                Review imported information
              </legend>
              {!!Object.keys(draft.contact).length && (
                <section className="profile-import-section">
                  <h3>Contact information</h3>
                  {(Object.keys(draft.contact) as ImportContactKey[]).map(
                    (key) => (
                      <div key={key} className="profile-import-contact">
                        <label className="profile-import-check">
                          <input
                            type="checkbox"
                            checked={selectedContact.includes(key)}
                            onChange={() => toggleContact(key)}
                          />
                          Import {IMPORT_CONTACT_LABELS[key]}
                        </label>
                        <label>
                          <span className="profile-import-sr-only">
                            {IMPORT_CONTACT_LABELS[key]} from CV
                          </span>
                          <input
                            value={draft.contact[key] ?? ""}
                            maxLength={2000}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                contact: {
                                  ...draft.contact,
                                  [key]: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <small>
                          Current: {base.profile[key] || "Not filled in"}
                        </small>
                      </div>
                    ),
                  )}
                </section>
              )}
              {(
                ["summary", "experiences", "educations", "skills"] as const
              ).map((key) => {
                const label = {
                  summary: "Summary",
                  experiences: "Work experience",
                  educations: "Education",
                  skills: "Skills",
                }[key];
                const found = draft.sections[key].length > 0;
                return (
                  <section key={key} className="profile-import-section">
                    <label className="profile-import-check">
                      <input
                        type="checkbox"
                        checked={selectedSections.includes(key)}
                        disabled={!found}
                        onChange={() => toggleSection(key)}
                      />
                      Import {label}
                    </label>
                    {base.career.data[key] && (
                      <p className="profile-import-existing">
                        This section already has imported information. Select it
                        only if you want to replace it.
                      </p>
                    )}
                    {!found ? (
                      <p>
                        No {label.toLowerCase()} found. Your saved information
                        will stay unchanged.
                      </p>
                    ) : key === "summary" ? (
                      <label>
                        <span className="profile-import-sr-only">
                          Summary from CV
                        </span>
                        <textarea
                          rows={5}
                          maxLength={10000}
                          value={draft.sections.summary}
                          onChange={(event) =>
                            section("summary", event.target.value)
                          }
                        />
                      </label>
                    ) : key === "skills" ? (
                      <label>
                        Skills, one per line
                        <textarea
                          rows={5}
                          value={draft.sections.skills.join("\n")}
                          onChange={(event) =>
                            section("skills", event.target.value.split("\n"))
                          }
                          onBlur={() =>
                            section("skills", [
                              ...new Set(
                                draft.sections.skills
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              ),
                            ])
                          }
                        />
                      </label>
                    ) : key === "experiences" ? (
                      draft.sections.experiences.map((role, index) => (
                        <details key={index} className="profile-import-entry">
                          <summary>
                            {role.title || "Role title missing"} ·{" "}
                            {role.company || "Company missing"}
                          </summary>
                          <div className="profile-import-grid">
                            {(
                              [
                                "company",
                                "title",
                                "client",
                                "location",
                                "from",
                                "to",
                              ] as const
                            ).map((field) => (
                              <label key={field}>
                                {
                                  {
                                    company: "Company",
                                    title: "Job title",
                                    client: "Client (optional)",
                                    location: "Work location (optional)",
                                    from: "Start date",
                                    to: "End date",
                                  }[field]
                                }
                                <input
                                  value={role[field]}
                                  required={
                                    selectedSections.includes("experiences") &&
                                    (field === "company" || field === "title")
                                  }
                                  maxLength={
                                    field === "from" || field === "to"
                                      ? 80
                                      : 2000
                                  }
                                  onChange={(event) =>
                                    section(
                                      "experiences",
                                      draft.sections.experiences.map((r, i) =>
                                        i === index
                                          ? {
                                              ...r,
                                              [field]: event.target.value,
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <label className="profile-import-check">
                            <input
                              type="checkbox"
                              checked={role.current}
                              onChange={(event) =>
                                section(
                                  "experiences",
                                  draft.sections.experiences.map((r, i) =>
                                    i === index
                                      ? { ...r, current: event.target.checked }
                                      : r,
                                  ),
                                )
                              }
                            />
                            Current role
                          </label>
                          <label>
                            Role description
                            <textarea
                              rows={3}
                              maxLength={12000}
                              value={role.description}
                              onChange={(event) =>
                                section(
                                  "experiences",
                                  draft.sections.experiences.map((r, i) =>
                                    i === index
                                      ? {
                                          ...r,
                                          description: event.target.value,
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            Achievements, one per line
                            <textarea
                              rows={5}
                              value={role.bullets.join("\n")}
                              onChange={(event) =>
                                section(
                                  "experiences",
                                  draft.sections.experiences.map((r, i) =>
                                    i === index
                                      ? {
                                          ...r,
                                          bullets:
                                            event.target.value.split("\n"),
                                        }
                                      : r,
                                  ),
                                )
                              }
                              onBlur={() =>
                                section(
                                  "experiences",
                                  draft.sections.experiences.map((r, i) =>
                                    i === index
                                      ? {
                                          ...r,
                                          bullets: r.bullets
                                            .map((b) => b.trim())
                                            .filter(Boolean),
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            Tech stack (optional)
                            <input
                              maxLength={2000}
                              placeholder="Node.js, TypeScript, PostgreSQL"
                              value={role.techStack}
                              onChange={(event) =>
                                section(
                                  "experiences",
                                  draft.sections.experiences.map((r, i) =>
                                    i === index
                                      ? { ...r, techStack: event.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </label>
                        </details>
                      ))
                    ) : (
                      draft.sections.educations.map((education, index) => (
                        <details key={index} className="profile-import-entry">
                          <summary>
                            {education.institution || "Institution missing"} ·{" "}
                            {education.degree || "Degree not provided"}
                          </summary>
                          <div className="profile-import-grid">
                            {(
                              [
                                "institution",
                                "degree",
                                "field",
                                "from",
                                "to",
                              ] as const
                            ).map((field) => (
                              <label key={field}>
                                {
                                  {
                                    institution: "Institution",
                                    degree: "Degree",
                                    field: "Field of study",
                                    from: "Start date",
                                    to: "End date",
                                  }[field]
                                }
                                <input
                                  value={education[field]}
                                  required={
                                    field === "institution" &&
                                    selectedSections.includes("educations")
                                  }
                                  maxLength={
                                    field === "from" || field === "to"
                                      ? 80
                                      : 2000
                                  }
                                  onChange={(event) =>
                                    section(
                                      "educations",
                                      draft.sections.educations.map((r, i) =>
                                        i === index
                                          ? {
                                              ...r,
                                              [field]: event.target.value,
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </details>
                      ))
                    )}
                  </section>
                );
              })}
            </fieldset>
          </div>
        )}
        {busy === "reading" && (
          <p className="profile-import-status" role="status">
            Reading your CV… Nothing has been saved yet.
          </p>
        )}
        {error && (
          <p className="profile-error profile-import-status" role="alert">
            {error}
          </p>
        )}
        <footer className="profile-import-footer">
          <button
            type="button"
            className="profile-button is-secondary"
            disabled={busy === "saving"}
            onClick={onClose}
          >
            Cancel
          </button>
          {draft && (
            <button
              type="submit"
              className="profile-button"
              disabled={
                !!busy || (!selectedContact.length && !selectedSections.length)
              }
            >
              {busy === "saving" ? "Saving…" : "Apply selected information"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
