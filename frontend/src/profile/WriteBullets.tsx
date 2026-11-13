import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_WORDS, careerApi, wordsIn, type AchievementProposal, type CareerExperience, type CareerState } from "./careerApi";
import { recruiterFlags } from "../resume/readability";
import { BulletMeter } from "../resume/BulletMeter";
import { QUESTIONS } from "../resume/bulletCheck";
import "./profile-import.css";
import "./profile-career-editor.css";
import { DashboardIcon } from "../jobs/DashboardIcon";

/** Questions that help you remember; each adds itself to what you write. */
const IDEAS = [
  "What did you build?",
  "What changed because of it?",
  "Numbers? (users, money, speed, volume)",
  "Tools?",
  "Hard problems you solved?",
  "Team or leadership?",
];

interface ReviewItem {
  text: string;
  keep: boolean;
  /** Follow-up questions that would make the line fuller, with the person's answers so far. */
  asks: string[];
  answers: string[];
  /** Questions answered and used for this line. */
  answered: { question: string; answer: string }[];
  deepening?: boolean;
  note?: string;
  duplicateOf: string | null;
}

/** "Node.js, TypeScript" + ["Route53"] → "Node.js, TypeScript, Route53", in the list's own separator. */
function withTools(stack: string, tools: string[]): string {
  if (!tools.length) return stack;
  const separator = stack.includes("|") ? " | " : ", ";
  return [stack.trim(), ...tools].filter(Boolean).join(separator);
}

/**
 * "✦ Write it for me": what you wrote about one job, in your own words, turned
 * into bullets you keep, edit or drop. Only the bullets are kept: nothing
 * changes in Profile until Save, and the words you wrote are not stored.
 */
export function WriteBullets({
  career,
  index,
  initialText = "",
  onClose,
  onSaved,
}: {
  career: CareerState;
  index: number;
  /** What was typed in the job's "+ Add Bullet" box: written into bullets right away. */
  initialText?: string;
  onClose(): void;
  onSaved(state: CareerState, added: number): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const notesBox = useRef<HTMLTextAreaElement>(null);
  const role = career.data.experiences?.value[index];
  const [text, setText] = useState(initialText);
  const started = useRef(false);
  const [stage, setStage] = useState<"write" | "working" | "review">("write");
  const [seconds, setSeconds] = useState(0);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [tools, setTools] = useState<{ name: string; keep: boolean }[]>([]);
  const [description, setDescription] = useState({ text: "", keep: false });
  const [dropped, setDropped] = useState(0);
  const [uncovered, setUncovered] = useState<string[]>([]);
  // The job's technologies: the "Keywords" a Profile line is checked for.
  const technologies = [...(role?.techStack ?? "").split(/[,|;\n]/), ...tools.map((tool) => tool.name)]
    .map((tool) => tool.trim())
    .filter(Boolean);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    // Opened with words from the bullet box: straight to writing, once.
    if (initialText.trim() && !started.current) {
      started.current = true;
      void generate();
    }
    return () => element?.close();
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (stage !== "working") return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  if (!role) return null;
  const kept = items.filter((item) => item.keep && item.text.trim());
  const source = text.trim();

  // A review not saved yet is asked about first.
  const requestClose = () => {
    if (saving || stage === "working") return;
    if (stage === "review" && kept.length) setConfirmClose(true);
    else onClose();
  };

  function addIdea(question: string) {
    setText((value) => `${value.trimEnd()}${value.trim() ? "\n" : ""}${question} `);
    requestAnimationFrame(() => {
      const box = notesBox.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  }

  async function generate() {
    if (!role || !source.trim()) return;
    setStage("working");
    setError("");
    try {
      const proposal: AchievementProposal = await careerApi.draftAchievements({
        title: role.title,
        company: role.company,
        client: role.client,
        description: role.description,
        bullets: role.bullets,
        techStack: role.techStack ?? "",
        notes: source,
      });
      setItems(proposal.achievements.map((item) => ({ ...item, keep: !item.duplicateOf, answers: item.asks.map(() => ""), answered: [] })));
      setTools(proposal.techStack.map((name) => ({ name, keep: true })));
      setDescription({ text: proposal.description, keep: Boolean(proposal.description) });
      setDropped(proposal.dropped);
      setUncovered(proposal.uncovered ?? []);
      setStage("review");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not write bullets. Try again.");
      setStage("write");
    }
  }

  /** Adds the kept bullets (and chosen tools and description) to this job, on the latest Profile. */
  async function save() {
    if (!role || saving) return;
    setSaving(true);
    setError("");
    try {
      const latest = await careerApi.read();
      const roles = latest.data.experiences?.value ?? [];
      const current = roles[index];
      if (!current || current.company !== role.company || current.title !== role.title || current.client !== role.client || current.from !== role.from)
        throw new Error("This job changed in another window. Close this and open it again.");
      const added = kept.map((item) => item.text.trim()).filter((line) => !current.bullets.includes(line));
      const next: CareerExperience = {
        ...current,
        bullets: [...current.bullets, ...added],
        techStack: withTools(current.techStack ?? "", tools.filter((tool) => tool.keep).map((tool) => tool.name)),
        description: description.keep && !current.description.trim() ? description.text : current.description,
      };
      const state = await careerApi.save(latest.revision, { experiences: roles.map((item, i) => (i === index ? next : item)) });
      onSaved(state, added.length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save to your Profile. Try again.");
      setConfirmClose(false);
    } finally {
      setSaving(false);
    }
  }

  const update = (at: number, patch: Partial<ReviewItem>) =>
    setItems((list) => list.map((item, i) => (i === at ? { ...item, ...patch } : item)));

  const insertAfter = (at: number, lines: string[]) =>
    setItems((list) => [
      ...list.slice(0, at + 1),
      ...lines.map((text) => ({ text, keep: true, asks: [], answers: [], answered: [], duplicateOf: null })),
      ...list.slice(at + 1),
    ]);

  /** A ✕ on Metric or Time: its question joins the line's, ready to answer. */
  const ask = (at: number, kind: keyof typeof QUESTIONS) =>
    setItems((list) =>
      list.map((item, i) =>
        i !== at || item.asks.includes(QUESTIONS[kind])
          ? item
          : { ...item, asks: [...item.asks, QUESTIONS[kind]], answers: [...item.answers, ""] },
      ),
    );

  /** "Split": a line longer than a CV holds, as 2 to 4 that each fit. */
  async function split(at: number) {
    const item = items[at];
    if (!role || !item) return;
    update(at, { deepening: true, note: undefined });
    try {
      const { parts } = await careerApi.splitAchievement({
        source: { title: role.title, company: role.company, client: role.client, description: role.description, bullets: role.bullets, techStack: role.techStack ?? "", notes: source },
        text: item.text,
      });
      if (parts.length < 2) {
        update(at, { deepening: false, note: "This line couldn't be split without losing a fact. Shorten it yourself, or keep it." });
        return;
      }
      update(at, { text: parts[0]!, deepening: false });
      insertAfter(at, parts.slice(1));
    } catch (reason) {
      update(at, { deepening: false, note: reason instanceof Error ? reason.message : "Could not split this line. Try again." });
    }
  }

  /** "Rewrite with my answers": the line filled out with what the person told us. */
  async function deepen(at: number) {
    const item = items[at];
    if (!role || !item) return;
    const answers = item.asks.map((question, i) => ({ question, answer: item.answers[i]?.trim() ?? "" })).filter((pair) => pair.answer);
    if (!answers.length) return;
    update(at, { deepening: true, note: undefined });
    try {
      const result = await careerApi.deepenAchievement({
        source: { title: role.title, company: role.company, client: role.client, description: role.description, bullets: role.bullets, techStack: role.techStack ?? "", notes: source },
        text: item.text,
        answers,
      });
      update(at, result.changed
        ? { text: result.text, asks: result.asks, answers: result.asks.map(() => ""), answered: [...item.answered, ...answers], deepening: false }
        : { deepening: false, answered: [...item.answered, ...answers], note: "Your answers didn't add anything this line can use. Edit it yourself, or keep it." });
      // Grown past the standard size: the rest comes back as lines of their own, right after it.
      if (result.changed && result.more?.length) insertAfter(at, result.more);
    } catch (reason) {
      update(at, { deepening: false, note: reason instanceof Error ? reason.message : "Could not rewrite this line. Try again." });
    }
  }

  return (
    <dialog
      ref={dialog}
      className="profile-import-dialog profile-career-editor describe-job"
      aria-labelledby="describe-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (stage === "review") void save();
          else void generate();
        }}
      >
        <header className="profile-import-header career-editor-header">
          <div>
            <h2 id="describe-title">{stage === "review" ? `Review ${items.length} ${items.length === 1 ? "bullet" : "bullets"}` : "Write bullets"}</h2>
            <p className="career-editor-subtitle">
              {[role.title, role.company].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" className="career-close" aria-label="Close" disabled={saving || stage === "working"} onClick={requestClose}>
            <DashboardIcon name="close" size={18} />
          </button>
        </header>

        <div className="profile-import-body">
          {stage !== "review" ? (
            <div className="describe-write">
              <label htmlFor="describe-notes">What did you do? Tell it like you'd tell a friend. Messy is fine.</label>
              <textarea
                id="describe-notes"
                ref={notesBox}
                className="career-grow describe-notes"
                rows={9}
                maxLength={20000}
                autoFocus
                disabled={stage === "working"}
                placeholder="e.g. payments platform for Verifone. I built the TLS certificate service from scratch with ACME, Route53 and Step Functions; renewals went from manual to automatic. ~20k transactions a day…"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <div className="describe-ideas" aria-label="Ideas">
                {IDEAS.map((idea) => (
                  <button key={idea} type="button" disabled={stage === "working"} onClick={() => addIdea(idea)}>
                    {idea}
                  </button>
                ))}
              </div>
              {stage === "working" && (
                <p className="describe-working" role="status">
                  <span className="describe-dot" aria-hidden="true" /> Writing bullets… {seconds}s
                </p>
              )}
            </div>
          ) : (
            <div className="describe-review">
              {items.length === 0 && <p>No new bullets came from this. Add more detail and try again.</p>}
              <ol>
                {items.map((item, at) => (
                  <li key={at} className={`describe-item${item.keep ? "" : " is-dropped"}${item.duplicateOf ? " is-duplicate" : ""}${item.asks.length && item.keep ? " has-ask" : ""}`}>
                    <textarea
                      className="career-grow"
                      aria-label={`Achievement ${at + 1}`}
                      rows={1}
                      maxLength={4000}
                      value={item.text}
                      disabled={!item.keep}
                      onChange={(event) => update(at, { text: event.target.value })}
                    />
                    {item.keep && (
                      <BulletMeter text={item.text} keywords={technologies} onAsk={(kind) => ask(at, kind)} />
                    )}
                    {item.duplicateOf && <p className="describe-note">Already in this job: “{item.duplicateOf}”</p>}
                    {item.asks.length > 0 && item.keep && (
                      <div className="describe-asks">
                        <p className="describe-ask">Make it fuller <span>(optional)</span></p>
                        {item.asks.map((question, i) => (
                          <label key={question}>
                            <span>{question}</span>
                            <input
                              value={item.answers[i] ?? ""}
                              maxLength={2000}
                              disabled={item.deepening}
                              placeholder="Your answer, in plain words"
                              onChange={(event) => update(at, { answers: item.answers.map((answer, j) => (j === i ? event.target.value : answer)) })}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void deepen(at);
                                }
                              }}
                            />
                          </label>
                        ))}
                        <button
                          type="button"
                          className="profile-text-button"
                          disabled={item.deepening || !item.answers.some((answer) => answer.trim())}
                          onClick={() => void deepen(at)}
                        >
                          {item.deepening ? "Rewriting…" : "✦ Rewrite with my answers"}
                        </button>
                      </div>
                    )}
                    {item.keep && wordsIn(item.text) > ACHIEVEMENT_WORDS && (
                      <p className="describe-note describe-long">
                        {wordsIn(item.text)} words: a CV line holds about {ACHIEVEMENT_WORDS}.{" "}
                        <button type="button" className="profile-text-button" disabled={item.deepening} onClick={() => void split(at)}>
                          {item.deepening ? "Splitting…" : "✦ Split into shorter bullets"}
                        </button>
                      </p>
                    )}
                    {item.note && <p className="describe-note">{item.note}</p>}
                    {item.keep && recruiterFlags(item.text, `${role.bullets.join("\n")}\n${source}`, { countTerms: false }).map((note, index) => (
                      <p key={index} className="describe-note describe-hint">{note}</p>
                    ))}
                    <div className="describe-actions">
                      {item.keep ? (
                        <button type="button" onClick={() => update(at, { keep: false })}>Drop</button>
                      ) : (
                        <button type="button" onClick={() => update(at, { keep: true })}>{item.duplicateOf ? "Add anyway" : "Keep"}</button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {uncovered.length > 0 && (
                <p className="describe-note describe-uncovered">
                  Not in any bullet yet: <strong>{uncovered.join(", ")}</strong>. Nothing here says what{" "}
                  {uncovered.length === 1 ? "it" : "they"} did. Go back, add a line about {uncovered.length === 1 ? "it" : "each"}, and
                  write the bullets again.
                </p>
              )}
              {dropped > 0 && (
                <p className="describe-note">{dropped} more left out: they used numbers or names you didn't write.</p>
              )}
              {tools.length > 0 && (
                <fieldset className="describe-tools">
                  <legend>Add to the tech stack</legend>
                  {tools.map((tool, at) => (
                    <label key={tool.name} className="profile-choice">
                      <input
                        type="checkbox"
                        checked={tool.keep}
                        onChange={() => setTools((list) => list.map((item, i) => (i === at ? { ...item, keep: !item.keep } : item)))}
                      />
                      {tool.name}
                    </label>
                  ))}
                </fieldset>
              )}
              {description.text && (
                <label className="describe-description">
                  <span className="profile-import-check">
                    <input type="checkbox" checked={description.keep} onChange={(event) => setDescription((value) => ({ ...value, keep: event.target.checked }))} />
                    Use as the role description
                  </span>
                  <textarea
                    className="career-grow"
                    rows={2}
                    maxLength={2000}
                    value={description.text}
                    disabled={!description.keep}
                    onChange={(event) => setDescription((value) => ({ ...value, text: event.target.value }))}
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="profile-error profile-import-status">
            {error}
          </p>
        )}
        <footer className="profile-import-footer career-editor-footer">
          {confirmClose ? (
            <div className="career-confirm" role="alertdialog" aria-label="Close without saving?">
              <span>Close without saving your changes?</span>
              <button type="button" className="profile-button is-secondary" autoFocus onClick={() => setConfirmClose(false)}>
                Keep reviewing
              </button>
              <button type="button" className="profile-button is-danger" onClick={onClose}>
                Close
              </button>
            </div>
          ) : stage === "review" ? (
            <>
              <button type="button" className="career-back" disabled={saving} onClick={() => setStage("write")}>
                ← Back to what I wrote
              </button>
              <button type="submit" className="profile-button" disabled={saving || !kept.length}>
                {saving ? "Saving…" : `Add ${kept.length} to Profile`}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="profile-button is-secondary" disabled={stage === "working"} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="profile-button" disabled={saving || stage === "working" || !source}>
                {stage === "working" ? "Writing…" : "✦ Write bullets"}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}
