import { useState } from "react";
import { SavedAnswers } from "./SavedAnswers";
import { DefaultAnswers } from "./DefaultAnswers";
import { WorkPreferences } from "./WorkPreferences";
import { Link } from "react-router-dom";
import type { ContactFields } from "../api";
import {
  DashboardIcon as Icon,
  type DashboardIconName,
} from "../jobs/DashboardIcon";
import type { usePrimaryResume } from "./usePrimaryResume";
import type { CareerData, CareerSection } from "./careerApi";
import type { Experience } from "../resumeApi";
import type { CareerSectionKey } from "./ProfileCareerEditor";

type Career = ReturnType<typeof usePrimaryResume>;

export function ProfileCareer({
  career,
  profile,
  onEditPersonal,
  imported,
  onImportCv,
  importDisabled,
  onEditCareer,
}: {
  career: Career;
  profile: ContactFields;
  onEditPersonal(): void;
  imported: CareerData;
  /** Opens the import review for one saved CV. */
  onImportCv(resumeId: string): void;
  importDisabled: boolean;
  onEditCareer(section: CareerSectionKey): void;
}) {
  const { primary, resumes, loading, error, retry } = career;
  const [showAll, setShowAll] = useState(false);
  const editHref = primary ? `/documents/${primary.id}` : "/documents";
  const experiences: Experience[] = imported.experiences
    ? imported.experiences.value.map((role) => ({
        ...role,
        blurb: role.description,
        achievements: role.bullets.map((bullet) => ({
          bullet,
          experienceLineageId: "",
        })),
      }))
    : [];
  const educations = imported.educations?.value ?? [];
  const skills = imported.skills
    ? imported.skills.value.map((name) => ({ name }))
    : [];
  const summary = imported.summary?.value ?? "";
  const careerEdit = (section: CareerSectionKey, label: string) => (
    <button
      className="profile-edit-button"
      aria-label={label}
      onClick={() => onEditCareer(section)}
      disabled={importDisabled}
    >
      <Icon name="edit" />
    </button>
  );
  return (
    <>
      <section
        className="profile-panel"
        aria-labelledby="profile-resume-heading"
      >
        <div className="profile-panel-heading">
          <h2 id="profile-resume-heading">Resume</h2>
          <EditLink to={editHref} label="Manage resume" />
        </div>
        {loading ? (
          <p role="status">Loading your primary CV…</p>
        ) : error ? (
          <>
            <p className="profile-error" role="alert">
              {error}
            </p>
            <button className="profile-button is-secondary" onClick={retry}>
              Retry CV
            </button>
          </>
        ) : primary ? (
          <div className="profile-document-row">
            <span className="profile-feature-icon">
              <Icon name="file" size={28} />
            </span>
            <div>
              <h3>
                {primary.name} <span className="profile-tag">Default</span>
              </h3>
              <p>
                {primary.currentSnapshotId
                  ? `Last updated: ${new Date(primary.updatedAt).toLocaleString()}`
                  : "No saved version yet"}
              </p>
            </div>
            <Link className="profile-button" to={editHref}>
              Preview Resume
            </Link>
          </div>
        ) : (
          <div className="profile-empty">
            <p>No primary resume selected.</p>
            <Link className="profile-button" to="/documents">
              Choose a resume
            </Link>
          </div>
        )}
        {!loading && !error && resumes.length > 0 && (
          <div className="profile-cv-change">
            <button
              type="button"
              className="profile-button is-secondary"
              aria-expanded={showAll}
              aria-controls="profile-cv-list"
              onClick={() => setShowAll((open) => !open)}
            >
              {showAll
                ? "Hide CVs"
                : `Change · ${resumes.length} CV${resumes.length === 1 ? "" : "s"}`}
            </button>
            {showAll && (
              <ul className="profile-cv-list" id="profile-cv-list">
                {resumes.map((cv) => (
                  <li key={cv.id}>
                    <div>
                      <h3 title={cv.name}>
                        {cv.name}
                        {cv.isPrimary && (
                          <span className="profile-tag">Default</span>
                        )}
                        {cv.jobId && (
                          <span className="profile-tag">Tailored</span>
                        )}
                      </h3>
                      <p>
                        {cv.currentSnapshotId
                          ? `Last updated: ${new Date(cv.updatedAt).toLocaleString()}`
                          : "No saved version yet"}
                      </p>
                    </div>
                    <Link
                      className="profile-button is-secondary"
                      to={`/documents/${cv.id}`}
                    >
                      Preview
                    </Link>
                    <button
                      type="button"
                      className="profile-button"
                      disabled={importDisabled || !cv.currentSnapshotId}
                      title={
                        !cv.currentSnapshotId
                          ? "Save this CV once before importing it."
                          : importDisabled
                            ? "Save or discard your profile changes first."
                            : "Review this CV's information and choose what to save to your Profile."
                      }
                      onClick={() => onImportCv(cv.id)}
                    >
                      Import to Profile
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="profile-panel">
        <div className="profile-panel-heading">
          <h2>Professional summary</h2>
          {careerEdit("summary", "Edit profile summary")}
        </div>
        <SourceNote
          section={imported.summary}
          fallback="Add your professional summary to Profile."
        />
        <p className="profile-preserve-lines">
          {summary || "Describe your background and the work you want to do."}
        </p>
      </section>

      <section className="profile-panel profile-document-options">
        <div>
          <div className="profile-panel-heading">
            <h2>Cover Letter</h2>
            <PreviewEdit label="Edit cover letters (coming soon)" />
          </div>
          <div className="profile-document-row">
            <span className="profile-feature-icon">
              <Icon name="offer" size={28} />
            </span>
            <p>Cover letters are coming soon.</p>
            <button className="profile-button" disabled>
              Create Cover Letter
            </button>
          </div>
        </div>
        <div>
          <div className="profile-panel-heading">
            <h2>Templates</h2>
            <PreviewEdit label="Edit templates (coming soon)" />
          </div>
          <div className="profile-document-row">
            <span className="profile-feature-icon">
              <Icon name="file" size={28} />
            </span>
            <p>Application answer templates are coming soon.</p>
            <button className="profile-button" disabled>
              Create Template
            </button>
          </div>
        </div>
      </section>

      <section className="profile-panel" aria-labelledby="profile-work-heading">
        <div className="profile-panel-heading">
          <h2 id="profile-work-heading">Work Experience</h2>
          {careerEdit("experiences", "Edit profile work experience")}
        </div>
        <SourceNote
          section={imported.experiences}
          fallback="Add your full experience, responsibilities and achievements, or import them from a CV."
        />
        {experiences.length ? (
          experiences.map((role, index) => (
            <article
              className="profile-career-entry"
              key={role.lineageId ?? index}
            >
              <span className="profile-feature-icon">
                <Icon name="briefcase" size={28} />
              </span>
              <div className="profile-career-text">
                <div className="profile-career-heading">
                  <div>
                    <h3>{role.title}</h3>
                    <p className="profile-company">{role.company}</p>
                  </div>
                  {careerEdit(
                    "experiences",
                    `Edit ${role.title} at ${role.company} in Profile`,
                  )}
                </div>
                <div className="profile-tags">
                  {role.location && <span>{role.location}</span>}
                  <span>
                    {role.from} –{" "}
                    {role.current ? "Present" : role.to || "Not specified"}
                  </span>
                  {role.client && <span>{role.client}</span>}
                </div>
                {role.blurb && (
                  <p className="profile-preserve-lines">{role.blurb}</p>
                )}
                <ul>
                  {role.achievements.map((item, i) => (
                    <li key={item.lineageId ?? i}>{item.bullet}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))
        ) : (
          <p className="profile-muted">
            No work experience saved in Profile yet.
          </p>
        )}
      </section>

      <section className="profile-panel">
        <div className="profile-panel-heading">
          <h2>Education</h2>
          {careerEdit("educations", "Edit profile education")}
        </div>
        <SourceNote
          section={imported.educations}
          fallback="Add education, courses or training to Profile. A degree is optional."
        />
        {educations.length ? (
          educations.map((row, index) => (
            <article className="profile-career-entry" key={index}>
              <span className="profile-feature-icon">
                <Icon name="education" size={29} />
              </span>
              <div className="profile-career-text">
                <div className="profile-career-heading">
                  <h3>{row.institution}</h3>
                  {careerEdit(
                    "educations",
                    `Edit ${row.institution} in Profile`,
                  )}
                </div>
                <div className="profile-tags">
                  <span>
                    {[row.degree, row.field].filter(Boolean).join(", ")}
                  </span>
                  <span>
                    {[row.from, row.to].filter(Boolean).join(" – ") ||
                      "Dates not provided"}
                  </span>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="profile-muted">No education saved in Profile yet.</p>
        )}
      </section>

      <section className="profile-panel">
        <div className="profile-panel-heading">
          <h2>Projects &amp; Outside Experience</h2>
          <PreviewEdit label="Add projects (coming soon)" icon="plus" />
        </div>
        <p className="profile-muted">No projects added</p>
        <span className="profile-tag">Coming soon</span>
      </section>

      <section className="profile-panel">
        <div className="profile-panel-heading">
          <h2>Portfolio &amp; Links</h2>
          <button
            className="profile-edit-button"
            aria-label="Edit portfolio and links"
            onClick={onEditPersonal}
          >
            <Icon name="edit" />
          </button>
        </div>
        <div className="profile-links-grid">
          {[
            { label: "LinkedIn URL", value: profile.linkedin, icon: "user" },
            { label: "GitHub URL", value: profile.github, icon: "code" },
            {
              label: "Portfolio URL",
              value: profile.portfolio,
              icon: "laptop",
            },
            { label: "Other URL", value: profile.website, icon: "link" },
            { label: "Telegram", value: profile.telegram, icon: "link" },
          ].map((item) => (
            <div className="profile-link-row" key={item.label}>
              <span className="profile-feature-icon">
                <Icon name={item.icon as DashboardIconName} size={26} />
              </span>
              <div>
                <h3>{item.label}</h3>
                {webUrl(item.value) ? (
                  <a
                    href={webUrl(item.value)!}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {item.value}
                  </a>
                ) : (
                  <span>{item.value || "—"}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="profile-panel">
        <div className="profile-panel-heading">
          <h2>Skills</h2>
          {careerEdit("skills", "Edit profile skills")}
        </div>
        <SourceNote
          section={imported.skills}
          fallback="Add the skills you want to include in your Profile."
        />
        <div className="profile-skills">
          {skills.length ? (
            skills.map((skill, index) => (
              <span key={index}>
                <Icon name="heart" size={16} />
                {skill.name}
              </span>
            ))
          ) : (
            <p className="profile-muted">No skills saved in Profile yet.</p>
          )}
        </div>
      </section>

      <section className="profile-panel">
        <div className="profile-panel-heading">
          <h2>Languages</h2>
          <PreviewEdit label="Edit languages (coming soon)" />
        </div>
        <p className="profile-muted">No items added</p>
        <span className="profile-tag">Coming soon</span>
      </section>

      <WorkPreferences />
      <SavedAnswers />
      <DefaultAnswers />
    </>
  );
}

function SourceNote({
  section,
  fallback,
}: {
  section?: CareerSection<unknown>;
  fallback: string;
}) {
  return (
    <p className="profile-source-note">
      {section
        ? section.source.kind === "profile"
          ? `Saved in Profile · updated on ${new Date(section.importedAt).toLocaleDateString()}.`
          : `Saved in Profile · imported from ${section.source.kind === "file" ? section.source.name : `CV version ${section.source.snapshot}`} on ${new Date(section.importedAt).toLocaleDateString()}. Later CV edits do not change this section.`
        : fallback}
    </p>
  );
}

function EditLink({
  to,
  label,
  icon = "edit",
}: {
  to: string;
  label: string;
  icon?: DashboardIconName;
}) {
  return (
    <Link className="profile-edit-button" to={to} aria-label={label}>
      <Icon name={icon} />
    </Link>
  );
}

function PreviewEdit({
  label,
  icon = "edit",
}: {
  label: string;
  icon?: DashboardIconName;
}) {
  return (
    <button className="profile-edit-button" aria-label={label} disabled>
      <Icon name={icon} />
    </button>
  );
}

function webUrl(value: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value.trim())
        ? value.trim()
        : `https://${value.trim()}`,
    );
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
