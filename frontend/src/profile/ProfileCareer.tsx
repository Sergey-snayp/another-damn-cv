import { Link } from "react-router-dom";
import type { ContactFields } from "../api";
import {
  DashboardIcon as Icon,
  type DashboardIconName,
} from "../jobs/DashboardIcon";
import type { usePrimaryResume } from "./usePrimaryResume";

type Career = ReturnType<typeof usePrimaryResume>;

export function ProfileCareer({
  career,
  profile,
  onEditPersonal,
}: {
  career: Career;
  profile: ContactFields;
  onEditPersonal(): void;
}) {
  const { primary, document, loading, error, retry } = career;
  const editHref = primary ? `/documents/${primary.id}` : "/documents";
  return (
    <>
      <section className="profile-panel profile-autofill">
        <h2>
          Your profile is used directly to autofill your job applications!
        </h2>
        <div className="profile-promos">
          <div className="profile-promo">
            <div className="profile-promo-heading">
              <Icon name="bolt" />
              <h3>Show Profile to Recruiters</h3>
              <button
                className="profile-switch"
                role="switch"
                aria-label="Show profile to recruiters (coming soon)"
                aria-checked={false}
                disabled
              >
                <span />
              </button>
            </div>
            <span className="profile-tag">Coming soon</span>
            <p>
              <Icon name="search" size={17} />
              Get discovered by companies.
            </p>
            <p>
              <Icon name="eyeOff" size={17} />
              Visibility controls will be added later.
            </p>
          </div>
          <div className="profile-promo">
            <div className="profile-promo-heading">
              <Icon name="user" />
              <h3>Update my connections!</h3>
            </div>
            <p>
              Build your network for referrals and introductions for your job
              applications.
            </p>
            <button className="profile-button" disabled>
              Manage network · Coming soon
            </button>
          </div>
        </div>
      </section>

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
          <EditLink
            to={editHref}
            label="Add work experience in your CV"
            icon="plus"
          />
        </div>
        <p className="profile-source-note">
          From your primary CV. Open the CV to update this experience.
        </p>
        {document?.experiences.length ? (
          document.experiences.map((role, index) => (
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
                  <EditLink
                    to={editHref}
                    label={`Edit ${role.title} at ${role.company} in CV`}
                  />
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
            {loading
              ? "Loading experience…"
              : error
                ? "Experience is unavailable until the CV loads."
                : "No work experience added to your primary CV yet."}
          </p>
        )}
      </section>

      <section className="profile-panel">
        <div className="profile-panel-heading">
          <h2>Education</h2>
          <EditLink
            to={editHref}
            label="Add education in your CV"
            icon="plus"
          />
        </div>
        {document?.educations.length ? (
          document.educations.map((row, index) => (
            <article
              className="profile-career-entry"
              key={row.lineageId ?? index}
            >
              <span className="profile-feature-icon">
                <Icon name="education" size={29} />
              </span>
              <div className="profile-career-text">
                <div className="profile-career-heading">
                  <h3>{row.institution}</h3>
                  <EditLink
                    to={editHref}
                    label={`Edit ${row.institution} in CV`}
                  />
                </div>
                <div className="profile-tags">
                  <span>
                    {[row.degree, row.field].filter(Boolean).join(", ")}
                  </span>
                  <span>
                    {row.from} – {row.to || "Present"}
                  </span>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="profile-muted">
            {loading
              ? "Loading education…"
              : "No education added to your primary CV yet."}
          </p>
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
          <EditLink to={editHref} label="Edit skills in your CV" />
        </div>
        <p className="profile-source-note">Skills from your primary CV.</p>
        <div className="profile-skills">
          {document?.skills.length ? (
            document.skills.map((skill, index) => (
              <span key={skill.lineageId ?? index}>
                <Icon name="heart" size={16} />
                {skill.name}
              </span>
            ))
          ) : (
            <p className="profile-muted">
              {loading
                ? "Loading skills…"
                : "No skills added to your primary CV yet."}
            </p>
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
    </>
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
