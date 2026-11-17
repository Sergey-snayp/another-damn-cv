import { useEffect, useRef, useState } from "react";
import { api, type ContactFields } from "../api";
import { onExtensionDetected } from "../extensionBridge";
import { DashboardIcon } from "../jobs/DashboardIcon";
import { defaultsApi, type AutofillDefault } from "./answersApi";
import type { CareerState } from "./careerApi";
import { EEO_QUESTIONS, type EeoKey } from "./equalEmployment";
import { ProfileCareerEditor, type CareerEntry, type CareerSectionKey } from "./ProfileCareerEditor";
import { WorkAuthorizationFields } from "./WorkAuthorizationFields";
import { readStatuses, rowsFor, workComplete, type CountryStatus } from "./workAuthorization";
import "./complete-profile.css";

export const STEPS = ["Personal", "Education", "Work Experience", "Skill", "Equal Employment"] as const;
/** 1 to 5: a step; 6: the end ("Just one last important step"). */
export type Step = 1 | 2 | 3 | 4 | 5 | 6;

const PERSONAL: { key: keyof ContactFields; label: string; required?: boolean; type?: string; wide?: boolean; placeholder?: string }[] = [
  { key: "firstName", label: "First Name", required: true },
  { key: "preferredName", label: "Preferred Name" },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email", required: true, type: "email", wide: true },
  { key: "phone", label: "Phone", required: true, type: "tel", wide: true, placeholder: "+1 672 000 0000" },
  { key: "addressLine", label: "Address Line", required: true, wide: true, placeholder: "Enter your current address" },
  { key: "country", label: "Country/Region", required: true },
  { key: "state", label: "State/Province", required: true },
  { key: "city", label: "City", required: true },
  { key: "postalCode", label: "Postal Code" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/…" },
  { key: "github", label: "GitHub", placeholder: "https://github.com/…" },
];
const GREETING: Record<Step, string> = {
  1: "🎉 Great! Let's get started with your basic info.",
  2: "🎓 Your education, as forms ask for it.",
  3: "💼 Your work experience. Autofill adds each job to forms such as Workday's.",
  4: "🛠 Your skills. Autofill picks the ones a form's list knows.",
  5: "🏁 Last step! This information is only used to help autofill applications and is never shared with anyone.",
  6: "",
};
/** The Chrome Web Store page of the extension, once it is published (VITE_EXTENSION_URL). */
const INSTALL_URL = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_EXTENSION_URL) ?? "";

/**
 * "Complete Profile", as Jobright's: five steps, each filled from the Profile so
 * a person only confirms or fixes it, then the extension to install. Each step
 * is saved when it is left with Next; Finish checks the last step and goes to
 * what is still missing.
 */
export function CompleteProfileDialog({
  start = 1,
  profile,
  career,
  onClose,
  onProfileSaved,
  onCareerSaved,
}: {
  start?: Step;
  profile: ContactFields;
  career: CareerState | null;
  onClose(): void;
  onProfileSaved(profile: ContactFields): void;
  onCareerSaved(state: CareerState): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(start);
  const [draft, setDraft] = useState<ContactFields>({ ...profile });
  const [rows, setRows] = useState<AutofillDefault[] | null>(null);
  const [statuses, setStatuses] = useState<CountryStatus[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ section: CareerSectionKey; entry?: CareerEntry } | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    return onExtensionDetected(setInstalled);
  }, []);
  useEffect(() => {
    let active = true;
    defaultsApi.list().then(
      (list) => { if (active) { setRows(list); setStatuses(readStatuses(list)); } },
      (reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load your work authorization."); },
    );
    return () => { active = false; };
  }, []);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); setShowErrors(false); setError(""); }, [step]);

  const set = (key: keyof ContactFields, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const missingPersonal = PERSONAL.filter((field) => field.required && !String(draft[field.key] ?? "").trim());
  const missingEeo = EEO_QUESTIONS.filter((question) => !String(draft[question.key] ?? "").trim());
  /** The first question still empty on this step: scrolled to, as Jobright does. */
  const showFirstMissing = () => requestAnimationFrame(() => body.current?.querySelector("[data-missing]")?.scrollIntoView({ block: "center", behavior: "smooth" }));

  async function saveProfile(keys: (keyof ContactFields)[]) {
    const changed = Object.fromEntries(keys.filter((key) => (draft[key] ?? "") !== (profile[key] ?? "")).map((key) => [key, String(draft[key] ?? "").trim()]));
    if (Object.keys(changed).length) onProfileSaved(await api.saveProfile(changed));
  }

  async function next() {
    if (saving) return;
    setError("");
    if (step === 1 && missingPersonal.length) { setShowErrors(true); showFirstMissing(); return; }
    if (step === 5 && (!workComplete(statuses) || missingEeo.length)) { setShowErrors(true); showFirstMissing(); return; }
    setSaving(true);
    try {
      if (step === 1) await saveProfile(PERSONAL.map((field) => field.key));
      if (step === 5) {
        const latest = await defaultsApi.list();
        const { save, remove } = rowsFor(statuses, latest);
        if (save.length) await defaultsApi.save(save as Parameters<typeof defaultsApi.save>[0]);
        for (const id of remove) await defaultsApi.remove(id);
        await saveProfile(EEO_QUESTIONS.map((question) => question.key));
        setRows(await defaultsApi.list());
      }
      setStep((step + 1) as Step);
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : "Could not save."} Your answers are still here: try again.`);
    } finally {
      setSaving(false);
    }
  }

  const educations = career?.data.educations?.value ?? [];
  const experiences = career?.data.experiences?.value ?? [];
  const skills = career?.data.skills?.value ?? [];
  const span = (from: string, to: string, current?: boolean) => [from, current ? "Present" : to].filter(Boolean).join(" – ");
  const missingMark = (missing: boolean, text = "Please fill this in") => (showErrors && missing ? <span className="complete-error" role="alert">{text}</span> : null);

  return (
    <dialog ref={dialog} className="complete-profile" aria-labelledby="complete-profile-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button type="button" className="complete-close" aria-label="Close" onClick={onClose}>
        <DashboardIcon name="close" size={20} />
      </button>
      {step <= 5 ? (
        <>
          <h2 id="complete-profile-title" className="visually-hidden">Complete your profile</h2>
          <ol className="complete-steps">
            {STEPS.map((title, index) => {
              const number = (index + 1) as Step;
              return (
                <li key={title} className={number === step ? "is-current" : number < step ? "is-done" : ""}>
                  <button type="button" onClick={() => setStep(number)} aria-current={number === step ? "step" : undefined}>
                    <span className="complete-step-number">{number < step ? "✓" : number}</span>
                    {title}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="complete-body" ref={body}>
            <p className="complete-greeting">{GREETING[step]}</p>
            {step === 1 && (
              <div className="complete-card complete-grid">
                {PERSONAL.map((field) => {
                  const empty = field.required && !String(draft[field.key] ?? "").trim();
                  return (
                    <label key={field.key} className={field.wide ? "is-wide" : ""} data-missing={showErrors && empty ? "" : undefined}>
                      <span>{field.required && <b aria-hidden="true">*</b>}{field.label}</span>
                      <input type={field.type ?? "text"} value={String(draft[field.key] ?? "")} placeholder={field.placeholder ?? field.label} required={field.required} onChange={(event) => set(field.key, event.target.value)} />
                      {missingMark(Boolean(empty))}
                    </label>
                  );
                })}
              </div>
            )}
            {step === 2 && (
              <div className="complete-card">
                {educations.length ? (
                  <ul className="complete-list">
                    {educations.map((school, index) => (
                      <li key={`${school.institution}-${index}`}>
                        <span><b>{school.institution || "School"}</b>{[school.degree, school.field].filter(Boolean).join(", ")}<small>{span(school.from, school.to)}</small></span>
                        <button type="button" className="complete-link" onClick={() => setEditing({ section: "educations", entry: index })}>Edit</button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="complete-empty">No education yet.</p>}
                <button type="button" className="complete-add" disabled={!career} onClick={() => setEditing({ section: "educations", entry: "new" })}>+ Add education</button>
              </div>
            )}
            {step === 3 && (
              <div className="complete-card">
                {experiences.length ? (
                  <ul className="complete-list">
                    {experiences.map((role, index) => (
                      <li key={`${role.company}-${index}`}>
                        <span><b>{role.title || "Role"}</b>{role.company}<small>{span(role.from, role.to, role.current)}</small></span>
                        <button type="button" className="complete-link" onClick={() => setEditing({ section: "experiences", entry: index })}>Edit</button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="complete-empty">No work experience yet.</p>}
                <button type="button" className="complete-add" disabled={!career} onClick={() => setEditing({ section: "experiences", entry: "new" })}>+ Add work experience</button>
              </div>
            )}
            {step === 4 && (
              <div className="complete-card">
                {skills.length ? <ul className="complete-chips">{skills.map((skill) => <li key={skill}>{skill}</li>)}</ul> : <p className="complete-empty">No skills yet.</p>}
                <button type="button" className="complete-add" disabled={!career} onClick={() => setEditing({ section: "skills" })}>{skills.length ? "Edit skills" : "+ Add skills"}</button>
              </div>
            )}
            {step === 5 && (
              <>
                <div className="complete-card">
                  {rows === null ? <p className="complete-empty">Loading…</p> : <WorkAuthorizationFields statuses={statuses} onChange={setStatuses} showErrors={showErrors} />}
                </div>
                {EEO_QUESTIONS.map((question) => {
                  const empty = !String(draft[question.key] ?? "").trim();
                  return (
                    <label key={question.key} className="complete-card complete-question" data-missing={showErrors && empty ? "" : undefined}>
                      <span><b aria-hidden="true">*</b>{question.label}</span>
                      <select value={String(draft[question.key as EeoKey] ?? "")} onChange={(event) => set(question.key, event.target.value)}>
                        <option value="">Select</option>
                        {[...new Set([...question.choices, String(draft[question.key] ?? "")].filter(Boolean))].map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                      </select>
                      {missingMark(empty, "Please choose an answer")}
                    </label>
                  );
                })}
              </>
            )}
            {error && <p className="complete-error complete-save-error" role="alert">{error}</p>}
          </div>
          <footer className="complete-footer">
            {step > 1 && <button type="button" className="complete-back" onClick={() => setStep((step - 1) as Step)}>Back</button>}
            <button type="button" className="complete-next" disabled={saving || (step === 5 && rows === null)} onClick={() => void next()}>
              {saving ? "Saving…" : step === 5 ? "Finish" : "Next"}
            </button>
          </footer>
        </>
      ) : (
        <div className="complete-done">
          <div className="complete-done-mark" aria-hidden="true">👏</div>
          {installed ? (
            <>
              <h2 id="complete-profile-title">You're all set!</h2>
              <p>Your profile is ready. Open a job application and press <b>Autofill</b> in the extension.</p>
              <footer className="complete-footer"><button type="button" className="complete-next" onClick={onClose}>Done</button></footer>
            </>
          ) : (
            <>
              <h2 id="complete-profile-title">Just One Last Important Step!</h2>
              <p>All your info is ready to go! <b>Install the Another Damn CV Chrome extension</b> to autofill your job applications with one click.</p>
              <div className="complete-howto">
                <figure><div className="complete-howto-art" aria-hidden="true">🧩</div><figcaption>Step 1: Install the extension</figcaption></figure>
                <figure><div className="complete-howto-art complete-howto-job" aria-hidden="true"><span>Software Engineer</span><b>Autofill This Page</b></div><figcaption>Step 2: Open a job application</figcaption></figure>
              </div>
              <footer className="complete-footer">
                {INSTALL_URL ? (
                  <a className="complete-next" href={INSTALL_URL} target="_blank" rel="noreferrer noopener">Click to Install Extension</a>
                ) : (
                  <button type="button" className="complete-next" onClick={onClose}>Done</button>
                )}
              </footer>
            </>
          )}
        </div>
      )}
      {editing && career && (
        <ProfileCareerEditor
          section={editing.section}
          entry={editing.entry}
          career={career}
          onClose={() => setEditing(null)}
          onSaved={(state) => { onCareerSaved(state); setEditing(null); }}
        />
      )}
    </dialog>
  );
}

/** What the "Complete your profile" card counts as still missing. */
export function profileGaps(profile: ContactFields | null, career: CareerState | null, statuses: CountryStatus[] | null): { label: string; step: Step }[] {
  if (!profile) return [];
  const empty = (key: keyof ContactFields) => !String(profile[key] ?? "").trim();
  return [
    { label: "Personal details", step: 1 as Step, done: !PERSONAL.some((field) => field.required && empty(field.key)) },
    { label: "Education", step: 2 as Step, done: (career?.data.educations?.value ?? []).length > 0 },
    { label: "Work experience", step: 3 as Step, done: (career?.data.experiences?.value ?? []).length > 0 },
    { label: "Skills", step: 4 as Step, done: (career?.data.skills?.value ?? []).length > 0 },
    { label: "Work authorization", step: 5 as Step, done: statuses !== null && workComplete(statuses) },
    { label: "Equal employment", step: 5 as Step, done: !EEO_QUESTIONS.some((question) => empty(question.key)) },
  ].filter((gap) => !gap.done).map(({ label, step }) => ({ label, step }));
}
