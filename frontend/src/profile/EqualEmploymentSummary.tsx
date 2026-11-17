import type { ContactFields } from "../api";
import { DashboardIcon } from "../jobs/DashboardIcon";
import { EEO_QUESTIONS, eeoDisplay } from "./equalEmployment";
import { countryOf, summaryOf, type CountryStatus } from "./workAuthorization";
import "./complete-profile.css";

/**
 * The last step's answers on the Profile, as Jobright shows them: each question
 * and its answer. One not answered says so, in the warning colour, and Edit
 * opens that step of "Complete Profile".
 */
export function EqualEmploymentSummary({ profile, statuses, onEdit }: { profile: ContactFields; statuses: CountryStatus[] | null; onEdit(): void }) {
  const rows: { key: string; question: string; answer: string }[] = [];
  if (statuses) {
    rows.push({ key: "countries", question: "Countries where you want to work", answer: statuses.map((status) => countryOf(status.country).name).join(", ") });
    for (const status of statuses) for (const [index, line] of summaryOf(status).entries()) rows.push({ key: `${status.country}-${index}`, ...line });
  }
  for (const question of EEO_QUESTIONS) rows.push({ key: question.key, question: question.label, answer: eeoDisplay(question.key, profile[question.key]) });
  return (
    <section className="profile-panel equal-employment" aria-labelledby="equal-employment-title">
      <div className="profile-panel-heading">
        <h2 id="equal-employment-title">Equal Employment</h2>
        <button type="button" className="profile-button is-secondary" aria-label="Edit equal employment" onClick={onEdit}>
          <DashboardIcon name="edit" size={15} />
          Edit
        </button>
      </div>
      <p className="profile-muted">Work authorization and the diversity questions forms ask. Only used to autofill applications.</p>
      {statuses === null ? (
        <p className="profile-muted">Loading…</p>
      ) : (
        <dl className="equal-employment-list">
          {rows.map((row) => (
            <div key={row.key} className={row.answer ? "" : "is-missing"}>
              <dt>{row.question}</dt>
              <dd>{row.answer || "Not answered yet"}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
