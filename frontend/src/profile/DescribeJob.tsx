import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_WORDS, careerApi, wordsIn, type AchievementProposal, type CareerExperience, type CareerState } from "./careerApi";
import { recruiterFlags } from "../resume/readability";
import "./profile-import.css";
import "./profile-career-editor.css";

/** Questions that help you remember; each adds itself to the notes. */
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
  /** Questions answered and used, kept with the notes on Save. */
  answered: { question: string; answer: string }[];
  deepening?: boolean;
  note?: string;
  duplicateOf: string | null;
}

const draftKey = (role: CareerExperience) => `profile-notes-draft:${role.company}|${role.title}`.toLowerCase();
const readDraft = (role: CareerExperience) => {
  try {
    return localStorage.getItem(draftKey(role)) ?? "";
  } catch {
    return "";
  }
};
const writeDraft = (role: CareerExperience, text: string) => {
  try {
    if (text.trim()) localStorage.setItem(draftKey(role), text);
    else localStorage.removeItem(draftKey(role));
  } catch {
    /* Only a convenience: the notes are saved with the job on Save. */
  }
};
const noteDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "Node.js, TypeScript" + ["Route53"] → "Node.js, TypeScript, Route53", in the list's own separator. */
function withTools(stack: string, tools: string[]): string {
  if (!tools.length) return stack;
  const separator = stack.includes("|") ? " | " : ", ";
  return [stack.trim(), ...tools].filter(Boolean).join(separator);
}

/**
 * Add a note: notes about one job, kept as written, turned into
 * achievements you keep, edit or drop. Nothing changes in Profile until Save.
 */
export function DescribeJob({
  career,
  index,
  onClose,
  onSaved,
}: {
  career: CareerState;
  index: number;
  onClose(): void;
  onSaved(state: CareerState, added: number): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const notesBox = useRef<HTMLTextAreaElement>(null);
  const role = career.data.experiences?.value[index];
  const savedNotes = role?.notes ?? [];
  const [removedNotes, setRemovedNotes] = useState<number[]>([]);
  const earlier = savedNotes.filter((_note, at) => !removedNotes.includes(at));
  const [text, setText] = useState(() => (role ? readDraft(role) : ""));
  const [useEarlier, setUseEarlier] = useState(true);
  const [stage, setStage] = useState<"write" | "working" | "review">("write");
  const [seconds, setSeconds] = useState(0);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [tools, setTools] = useState<{ name: string; keep: boolean }[]>([]);
  const [description, setDescription] = useState({ text: "", keep: false });
  const [dropped, setDropped] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (role) writeDraft(role, text);
  }, [role, text]);
  useEffect(() => {
    if (stage !== "working") return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  if (!role) return null;
  const kept = items.filter((item) => item.keep && item.text.trim());
  const source = [useEarlier ? earlier.map((note) => note.text).join("\n\n") : "", text].filter((part) => part.trim()).join("\n\n");

  // Closing keeps what you typed (it is saved in this browser); a review not saved yet is asked about.
  const requestClose = () => {
    if (saving || stage === "working") return;
    if ((stage === "review" && kept.length) || removedNotes.length) setConfirmClose(true);
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
      setStage("review");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not write achievements. Try again.");
      setStage("write");
    }
  }

  /** Saves the notes (and, after a review, the kept achievements) to this job, on the latest Profile. */
  async function save(withAchievements: boolean) {
    if (!role || saving) return;
    setSaving(true);
    setError("");
    try {
      const latest = await careerApi.read();
      const roles = latest.data.experiences?.value ?? [];
      const current = roles[index];
      if (!current || current.company !== role.company || current.title !== role.title || current.client !== role.client || current.from !== role.from)
        throw new Error("This job changed in another window. Close this and open it again.");
      const added = withAchievements ? kept.map((item) => item.text.trim()) : [];
      const answered = withAchievements ? items.flatMap((item) => item.answered) : [];
      const written = [text.trim(), ...answered.map((pair) => `${pair.question} ${pair.answer}`)].filter(Boolean).join("\n");
      // Remove only the notes reviewed here, keeping any notes added in another window.
      const removals = removedNotes.map(at => savedNotes[at]!);
      const retainedNotes = (current.notes ?? []).filter(note => {
        const at = removals.findIndex(removed => removed.at === note.at && removed.text === note.text);
        if (at < 0) return true;
        removals.splice(at, 1);
        return false;
      });
      const next: CareerExperience = {
        ...current,
        // The notes, and the answers given in the review: facts the next generation can use too.
        notes: written ? [...retainedNotes, { text: written, at: new Date().toISOString() }] : retainedNotes,
        bullets: [...current.bullets, ...added],
        techStack: withAchievements ? withTools(current.techStack ?? "", tools.filter((tool) => tool.keep).map((tool) => tool.name)) : current.techStack,
        description:
          withAchievements && description.keep && !current.description.trim() ? description.text : current.description,
      };
      const state = await careerApi.save(latest.revision, { experiences: roles.map((item, i) => (i === index ? next : item)) });
      writeDraft(role, "");
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
          if (stage === "review") void save(true);
          else void generate();
        }}
      >
        <header className="profile-import-header career-editor-header">
          <div>
            <h2 id="describe-title">{stage === "review" ? `Review ${items.length} achievements` : "Add a note"}</h2>
            <p className="career-editor-subtitle">
              {[role.title, role.company].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" className="career-close" aria-label="Close" disabled={saving || stage === "working"} onClick={requestClose}>
            ×
          </button>
        </header>

        <div className="profile-import-body">
          {stage !== "review" ? (
            <div className="describe-write">
              <label htmlFor="describe-notes">Tell it like you'd tell a friend. Messy is fine.</label>
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
              {savedNotes.length > 0 && (
                <details className="describe-earlier">
                  <summary>
                    Earlier notes ({earlier.length}){earlier.length ? ` · last ${noteDate(earlier[earlier.length - 1]!.at)}` : ""}
                  </summary>
                  <div className="describe-note-toolbar">
                    <label className="profile-import-check">
                      <input type="checkbox" checked={useEarlier} disabled={saving || stage === "working" || !earlier.length} onChange={(event) => setUseEarlier(event.target.checked)} />
                      Use them too
                    </label>
                    {earlier.length > 1 && <button type="button" className="profile-text-button describe-remove-all" disabled={saving || stage === "working"} onClick={() => setRemovedNotes(savedNotes.map((_note, at) => at))}>Remove all notes</button>}
                  </div>
                  {savedNotes.map((note, i) => (
                    <blockquote key={i} className={`describe-saved-note${removedNotes.includes(i) ? " is-removed" : ""}`}>
                      <div className="describe-note-heading">
                        <small>{noteDate(note.at)}</small>
                        <button type="button" className="profile-text-button describe-remove-note" disabled={saving || stage === "working"}
                          aria-label={`${removedNotes.includes(i) ? "Undo removal of" : "Remove"} saved note ${i + 1}`}
                          onClick={() => setRemovedNotes(list => list.includes(i) ? list.filter(at => at !== i) : [...list, i])}>
                          {removedNotes.includes(i) ? "Undo" : "Remove"}
                        </button>
                      </div>
                      <span className="describe-note-text">{note.text}</span>
                    </blockquote>
                  ))}
                  {removedNotes.length > 0 && <p className="describe-removal-status" role="status">{removedNotes.length === 1 ? "1 note will" : `${removedNotes.length} notes will`} be removed when you save.</p>}
                </details>
              )}
              {stage === "working" && (
                <p className="describe-working" role="status">
                  <span className="describe-dot" aria-hidden="true" /> Writing achievements from your notes… {seconds}s
                </p>
              )}
            </div>
          ) : (
            <div className="describe-review">
              {items.length === 0 && <p>No new achievements came from these notes. Add more detail and try again.</p>}
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
                          {item.deepening ? "Splitting…" : "✦ Split into shorter achievements"}
                        </button>
                      </p>
                    )}
                    {item.note && <p className="describe-note">{item.note}</p>}
                    {item.keep && recruiterFlags(item.text, `${role.bullets.join("\n")}\n${source}`).map((note, index) => (
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
              {dropped > 0 && (
                <p className="describe-note">{dropped} more left out: they used numbers your notes don't have.</p>
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
                ← Back to notes
              </button>
              <button type="submit" className="profile-button" disabled={saving}>
                {saving ? "Saving…" : kept.length ? `Save ${kept.length} to Profile` : "Save notes only"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="profile-button is-secondary"
                disabled={saving || stage === "working" || (!text.trim() && !removedNotes.length)}
                title="Save changes to this job's notes without adding achievements."
                onClick={() => void save(false)}
              >
                {saving ? "Saving…" : removedNotes.length ? "Save changes" : "Save notes only"}
              </button>
              <button type="submit" className="profile-button" disabled={saving || stage === "working" || !source.trim()}>
                {stage === "working" ? "Writing…" : "✦ Turn into bullets"}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}
