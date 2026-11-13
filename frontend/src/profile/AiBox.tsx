import { useEffect, useRef, useState, type ReactNode } from "react";
import { careerApi, type AssistOption, type CareerExperience } from "./careerApi";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import "./ai-box.css";

/** The wand badge on AI buttons, as Teal shows its credits (here: no limit, so just the wand). */
export const AiBadge = () => (
  <span className="ai-badge" aria-hidden="true">
    <Icon name="wand" size={14} />
  </span>
);

type Tab = "automatic" | "keywords" | "coach" | "custom";
type Request = { tab: Tab; keywords: string[]; instruction: string; coach?: { task: string; impacts: string[]; amount: string; period: string } };

const TABS: { key: Tab; label: string }[] = [
  { key: "automatic", label: "Automatic" },
  { key: "keywords", label: "Keywords" },
  { key: "coach", label: "Coach Me" },
  { key: "custom", label: "Custom Prompt" },
];
const IMPACTS = ["Faster", "Cheaper to run", "More reliable", "More secure", "Less manual work", "More users or volume", "A new feature or product", "Better team or process"];
/** "[X]%", "[N] months": a number the person fills in. */
const PLACEHOLDER = /\[[A-Z]\]/;

/** Keywords and tasks per job, asked for once a session. */
const suggestions = new Map<string, Promise<{ keywords: string[]; tasks: string[] }>>();

const sourceOf = (role: CareerExperience) => ({
  title: role.title,
  company: role.company,
  client: role.client,
  description: role.description,
  bullets: role.bullets,
  techStack: role.techStack ?? "",
  notes: "",
});

/** The option's text with the chosen keywords underlined and placeholders marked. */
function highlighted(text: string, keywords: string[]): ReactNode[] {
  const words = keywords.filter(Boolean).map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(\\[[A-Z]\\]|${words.length ? words.join("|") : "(?!)"})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 0 ? part : PLACEHOLDER.test(part) ? <mark key={index} className="ai-placeholder">{part}</mark> : <span key={index} className="ai-keyword">{part}</span>,
  );
}

/**
 * Write with AI / Improve with AI, under a bullet being written: Automatic,
 * Keywords, Coach Me or a Custom Prompt, then 3 versions to choose from. Every
 * version is checked against the person's facts; a number they never gave is
 * left as a placeholder ([X]) for them to fill.
 */
export function AiBox({
  role,
  mode,
  text,
  autoStart = false,
  subject = "bullet",
  run,
  keywordChoices,
  tabs = ["automatic", "keywords", "coach", "custom"],
  onUse,
  onClose,
}: {
  /** The job a bullet belongs to; not needed with `run` (the summary). */
  role?: CareerExperience;
  /** "improve": the text in the editor; "write": new, from what is typed (maybe nothing). */
  mode: "improve" | "write";
  text: string;
  autoStart?: boolean;
  /** What is written: a job's "bullet", or the "summary". */
  subject?: "bullet" | "summary";
  /** Writes the versions; a job's bullet uses the bullet writer by default. */
  run?(request: { keywords: string[]; instruction: string }): Promise<AssistOption[]>;
  /** The keywords to choose from, when they do not come from the job. */
  keywordChoices?: string[];
  tabs?: Tab[];
  onUse(text: string): void;
  onClose(): void;
}) {
  const [tab, setTab] = useState<Tab>("automatic");
  /** Each tab keeps its own results: going to another tab and back shows them again. */
  const [byTab, setByTab] = useState<Partial<Record<Tab, { options: AssistOption[]; request: Request; selected: number }>>>({});
  /** Which tabs show their results (rather than their choices). */
  const [showing, setShowing] = useState<Partial<Record<Tab, boolean>>>({});
  /** The tabs writing right now: each tab's request runs on while another tab is open. */
  const [busyTabs, setBusyTabs] = useState<Tab[]>([]);
  const working = busyTabs.includes(tab);
  const current = byTab[tab];
  const stage: "input" | "working" | "results" = working ? "working" : showing[tab] && current ? "results" : "input";
  const options = current?.options ?? [];
  const selected = current?.selected ?? 0;
  const last = current?.request ?? null;
  const setSelected = (index: number) =>
    setByTab((all) => (all[tab] ? { ...all, [tab]: { ...all[tab]!, selected: index } } : all));
  const showResults = (on: boolean) => setShowing((all) => ({ ...all, [tab]: on }));
  const [error, setError] = useState("");
  const [lists, setLists] = useState<{ keywords: string[]; tasks: string[] } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [ownKeyword, setOwnKeyword] = useState("");
  const [coachStep, setCoachStep] = useState<1 | 2>(1);
  const [task, setTask] = useState("");
  const [ownTask, setOwnTask] = useState("");
  const [impacts, setImpacts] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("");
  const [prompt, setPrompt] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (keywordChoices || !role) {
      setLists({ keywords: (keywordChoices ?? []).slice(0, 12), tasks: [] });
      return;
    }
    const key = [role.company, role.title, role.client, role.from].join("|");
    if (!suggestions.has(key)) suggestions.set(key, careerApi.assistSuggestions(sourceOf(role)).catch(() => ({ keywords: [], tasks: [] })));
    let alive = true;
    void suggestions.get(key)!.then((value) => alive && setLists(value));
    return () => {
      alive = false;
    };
    // Once per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(request: Request) {
    setBusyTabs((all) => [...all.filter((item) => item !== request.tab), request.tab]);
    setError("");
    try {
      const result = run
        ? { options: await run({ keywords: request.keywords, instruction: request.instruction }) }
        : await careerApi.assistAchievement({ source: sourceOf(role!), mode, text, keywords: request.keywords, instruction: request.instruction, coach: request.coach });
      setByTab((all) => ({ ...all, [request.tab]: { options: result.options, request, selected: 0 } }));
      setShowing((all) => ({ ...all, [request.tab]: true }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The AI did not write a bullet. Try again.");
    } finally {
      setBusyTabs((all) => all.filter((item) => item !== request.tab));
    }
  }

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void generate({ tab: "automatic", keywords: [], instruction: "" });
    }
    // Once, when opened from the wand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keywordList = [...new Set([...(lists?.keywords ?? []), ...picked])];
  const taskList = [...new Set([...(lists?.tasks ?? []), ...(ownTask.trim() && task === ownTask.trim() ? [task] : [])])];
  const togglePick = (keyword: string) =>
    setPicked((list) => (list.includes(keyword) ? list.filter((item) => item !== keyword) : list.length < 3 ? [...list, keyword] : list));
  const addOwnKeyword = () => {
    const keyword = ownKeyword.trim();
    if (keyword && !picked.includes(keyword) && picked.length < 3) setPicked([...picked, keyword]);
    setOwnKeyword("");
  };

  const inputs = () => {
    if (tab === "automatic")
      return (
        <div className="ai-pane">
          <p className="ai-question">
            {subject === "summary"
              ? mode === "improve"
                ? "3 stronger versions of your summary, from your Profile."
                : "3 summaries written from your Profile: your jobs, results and skills."
              : mode === "improve"
                ? "3 stronger versions of this bullet, from your own facts."
                : text.trim()
                  ? "3 bullets from what you wrote and this job."
                  : "3 bullets from this job's details. Type a few words above to steer them."}
          </p>
          <div className="ai-actions">
            <button type="button" className="ai-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="ai-generate" disabled={working} onClick={() => void generate({ tab, keywords: [], instruction: "" })}>
              {working ? "Writing…" : mode === "improve" ? "Improve" : subject === "summary" ? "Generate Summary" : "Generate Bullets"} <AiBadge />
            </button>
          </div>
        </div>
      );
    if (tab === "keywords")
      return (
        <div className="ai-pane">
          <p className="ai-question">Select up to 3 keywords to include in your {subject}:</p>
          <div className="ai-choices">
            {!lists && <p className="ai-muted">Finding keywords for this job…</p>}
            <div className="ai-chips">
              {keywordList.map((keyword) => (
                <label key={keyword} className={`ai-chip${picked.includes(keyword) ? " is-on" : ""}`}>
                  <input type="checkbox" checked={picked.includes(keyword)} disabled={!picked.includes(keyword) && picked.length >= 3} onChange={() => togglePick(keyword)} />
                  {keyword}
                </label>
              ))}
            </div>
            <div className="ai-own">
              <input
                aria-label="Add a keyword"
                placeholder="Manually add keywords for the AI to use"
                value={ownKeyword}
                maxLength={60}
                onChange={(event) => setOwnKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addOwnKeyword();
                  }
                }}
              />
              <button type="button" aria-label="Add keyword" disabled={!ownKeyword.trim() || picked.length >= 3} onClick={addOwnKeyword}><Icon name="plus" size={16} /></button>
            </div>
          </div>
          <div className="ai-actions">
            <button type="button" className="ai-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="ai-generate" disabled={working || !picked.length} onClick={() => void generate({ tab, keywords: picked, instruction: "" })}>
              {working ? "Writing…" : subject === "summary" ? "Generate Summary" : "Generate Bullets"} <AiBadge />
            </button>
          </div>
        </div>
      );
    if (tab === "coach")
      return coachStep === 1 ? (
        <div className="ai-pane">
          <p className="ai-question">Which of the following responsibilities do you have experience with?</p>
          <div className="ai-choices">
            {!lists && <p className="ai-muted">Finding this job's responsibilities…</p>}
            <div className="ai-tasks" role="radiogroup" aria-label="Responsibilities">
              {taskList.map((item) => (
                <label key={item} className={`ai-task${task === item ? " is-on" : ""}`}>
                  <input type="radio" name="ai-task" checked={task === item} onChange={() => setTask(item)} />
                  {item}
                </label>
              ))}
            </div>
            <div className="ai-own">
              <input
                aria-label="Add a task"
                placeholder="Manually add a task"
                value={ownTask}
                maxLength={200}
                onChange={(event) => {
                  setOwnTask(event.target.value);
                  setTask(event.target.value.trim());
                }}
              />
            </div>
          </div>
          <div className="ai-actions">
            <button type="button" className="ai-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="ai-continue" disabled={!task} onClick={() => setCoachStep(2)}>Continue</button>
          </div>
        </div>
      ) : (
        <div className="ai-pane">
          <p className="ai-question">What changed because of “{task}”?</p>
          <div className="ai-choices">
            <div className="ai-chips">
              {IMPACTS.map((impact) => (
                <label key={impact} className={`ai-chip${impacts.includes(impact) ? " is-on" : ""}`}>
                  <input type="checkbox" checked={impacts.includes(impact)} onChange={() => setImpacts((list) => (list.includes(impact) ? list.filter((item) => item !== impact) : [...list, impact]))} />
                  {impact}
                </label>
              ))}
            </div>
            <div className="ai-fields">
              <label>
                How much? <span>(optional)</span>
                <input value={amount} maxLength={200} placeholder="e.g. 30% faster, 2 hours a week, 12 services" onChange={(event) => setAmount(event.target.value)} />
              </label>
              <label>
                Over how long? <span>(optional)</span>
                <input value={period} maxLength={200} placeholder="e.g. in 3 months, daily, still in production" onChange={(event) => setPeriod(event.target.value)} />
              </label>
            </div>
          </div>
          <div className="ai-actions">
            <button type="button" className="ai-cancel" onClick={() => setCoachStep(1)}>Back</button>
            <button type="button" className="ai-generate" disabled={working} onClick={() => void generate({ tab, keywords: [], instruction: "", coach: { task, impacts, amount: amount.trim(), period: period.trim() } })}>
              {working ? "Writing…" : "Generate Bullets"} <AiBadge />
            </button>
          </div>
        </div>
      );
    return (
      <div className="ai-pane">
        <p className="ai-question ai-prompt-title">
          Custom Prompt{" "}
          <span className="ai-help" title="Tell the AI what to change: shorter, lead with the result, stress the security work. It still uses only your facts."><Icon name="help" size={18} /></span>
        </p>
        <div className="ai-choices">
        <div className="ai-prompt">
          <input
            aria-label="Custom prompt"
            placeholder={'Ex: "Make it concise" or "Focus on teamwork"'}
            value={prompt}
            maxLength={500}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && prompt.trim()) {
                event.preventDefault();
                void generate({ tab, keywords: [], instruction: prompt.trim() });
              }
            }}
          />
          <button type="button" className="ai-send" aria-label="Generate" disabled={working || !prompt.trim()} onClick={() => void generate({ tab, keywords: [], instruction: prompt.trim() })}>
            <Icon name="arrowUp" size={18} /> <AiBadge />
          </button>
        </div>
        </div>
      </div>
    );
  };

  const results = () => (
    <div className="ai-pane">
      <div className="ai-options" role="radiogroup" aria-label="Versions">
        {options.map((option, index) => (
          <label key={index} className={`ai-option${selected === index ? " is-on" : ""}`}>
            <input type="radio" name="ai-option" checked={selected === index} onChange={() => setSelected(index)} />
            <span>{highlighted(option.text, last?.keywords ?? [])}</span>
          </label>
        ))}
      </div>
      {options[selected]?.placeholders.length ? (
        <p className="ai-note">Replace {options[selected]!.placeholders.join(" and ")} with your own numbers before you save.</p>
      ) : null}
      <div className="ai-actions">
        <button type="button" className="ai-regenerate" disabled={working || !last} onClick={() => last && void generate(last)}>
          {working ? "Writing…" : "Regenerate"} <AiBadge />
        </button>
        <span className="ai-spacer" />
        {last?.tab === "automatic" ? (
          <button type="button" className="ai-cancel" onClick={onClose}>Cancel</button>
        ) : (
          <button type="button" className="ai-cancel" onClick={() => showResults(false)}>Back</button>
        )}
        <button type="button" className="ai-go" disabled={!options[selected]} onClick={() => options[selected] && onUse(options[selected]!.text)}>
          {subject === "summary" ? "Use Summary" : "Use Bullet"}
        </button>
      </div>
    </div>
  );

  return (
    <section className="ai-box" aria-label={mode === "improve" ? "Improve with AI" : "Write with AI"}>
      <header className="ai-head">
        <div className="ai-tabs" role="tablist">
          {TABS.filter((item) => tabs.includes(item.key)).map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? "is-on" : ""}
              onClick={() => {
                // Its own results, if it has any, or its choices.
                setTab(item.key);
                setError("");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="ai-close" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>
      {stage === "working" ? (
        <p className="ai-working" role="status">
          <span className="ai-dot" aria-hidden="true" /> Writing 3 versions…
        </p>
      ) : stage === "results" ? (
        results()
      ) : (
        inputs()
      )}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </section>
  );
}
