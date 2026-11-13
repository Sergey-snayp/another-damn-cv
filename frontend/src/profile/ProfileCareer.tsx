import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import type { CareerData, CareerExperience, CollectedJob } from "./careerApi";
import { AchievementList } from "./AchievementList";
import { InlineEdit, InlineText } from "./InlineEdit";
import { TagList, splitTags } from "./TagList";
import { JobFacts } from "./JobFacts";
import { DescriptionAi } from "./DescriptionAi";
import { SummaryEditor } from "./SummaryEditor";
import { Marked } from "../text/Marked";
import { withoutMarks } from "../text/marks";
import { useSetActiveBullet } from "./bulletFocus";
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
  collected,
}: {
  imported: CareerData;
  importDisabled: boolean;
  /** "✦ Write it for me": bullets written from what was typed in a job's bullet box. */
  onWrite(entry: number, text: string): void;
  /** Saves the professional summary on the latest Profile. */
  onSaveSummary(text: string): Promise<void>;
  /** Opens "From my CVs": for every job, or for one job by its place in the list. */
  onCollect?(job?: number): void;
  /** What the saved CVs have that the Profile doesn't; null while unknown. */
  collected?: CollectedJob[] | null;
  /** Deletes one job or education entry, after asking. */
  onDelete?(section: "experiences" | "educations", entry: number): void;
  /** Saves one job's fields (achievements, description, technologies) on the latest Profile. */
  onSaveRole(entry: number, patch: (current: CareerExperience) => Partial<CareerExperience>): Promise<void>;
  /** Saves the Profile's skills list. */
  onSaveSkills(skills: string[]): Promise<void>;
  /** With `entry`, only that job or education entry is edited, or a new one added. */
  onEditCareer(section: CareerSectionKey, entry?: CareerEntry): void;
}) {
  // A job's description being written goes to the check panel beside the Profile.
  const setActive = useSetActiveBullet();
  const experiences = imported.experiences?.value ?? [];
  const educations = imported.educations?.value ?? [];
  const skills = imported.skills?.value ?? [];
  const summary = imported.summary?.value ?? "";
  // Every technology and skill on the Profile: what a summary's "Keywords" looks for.
  // Only the jobs' technologies: what a job description should leave out.
  const technologies = [...new Set(experiences.flatMap((role) => (role.techStack ?? "").split(/[,|;\n]/)).map((item) => item.trim()).filter(Boolean))];
  const keywords = [
    ...new Set(
      [...experiences.flatMap((role) => (role.techStack ?? "").split(/[,|;\n]/)), ...skills].map((item) => item.trim()).filter(Boolean),
    ),
  ];
  // "From my CVs": the button says what is waiting, and hides when nothing is.
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const totals = (collected ?? []).reduce(
    (sum, item) => ({
      bullets: sum.bullets + item.bullets.length,
      similar: sum.similar + item.similar.length,
      tools: sum.tools + item.tools.length,
      jobs: sum.jobs + (item.job ? 1 : 0),
    }),
    { bullets: 0, similar: 0, tools: 0, jobs: 0 },
  );
  const waiting = [
    totals.jobs && plural(totals.jobs, "new job"),
    totals.bullets && plural(totals.bullets, "new bullet"),
    totals.similar && plural(totals.similar, "similar bullet"),
    !totals.jobs && !totals.bullets && !totals.similar && totals.tools && plural(totals.tools, "new tool"),
  ].filter(Boolean) as string[];
  /** What the CVs add to one Profile job, as the link under its bullets says it. */
  const forJob = (index: number) => {
    const item = collected?.find((entry) => entry.index === index);
    if (!item) return "";
    if (item.bullets.length) return `${plural(item.bullets.length, "more bullet")} from your CVs`;
    if (item.similar.length) return `${plural(item.similar.length, "similar bullet")} in your CVs`;
    if (item.tools.length) return `${plural(item.tools.length, "new tool")} from your CVs`;
    return "";
  };
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
            {onCollect && waiting.length > 0 && (
              <button
                type="button"
                className="collect-cta"
                disabled={importDisabled}
                title="Review what your saved CVs have that this Profile doesn't, and add what you want"
                onClick={() => onCollect()}
              >
                <Icon name="download" size={16} />
                {waiting.join(" · ")} in your CVs
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
                  ai={({ text, onUse, onClose }) => <DescriptionAi role={role} text={text} onUse={onUse} onClose={onClose} />}
                  onDraft={(text) =>
                    setActive(
                      text === null
                        ? null
                        : { kind: "description", text: withoutMarks(text), keywords: technologies, job: [role.title, role.company].filter(Boolean).join(" · "), title: role.title, company: role.company, client: role.client },
                    )
                  }
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
                {onCollect && forJob(index) && (
                  <button type="button" className="collect-job-link" disabled={importDisabled} onClick={() => onCollect(index)}>
                    {forJob(index)} <Icon name="arrow" size={14} />
                  </button>
                )}
                <div className="profile-tags" role="group" aria-label={`Technologies at ${role.company}`}>
                  <p className="profile-tags-label">Technologies</p>
                  <TagList
                    label="technology"
                    items={splitTags(role.techStack ?? "")}
                    suggestions={keywords}
                    addLabel="Add technology"
                    disabled={importDisabled}
                    onChange={(items) => onSaveRole(index, () => ({ techStack: items.join(", ") }))}
                  />
                </div>
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
        {/* After the last entry, as for jobs. */}
        <button type="button" className="profile-add-entry" aria-label="Add education" onClick={() => onEditCareer("educations", "new")} disabled={importDisabled}>
          <span className="profile-add-entry-icon" aria-hidden="true"><Icon name="plus" size={20} /></span>
          Add education
        </button>
      </section>

      <section className="profile-panel" aria-labelledby="profile-skills-heading">
        <div className="profile-panel-heading">
          <h2 id="profile-skills-heading">Skills</h2>
        </div>
        <TagList label="skill" items={skills} suggestions={keywords} addLabel="Add skill" disabled={importDisabled} onChange={onSaveSkills} />
      </section>
    </>
  );
}
