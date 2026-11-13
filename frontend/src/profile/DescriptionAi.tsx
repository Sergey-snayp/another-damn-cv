import { useEffect, useRef, useState } from "react";
import { careerApi, type AssistOption, type CareerExperience } from "./careerApi";
import { AiBadge } from "./AiBox";
import "./ai-box.css";
import { DashboardIcon } from "../jobs/DashboardIcon";

/**
 * Write with AI for a job's description, in the editor's place: 3 one-sentence
 * versions of what the product does, who uses it and why, from this job's
 * facts only. When those are too thin, the AI asks instead of guessing: the
 * person answers and it writes from the answers.
 */
export function DescriptionAi({
  role,
  text,
  onUse,
  onClose,
}: {
  role: CareerExperience;
  /** The description as written now: improved when there is one. */
  text: string;
  onUse(text: string): void;
  onClose(): void;
}) {
  const [working, setWorking] = useState(false);
  const [options, setOptions] = useState<AssistOption[]>([]);
  const [selected, setSelected] = useState(0);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** Answers already given, kept for every later try. */
  const [given, setGiven] = useState<{ question: string; answer: string }[]>([]);
  const [error, setError] = useState("");
  const started = useRef(false);

  async function write(withAnswers = given) {
    setWorking(true);
    setError("");
    try {
      const result = await careerApi.assistDescription({
        source: {
          title: role.title,
          company: role.company,
          client: role.client,
          description: role.description,
          bullets: role.bullets,
          techStack: role.techStack ?? "",
          notes: (role.notes ?? []).map((note) => note.text).join("\n\n"),
        },
        text,
        answers: withAnswers,
        instruction: "",
      });
      setOptions(result.options);
      setSelected(0);
      setQuestions(result.questions);
      setAnswers({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not write a description. Try again.");
    } finally {
      setWorking(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void write();
    // Once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answered = questions.map((question) => ({ question, answer: (answers[question] ?? "").trim() })).filter((item) => item.answer);
  const title = text.trim() ? "Improve with AI" : "Write with AI";
  return (
    <section className="ai-box description-ai" aria-label={title}>
      <header className="ai-head">
        <p className="ai-question">
          {title} <AiBadge />
        </p>
        <button type="button" className="ai-close" aria-label="Close" onClick={onClose}>
          <DashboardIcon name="close" size={18} />
        </button>
      </header>
      {working ? (
        <p className="ai-working" role="status">
          <span className="ai-dot" aria-hidden="true" /> {questions.length || given.length ? "Writing from your answers…" : "Writing 3 versions…"}
        </p>
      ) : questions.length > 0 ? (
        <form
          className="ai-pane"
          onSubmit={(event) => {
            event.preventDefault();
            if (!answered.length) return;
            const next = [...given, ...answered];
            setGiven(next);
            void write(next);
          }}
        >
          <p className="ai-muted">The AI needs a few details to describe it without guessing. Answer what you can.</p>
          <div className="ai-choices">
            {questions.map((question, at) => (
              <label key={question} className="description-ai-answer">
                <span>{question}</span>
                <input
                  autoFocus={at === 0}
                  maxLength={2000}
                  value={answers[question] ?? ""}
                  onChange={(event) => setAnswers((all) => ({ ...all, [question]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="ai-actions">
            <span className="ai-spacer" />
            <button type="button" className="ai-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ai-generate" disabled={!answered.length}>
              Write it <AiBadge />
            </button>
          </div>
        </form>
      ) : options.length > 0 ? (
        <div className="ai-pane">
          <div className="ai-options" role="radiogroup" aria-label="Versions">
            {options.map((option, index) => (
              <label key={index} className={`ai-option${selected === index ? " is-on" : ""}`}>
                <input type="radio" name="description-option" checked={selected === index} onChange={() => setSelected(index)} />
                <span>{option.text}</span>
              </label>
            ))}
          </div>
          <div className="ai-actions">
            <button type="button" className="ai-regenerate" disabled={working} onClick={() => void write()}>
              Regenerate <AiBadge />
            </button>
            <span className="ai-spacer" />
            <button type="button" className="ai-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="ai-go" disabled={!options[selected]} onClick={() => options[selected] && onUse(options[selected]!.text)}>
              Use Description
            </button>
          </div>
        </div>
      ) : error ? (
        <div className="ai-actions">
          <button type="button" className="ai-regenerate" onClick={() => void write()}>
            Try again <AiBadge />
          </button>
          <span className="ai-spacer" />
          <button type="button" className="ai-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      ) : null}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </section>
  );
}
