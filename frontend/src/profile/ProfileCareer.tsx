import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import type { CareerData, CareerExperience } from "./careerApi";
import { AchievementList } from "./AchievementList";
import { InlineEdit, InlineText } from "./InlineEdit";
import { JobFacts } from "./JobFacts";
import { SummaryEditor } from "./SummaryEditor";
import { Marked } from "../text/Marked";
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

/** The career overview: summary, experience, education and skills, each edited in place. */
export function ProfileCareer({
  imported,
  importDisabled,
  onEditCareer,
  onWrite,
  onCollect,
  onDelete,
  onSaveRole,
  onSaveSummary,
  onSaveSkills,
}: {
  imported: CareerData;
  importDisabled: boolean;
  /** "✦ Write it for me": bullets written from what was typed in a job's bullet box. */
  onWrite(entry: number, text: string): void;
  /** Saves the professional summary on the latest Profile. */
  onSaveSummary(text: string): Promise<void>;
  /** Opens "Collect from my CVs". */
  onCollect?(): void;
  /** Deletes one job or education entry, after asking. */
  onDelete?(section: "experiences" | "educations", entry: number): void;
  /** Saves one job's fields (achievements, description, technologies) on the latest Profile. */
  onSaveRole(entry: number, patch: (current: CareerExperience) => Partial<CareerExperience>): Promise<void>;
  /** Saves the Profile's skills list. */
  onSaveSkills(skills: string[]): Promise<void>;
  /** With `entry`, only that job or education entry is edited, or a new one added. */
  onEditCareer(section: CareerSectionKey, entry?: CareerEntry): void;
}) {
  const experiences = imported.experiences?.value ?? [];
  const educations = imported.educations?.value ?? [];
  const skills = imported.skills?.value ?? [];
  const summary = imported.summary?.value ?? "";
  // Every technology and skill on the Profile: what a summary's "Keywords" looks for.
  const keywords = [
    ...new Set(
      [...experiences.flatMap((role) => (role.techStack ?? "").split(/[,|;\n]/)), ...skills].map((item) => item.trim()).filter(Boolean),
    ),
  ];
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
      <SummaryEditor summary={summary} keywords={keywords} disabled={importDisabled} onSave={onSaveSummary} />

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
          </div>
        </div>
        {experiences.length ? (
          experiences.map((role, index) => (
            <article className="profile-entry" key={index}>
              <span className="profile-entry-icon" aria-hidden="true"><Icon name="briefcase" size={19} /></span>
              <div className="profile-entry-main">
                <div className="profile-entry-heading">
                  <div className="profile-entry-title">
                    <InlineText as="h3" label="job title" value={role.title} disabled={importDisabled} onSave={(title) => onSaveRole(index, () => ({ title }))} />
                    <InlineText label="company" value={role.company} disabled={importDisabled} onSave={(company) => onSaveRole(index, () => ({ company }))} />
                  </div>
                  <div className="profile-entry-tools">
                    {remove("experiences", `Delete ${role.title} at ${role.company}`, index)}
                  </div>
                </div>
                <JobFacts role={role} disabled={importDisabled} onSave={(patch) => onSaveRole(index, () => patch)} />
                <InlineEdit
                  label="description"
                  value={role.description ?? ""}
                  multiline
                  rich
                  placeholder="What the company or project does, and your part in it."
                  disabled={importDisabled}
                  empty={<p className="inline-edit-empty">+ Add description</p>}
                  deleteTitle="Are you sure you want to delete this description?"
                  deleteBody={<p>It will be removed from {role.title} at {role.company} in your Profile. Your saved CVs keep their own copy.</p>}
                  onSave={(text) => onSaveRole(index, () => ({ description: text }))}
                >
                  <div className="profile-body">
                    <Marked text={role.description} />
                  </div>
                </InlineEdit>
                <AchievementList
                  role={role}
                  disabled={importDisabled}
                  onSave={(patch) => onSaveRole(index, patch)}
                  onWrite={(text) => onWrite(index, text)}
                />
                <InlineEdit
                  label="technologies"
                  value={role.techStack ?? ""}
                  placeholder="Node.js, TypeScript, PostgreSQL, AWS"
                  disabled={importDisabled}
                  empty={<p className="inline-edit-empty">+ Add technologies</p>}
                  deleteTitle="Are you sure you want to delete these technologies?"
                  deleteBody={<p>The technologies line will be removed from {role.title} at {role.company} in your Profile. Your saved CVs keep their own copy.</p>}
                  onSave={(text) => onSaveRole(index, () => ({ techStack: text }))}
                >
                  <p className="profile-stack">Technologies: {role.techStack}</p>
                </InlineEdit>
              </div>
            </article>
          ))
        ) : (
          <p className="profile-empty-line">No work experience saved in Profile yet. Import a CV or add your roles.</p>
        )}
        {/* After the last job, where the next one goes. */}
        <button type="button" className="profile-add-entry" aria-label="Add work experience" onClick={() => onEditCareer("experiences", "new")} disabled={importDisabled}>
          <span className="profile-add-entry-icon" aria-hidden="true"><Icon name="plus" size={20} /></span>
          Add work experience
        </button>
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
        <InlineEdit
          label="skills"
          value={skills.join(", ")}
          multiline
          placeholder="Comma-separated: TypeScript, Node.js, PostgreSQL"
          disabled={importDisabled}
          empty={<p className="profile-empty-line">No skills saved in Profile yet.</p>}
          deleteTitle="Are you sure you want to delete all your skills?"
          deleteBody={<p>Every skill will be removed from your Profile. Your saved CVs keep their own copy.</p>}
          onSave={(text) => onSaveSkills([...new Set(text.split(/[,;\n]/).map((skill) => skill.trim()).filter(Boolean))])}
        >
          <ul className="profile-chips">
            {skills.map((skill, index) => <li key={index}>{skill}</li>)}
          </ul>
        </InlineEdit>
      </section>
    </>
  );
}
