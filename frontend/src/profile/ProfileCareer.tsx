import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import type { usePrimaryResume } from "./usePrimaryResume";
import type { CareerData, CareerExperience } from "./careerApi";
import { AchievementList, type RolePatch } from "./AchievementList";
import type { CareerEntry, CareerSectionKey } from "./ProfileCareerEditor";

type Career = ReturnType<typeof usePrimaryResume>;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-10" → "Oct 2024"; a year or free text stays as written. */
export function careerDate(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return month ? `${month} ${match![1]}` : value.trim();
}

const dateRange = (from: string, to: string, current = false) =>
  [careerDate(from), current ? "Present" : careerDate(to)].filter(Boolean).join(" – ");

/**
 * The career overview: experience, education and skills, each edited in place.
 * No summary: each CV's summary is written for its job posting.
 */
export function ProfileCareer({
  imported,
  importDisabled,
  onEditCareer,
  onDescribe,
  onCollect,
  onDelete,
  onSaveRole,
}: {
  imported: CareerData;
  importDisabled: boolean;
  /** Opens "Describe in your own words" for one job. */
  onDescribe(entry: number): void;
  /** Opens "Collect from my CVs". */
  onCollect?(): void;
  /** Deletes one job or education entry, after asking. */
  onDelete?(section: "experiences" | "educations", entry: number): void;
  /** Saves one job's achievements (stars, edits, additions, deletions) on the latest Profile. */
  onSaveRole(entry: number, patch: (current: CareerExperience) => Partial<RolePatch>): Promise<void>;
  /** With `entry`, only that job or education entry is edited, or a new one added. */
  onEditCareer(section: CareerSectionKey, entry?: CareerEntry): void;
}) {
  const experiences = imported.experiences?.value ?? [];
  const educations = imported.educations?.value ?? [];
  const skills = imported.skills?.value ?? [];
  const add = (section: CareerSectionKey, label: string) => (
    <button className="profile-add-button" aria-label={label} onClick={() => onEditCareer(section, "new")} disabled={importDisabled}>
      <Icon name="plus" size={15} />
      Add
    </button>
  );
  const edit = (section: CareerSectionKey, label: string, entry?: number) => (
    <button
      className="profile-edit-button"
      aria-label={label}
      title="Edit"
      onClick={() => onEditCareer(section, entry)}
      disabled={importDisabled}
    >
      <Icon name="edit" size={16} />
    </button>
  );
  const remove = (section: "experiences" | "educations", label: string, entry: number) =>
    onDelete && (
      <button className="profile-edit-button" aria-label={label} title="Delete" onClick={() => onDelete(section, entry)} disabled={importDisabled}>
        <Icon name="trash" size={16} />
      </button>
    );
  const pills = (items: (string | false | undefined)[]) => {
    const shown = items.filter((item): item is string => Boolean(item && item.trim()));
    return shown.length ? (
      <ul className="profile-pills">
        {shown.map((item) => <li key={item}>{item}</li>)}
      </ul>
    ) : null;
  };
  return (
    <>

      <section className="profile-panel" aria-labelledby="profile-work-heading">
        <div className="profile-panel-heading">
          <h2 id="profile-work-heading">Experience</h2>
          <div className="profile-heading-actions">
            {onCollect && (
              <button
                type="button"
                className="profile-text-button"
                disabled={importDisabled}
                title="Add the achievements and jobs your saved CVs have that this Profile doesn't"
                onClick={onCollect}
              >
                Collect from my CVs
              </button>
            )}
            {add("experiences", "Add work experience")}
          </div>
        </div>
        {experiences.length ? (
          experiences.map((role, index) => (
            <article className="profile-entry" key={index}>
              <span className="profile-entry-icon" aria-hidden="true"><Icon name="briefcase" size={24} /></span>
              <div className="profile-entry-main">
                <div className="profile-entry-heading">
                  <div className="profile-entry-title">
                    <h3>{role.title}</h3>
                    <p>{role.company}</p>
                  </div>
                  <div className="profile-entry-tools">
                    {edit("experiences", `Edit ${role.title} at ${role.company} in Profile`, index)}
                    {remove("experiences", `Delete ${role.title} at ${role.company}`, index)}
                  </div>
                </div>
                {pills([role.client && `for ${role.client}`, role.location, dateRange(role.from, role.to, role.current)])}
                {role.description && <p className="profile-body profile-preserve-lines">{role.description}</p>}
                <AchievementList role={role} disabled={importDisabled} onSave={(patch) => onSaveRole(index, patch)} />
                {role.techStack?.trim() && (
                  <p className="profile-stack">Technologies: {role.techStack}</p>
                )}
                <div className="profile-entry-more">
                  <button
                    type="button"
                    className="profile-describe-button"
                    disabled={importDisabled}
                    aria-label={`Describe ${role.title} at ${role.company} in your own words`}
                    onClick={() => onDescribe(index)}
                  >
                    ✦ Describe in your own words
                  </button>
                  {role.notes?.length ? (
                    <span className="profile-muted">
                      {role.notes.length === 1 ? "1 note" : `${role.notes.length} notes`} · last{" "}
                      {new Date(role.notes[role.notes.length - 1]!.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="profile-empty-line">No work experience saved in Profile yet. Import a CV or add your roles.</p>
        )}
      </section>

      <section className="profile-panel" aria-labelledby="profile-education-heading">
        <div className="profile-panel-heading">
          <h2 id="profile-education-heading">Education</h2>
          {add("educations", "Add education")}
        </div>
        {educations.length ? (
          educations.map((row, index) => (
            <article className="profile-entry" key={index}>
              <span className="profile-entry-icon is-education" aria-hidden="true"><Icon name="education" size={24} /></span>
              <div className="profile-entry-main">
                <div className="profile-entry-heading">
                  <div className="profile-entry-title">
                    <h3>{row.institution}</h3>
                    {(row.degree || row.field) && <p>{[row.degree, row.field].filter(Boolean).join(", ")}</p>}
                  </div>
                  <div className="profile-entry-tools">
                    {edit("educations", `Edit ${row.institution} in Profile`, index)}
                    {remove("educations", `Delete ${row.institution}`, index)}
                  </div>
                </div>
                {pills([dateRange(row.from, row.to)])}
              </div>
            </article>
          ))
        ) : (
          <p className="profile-empty-line">No education saved in Profile yet.</p>
        )}
      </section>

      <section className="profile-panel" aria-labelledby="profile-skills-heading">
        <div className="profile-panel-heading">
          <h2 id="profile-skills-heading">Skills</h2>
          {edit("skills", "Edit profile skills")}
        </div>
        {skills.length ? (
          <ul className="profile-chips">
            {skills.map((skill, index) => <li key={index}>{skill}</li>)}
          </ul>
        ) : (
          <p className="profile-empty-line">No skills saved in Profile yet.</p>
        )}
      </section>
    </>
  );
}

/** The default CV, and the others to switch to or import from. */
export function ResumeCard({
  career,
  importDisabled,
  onImportCv,
}: {
  career: Career;
  importDisabled: boolean;
  /** Opens the import review for one saved CV. */
  onImportCv(resumeId: string): void;
}) {
  const { primary, resumes, loading, error, retry } = career;
  const [open, setOpen] = useState(false);
  const updated = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return (
    <section className="profile-panel profile-side-card" aria-labelledby="profile-resume-heading">
      <h2 id="profile-resume-heading">Default resume</h2>
      {loading ? (
        <p role="status">Loading…</p>
      ) : error ? (
        <>
          <p className="profile-error" role="alert">{error}</p>
          <button className="profile-button is-secondary" onClick={retry}>Retry</button>
        </>
      ) : primary ? (
        <Link className="profile-resume" to={`/documents/${primary.id}`}>
          <Icon name="file" size={20} />
          <span>
            <strong title={primary.name}>{primary.name}</strong>
            <small>{primary.currentSnapshotId ? `Updated ${updated(primary.updatedAt)}` : "Not saved yet"}</small>
          </span>
        </Link>
      ) : (
        <p className="profile-empty-line">
          No default resume. <Link to="/documents">Choose one</Link>
        </p>
      )}
      {!loading && !error && resumes.length > 1 && (
        <>
          <button
            type="button"
            className="profile-text-button"
            aria-expanded={open}
            aria-controls="profile-cv-list"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide other CVs" : `All CVs (${resumes.length})`}
          </button>
          {open && (
            <ul className="profile-cv-list" id="profile-cv-list">
              {resumes.map((cv) => (
                <li key={cv.id}>
                  <Link to={`/documents/${cv.id}`} title={cv.name}>{cv.name}</Link>
                  {cv.isPrimary && <span className="profile-tag">Default</span>}
                  <button
                    type="button"
                    className="profile-text-button"
                    disabled={importDisabled || !cv.currentSnapshotId}
                    title={
                      !cv.currentSnapshotId
                        ? "Save this CV once before importing it."
                        : importDisabled
                          ? "Save or discard your changes first."
                          : "Review this CV's details and choose what to save to your Profile."
                    }
                    onClick={() => onImportCv(cv.id)}
                  >
                    Import
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
