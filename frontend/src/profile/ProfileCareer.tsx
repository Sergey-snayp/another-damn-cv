import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import type { usePrimaryResume } from "./usePrimaryResume";
import type { CareerData, CareerSection } from "./careerApi";
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

/** Where the career details came from, once for the whole page. */
function sourceLine(data: CareerData): string {
  const sections = Object.values(data).filter(Boolean) as CareerSection<unknown>[];
  if (!sections.length) return "";
  const latest = sections.reduce((a, b) => (a.importedAt > b.importedAt ? a : b));
  const date = new Date(latest.importedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const imported = sections.find((section) => section.source.kind !== "profile")?.source;
  const from = imported?.kind === "file" ? imported.name : imported?.kind === "resume" ? "your CV" : "";
  return from ? `Imported from ${from} · last updated ${date}. Edits here do not change your CVs.` : `Last updated ${date}.`;
}

/** The career overview: summary, experience, education and skills, each edited in place. */
export function ProfileCareer({
  imported,
  importDisabled,
  onEditCareer,
  onDescribe,
}: {
  imported: CareerData;
  importDisabled: boolean;
  /** Opens "Describe in your own words" for one job. */
  onDescribe(entry: number): void;
  /** With `entry`, only that job or education entry is edited, or a new one added. */
  onEditCareer(section: CareerSectionKey, entry?: CareerEntry): void;
}) {
  const experiences = imported.experiences?.value ?? [];
  const educations = imported.educations?.value ?? [];
  const skills = imported.skills?.value ?? [];
  const summary = imported.summary?.value ?? "";
  const source = sourceLine(imported);
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
  return (
    <>
      {source && <p className="profile-source-line">{source}</p>}

      <section className="profile-panel" aria-labelledby="profile-summary-heading">
        <div className="profile-panel-heading">
          <h2 id="profile-summary-heading">Summary</h2>
          {edit("summary", "Edit profile summary")}
        </div>
        {summary ? (
          <p className="profile-body profile-preserve-lines">{summary}</p>
        ) : (
          <p className="profile-empty-line">Describe your background and the work you want to do.</p>
        )}
      </section>

      <section className="profile-panel" aria-labelledby="profile-work-heading">
        <div className="profile-panel-heading">
          <h2 id="profile-work-heading">Experience</h2>
          {add("experiences", "Add work experience")}
        </div>
        {experiences.length ? (
          experiences.map((role, index) => (
            <article className="profile-entry" key={index}>
              <div className="profile-entry-heading">
                <div className="profile-entry-title">
                  <h3>{role.title}</h3>
                  <p>{[role.company, role.client && `for ${role.client}`, role.location].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="profile-entry-dates">{dateRange(role.from, role.to, role.current)}</span>
                {edit("experiences", `Edit ${role.title} at ${role.company} in Profile`, index)}
              </div>
              {role.description && <p className="profile-body profile-preserve-lines">{role.description}</p>}
              {role.bullets.length > 0 && (
                <ul className="profile-bullets">
                  {role.bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
                </ul>
              )}
              {role.techStack?.trim() && (
                <p className="profile-stack"><strong>Tech stack:</strong> {role.techStack}</p>
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
              <div className="profile-entry-heading">
                <div className="profile-entry-title">
                  <h3>{row.institution}</h3>
                  {(row.degree || row.field) && <p>{[row.degree, row.field].filter(Boolean).join(", ")}</p>}
                </div>
                <span className="profile-entry-dates">{dateRange(row.from, row.to)}</span>
                {edit("educations", `Edit ${row.institution} in Profile`, index)}
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
