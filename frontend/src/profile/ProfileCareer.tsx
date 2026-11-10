import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import type { CareerData, CareerExperience } from "./careerApi";
import { AchievementList, type RolePatch } from "./AchievementList";
import type { CareerEntry, CareerSectionKey } from "./ProfileCareerEditor";

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
  onWrite,
  onCollect,
  onDelete,
  onSaveRole,
}: {
  imported: CareerData;
  importDisabled: boolean;
  /** "✦ Write it for me": bullets written from what was typed in a job's bullet box. */
  onWrite(entry: number, text: string): void;
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
              <span className="profile-entry-icon" aria-hidden="true"><Icon name="briefcase" size={19} /></span>
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
                <AchievementList
                  role={role}
                  disabled={importDisabled}
                  onSave={(patch) => onSaveRole(index, patch)}
                  onWrite={(text) => onWrite(index, text)}
                />
                {role.techStack?.trim() && (
                  <p className="profile-stack">Technologies: {role.techStack}</p>
                )}
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
              <span className="profile-entry-icon is-education" aria-hidden="true"><Icon name="education" size={19} /></span>
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
