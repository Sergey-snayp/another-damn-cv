import { useEffect, useRef, useState } from "react";
import { careerApi, type CareerExperience, type CareerState, type CollectedJob } from "./careerApi";
import "./profile-import.css";
import "./profile-career-editor.css";
import { DashboardIcon } from "../jobs/DashboardIcon";

/** "Node.js, TypeScript" + ["Kafka"], in the list's own separator. */
const withTools = (stack: string, tools: string[]) =>
  tools.length ? [stack.trim(), ...tools].filter(Boolean).join(stack.includes("|") ? " | " : ", ") : stack;

/** For a CV line like one of yours: keep yours, use the CV's instead, or keep both. */
type Choice = "mine" | "theirs" | "both";
const CHOICES: { value: Choice; label: string }[] = [
  { value: "mine", label: "Keep mine" },
  { value: "theirs", label: "Use this one" },
  { value: "both", label: "Keep both" },
];

/**
 * From my CVs: the achievements, tools and jobs your saved CVs show that the
 * Profile does not have yet, for every job or for one (`only`). New lines start
 * ticked; a line like one you have is shown next to yours, and stays yours
 * unless you choose otherwise. Nothing is saved until "Add".
 */
export function CollectFromCvs({
  only,
  onClose,
  onSaved,
}: {
  /** One Profile job, by its place in the list: only what the CVs add to it. */
  only?: number;
  onClose(): void;
  onSaved(state: CareerState, added: number): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [jobs, setJobs] = useState<CollectedJob[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    careerApi.collectFromCvs().then(
      (result) => setJobs(result.jobs),
      (reason) => setError(reason instanceof Error ? reason.message : "Could not read your CVs."),
    );
    return () => element?.close();
  }, []);

  const keyOf = (job: number, kind: "b" | "t" | "j" | "s", at = 0) => `${job}:${kind}:${at}`;
  const toggle = (key: string) =>
    setSkip((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const choiceOf = (key: string): Choice => choices[key] ?? "mine";
  // Each job keeps its place in the full list, so its choices keep their keys.
  const listed = (jobs ?? []).map((job, j) => ({ job, j })).filter(({ job }) => only === undefined || job.index === only);
  const chosen = listed.map(({ job, j }) => ({
    job,
    include: !job.job || !skip.has(keyOf(j, "j")),
    bullets: job.bullets.filter((_, i) => !skip.has(keyOf(j, "b", i))),
    similar: job.similar.map((item, i) => ({ ...item, choice: choiceOf(keyOf(j, "s", i)) })).filter((item) => item.choice !== "mine"),
    tools: job.tools.filter((_, i) => !skip.has(keyOf(j, "t", i))),
  }));
  const count = chosen.reduce((sum, item) => sum + (item.include ? item.bullets.length + item.similar.length : 0), 0);
  const focus = only !== undefined ? listed[0]?.job : undefined;

  async function add() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      // On the latest Profile: a job is found again by its company and title.
      const latest = await careerApi.read();
      const roles: CareerExperience[] = structuredClone(latest.data.experiences?.value ?? []);
      for (const { job, include, bullets, similar, tools } of chosen) {
        if (!include || (!bullets.length && !similar.length && !tools.length && !job.job)) continue;
        if (job.index === null) {
          roles.push({ ...job.job!, bullets, techStack: tools.join(", ") });
          continue;
        }
        const role = roles.find((item) => item.company === job.company && item.title === job.title);
        if (!role) throw new Error("Your Profile changed while this was open. Close it and try again.");
        // "Use this one": the CV's line takes your line's place, with its star and tick.
        for (const { line, mine } of similar.filter((item) => item.choice === "theirs")) {
          const swap = (list?: string[]) => list?.map((item) => (item === mine ? line : item));
          role.bullets = swap(role.bullets)!;
          role.starred = swap(role.starred);
          role.excluded = swap(role.excluded);
        }
        const added = [...bullets, ...similar.filter((item) => item.choice === "both").map((item) => item.line)];
        role.bullets = [...role.bullets, ...added.filter((line) => !role.bullets.includes(line))];
        role.techStack = withTools(role.techStack ?? "", tools);
      }
      onSaved(await careerApi.save(latest.revision, { experiences: roles }), count);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save to your Profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="profile-import-dialog profile-career-editor collect-cvs"
      aria-labelledby="collect-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <header className="profile-import-header career-editor-header">
          <div>
            <h2 id="collect-title">From my CVs</h2>
            <p className="career-editor-subtitle">
              {focus ? `What your saved CVs say about ${focus.title} at ${focus.company} that your Profile doesn't yet.` : "What your saved CVs have that your Profile doesn't yet."}
            </p>
          </div>
          <button type="button" className="career-close" aria-label="Close" disabled={saving} onClick={onClose}>
            <DashboardIcon name="close" size={18} />
          </button>
        </header>
        <div className="profile-import-body">
          {!jobs && !error && <p role="status">Reading your CVs…</p>}
          {jobs && listed.length === 0 && <p className="profile-muted">Your Profile already has everything your CVs show.</p>}
          {listed.map(({ job, j }) => (
            <section key={j} className="collect-job" aria-label={`${job.title} at ${job.company}`}>
              <header>
                {job.job ? (
                  <label className="profile-import-check">
                    <input type="checkbox" checked={!skip.has(keyOf(j, "j"))} onChange={() => toggle(keyOf(j, "j"))} />
                    <span>
                      <strong>{job.title}</strong> · {job.company} <span className="profile-tag">New job</span>
                    </span>
                  </label>
                ) : (
                  <p>
                    <strong>{job.title}</strong> · {job.company}
                  </p>
                )}
                <small>From {job.from.join(", ")}</small>
              </header>
              {job.bullets.length > 0 && <p className="collect-group">New bullets</p>}
              {job.bullets.map((bullet, i) => (
                <label key={i} className="collect-line">
                  <input
                    type="checkbox"
                    checked={!skip.has(keyOf(j, "b", i))}
                    disabled={Boolean(job.job) && skip.has(keyOf(j, "j"))}
                    onChange={() => toggle(keyOf(j, "b", i))}
                  />
                  <span>{bullet}</span>
                </label>
              ))}
              {job.similar.length > 0 && <p className="collect-group">Like a bullet you have: choose which to keep</p>}
              {job.similar.map((item, i) => {
                const key = keyOf(j, "s", i);
                return (
                  <div key={i} className="collect-similar" role="group" aria-label={`Like your bullet: ${item.mine}`}>
                    <div className="collect-compare">
                      <div className={choiceOf(key) === "theirs" ? "is-dropped" : ""}>
                        <small>Yours</small>
                        <p>{item.mine}</p>
                      </div>
                      <div className={choiceOf(key) === "mine" ? "is-dropped" : ""}>
                        <small>In your CV</small>
                        <p>{item.line}</p>
                      </div>
                    </div>
                    <div className="collect-choice" role="radiogroup" aria-label="Which to keep">
                      {CHOICES.map((option) => (
                        <label key={option.value} className={choiceOf(key) === option.value ? "is-on" : ""}>
                          <input
                            type="radio"
                            name={key}
                            checked={choiceOf(key) === option.value}
                            onChange={() => setChoices((all) => ({ ...all, [key]: option.value }))}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {job.tools.length > 0 && (
                <div className="collect-tools">
                  <span>Tech stack:</span>
                  {job.tools.map((tool, i) => (
                    <label key={tool} className="profile-choice">
                      <input type="checkbox" checked={!skip.has(keyOf(j, "t", i))} onChange={() => toggle(keyOf(j, "t", i))} />
                      {tool}
                    </label>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
        {error && (
          <p role="alert" className="profile-error profile-import-status">
            {error}
          </p>
        )}
        <footer className="profile-import-footer career-editor-footer">
          <button type="button" className="profile-button is-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          {listed.length > 0 && (
            <button type="submit" className="profile-button" disabled={saving}>
              {saving ? "Adding…" : count ? `Add ${count} to Profile` : "Add to Profile"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
