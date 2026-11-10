import { useState } from "react";
import { BULLET_WORDS, checkBullet } from "../resume/bulletCheck";
import type { ActiveBullet } from "./bulletFocus";

/** Characters a bullet of 20 to 40 words takes, about. */
const CHARACTERS = { min: 100, max: 220 } as const;
/** Words that tell a recruiter about a duty rather than an achievement. */
const WEAK = /\b(responsible for|helped( with)?|assisted( with)?|worked on|participated in|involved in|duties included|tasked with|various)\b/i;

interface Check {
  key: string;
  label: string;
  ok: boolean;
  /** What to do when it is not met. */
  fix: string;
}

function checksOf(bullet: ActiveBullet): Check[] {
  const check = checkBullet(bullet.text, bullet.keywords);
  const weak = WEAK.exec(bullet.text)?.[0];
  const list: Check[] = [
    {
      key: "length",
      label: "Length",
      ok: check.length === "good",
      fix:
        check.length === "short"
          ? `Under ${BULLET_WORDS.min} words: add what it powered, its scale or its result.`
          : `Over ${BULLET_WORDS.max} words: split it into two bullets, one per part of the work.`,
    },
    { key: "verb", label: "Action verbs", ok: check.actionVerb, fix: "Start with a past-tense action verb: Built, Led, Designed, Automated, Cut." },
    { key: "metric", label: "Metrics", ok: check.metric, fix: "Add a number: users, requests a day, services, team size, a % or $ amount." },
    { key: "time", label: "Time statement", ok: check.time, fix: "Add a time frame: daily, in 3 months, over 2 years, still in production." },
    {
      key: "wording",
      label: "Strong wording",
      ok: !weak,
      fix: `Replace “${weak ?? ""}” with what you did yourself: a verb and its result.`,
    },
  ];
  if (bullet.keywords.length)
    list.push({
      key: "keywords",
      label: "Keywords",
      ok: Boolean(check.keywords?.used.length),
      fix: "Name the technologies where they worked: “backed by DynamoDB”, “on AWS Lambda”.",
    });
  return list;
}

const GRADES = ["Needs work", "Needs work", "Fair", "Fair", "Good", "Excellent"] as const;

/** A bar with its target band and a mark at the value. */
function Gauge({ label, value, min, max, scale }: { label: string; value: number; min: number; max: number; scale: number }) {
  const at = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const inBand = value >= min && value <= max;
  return (
    <div className="bp-gauge">
      <span>
        {label}: <b>{value}</b>
      </span>
      <span className="bp-gauge-bar" aria-hidden="true">
        <span className="bp-gauge-ticks">
          <span style={{ left: at(min) }}>{min}</span>
          <span style={{ left: at(max) }}>{max}</span>
        </span>
        <span className="bp-gauge-band" style={{ left: at(min), width: `calc(${at(max)} - ${at(min)})` }} />
        <span className={`bp-gauge-mark${inBand ? "" : " is-off"}`} style={{ left: at(value) }} />
      </span>
    </div>
  );
}

/** Questions that bring back what you achieved, each a possible bullet. */
const PROMPTS = [
  "Did you build a system, service or feature from scratch?",
  "Did you make something faster? (latency, build time, page load)",
  "Did you make something cheaper to run? (cloud costs, licenses)",
  "Did you make something more reliable? (fewer incidents, outages, errors)",
  "Did you automate a manual process?",
  "Did you handle more scale? (users, requests, data)",
  "Did you migrate or modernize something? (framework, cloud, database)",
  "Did you improve security or pass an audit?",
  "Did you integrate with another system, partner or vendor?",
  "Did you solve a hard problem others couldn't?",
  "Did you do something for the first time at your company?",
  "Did you lead, mentor or train anyone?",
  "Did you improve how the team works? (tests, CI/CD, code review, docs)",
  "Did you deliver with fewer people or in less time?",
  "Did your work make or save the company money?",
  "Did your work help customers or users directly?",
];

const EXAMPLES = [
  "Built a TLS certificate service from scratch on AWS Step Functions and Route53, renewing certificates for 40 merchant domains automatically; still in production.",
  "Cut checkout API latency by 30% in 2 months by running sequential PostgreSQL calls in parallel across 3 Node.js services.",
  "Led a 3-person team that moved 12 batch jobs to event-driven Kafka consumers, ending nightly failures that had paged on-call twice a week.",
];

/**
 * The bullet check beside the Profile: the bullet being written, scored as a
 * recruiter's checker would, with what to fix and how a strong bullet reads.
 */
export function BulletPanel({ active }: { active: ActiveBullet | null }) {
  const [tab, setTab] = useState<"suggestions" | "examples" | "prompts">("suggestions");
  const text = active?.text.trim() ?? "";
  const checks = active && text ? checksOf(active) : [];
  const passed = checks.filter((item) => item.ok).length;
  const score = checks.length ? Math.round((passed / checks.length) * 5) : 0;
  const grade = GRADES[score];
  const words = text ? text.split(/\s+/).length : 0;
  const missing = checks.filter((item) => !item.ok);
  return (
    <section className="profile-panel bullet-panel" aria-label="Bullet check">
      <header className="bp-head">
        {text ? (
          <h2 className={`bp-grade is-${score >= 4 ? "good" : score >= 2 ? "fair" : "weak"}`}>
            <span aria-hidden="true">{score >= 4 ? "✅" : score >= 2 ? "🟡" : "⚠️"}</span> {grade}
          </h2>
        ) : (
          <h2 className="bp-grade">Bullet check</h2>
        )}
        {active && <p className="bp-job">{active.job}</p>}
      </header>
      <div className="bp-segments" aria-label={text ? `${passed} of ${checks.length} checks met` : undefined}>
        {[0, 1, 2, 3, 4].map((at) => (
          <span key={at} className={at < score ? "is-on" : ""} />
        ))}
      </div>

      {text ? (
        <>
          <div className="bp-gauges">
            <Gauge label="Characters" value={text.length} min={CHARACTERS.min} max={CHARACTERS.max} scale={300} />
            <Gauge label="Words" value={words} min={BULLET_WORDS.min} max={BULLET_WORDS.max} scale={60} />
          </div>
          <ul className="bp-checks">
            {checks.map((item) => (
              <li key={item.key}>
                {item.label}
                <span className={`bp-dot ${item.ok ? "is-ok" : "is-missing"}`} aria-label={item.ok ? "met" : "missing"}>
                  {item.ok ? "✓" : "✕"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="bp-tabs" role="tablist">
        {(["suggestions", "examples", "prompts"] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? "is-on" : ""} onClick={() => setTab(name)}>
            {{ suggestions: "Suggestions", examples: "Examples", prompts: "Prompts" }[name]}
          </button>
        ))}
      </div>
      {tab === "suggestions" ? (
        <div className="bp-body" role="tabpanel">
          {missing.length > 0 && (
            <ul className="bp-fixes">
              {missing.map((item) => (
                <li key={item.key}>
                  <b>{item.label}:</b> {item.fix}
                </li>
              ))}
            </ul>
          )}
          <h3>Work experience › Bullets</h3>
          <p>Each bullet is proof of what you achieved, not a list of duties. Keep every one here: Quick tailoring picks the best few for each job.</p>
          <ul>
            <li>On a CV, your latest jobs get 3 to 5 bullets, older ones 0 to 3.</li>
            <li>Start with a past-tense action verb.</li>
            <li>Name the technologies where they worked, and use the posting's words when they mean the same.</li>
            <li>
              The formula: <i>action verb + what you built + technologies + number + time frame</i>.
            </li>
            <li>
              {BULLET_WORDS.min} to {BULLET_WORDS.max} words: about two lines on a CV.
            </li>
          </ul>
        </div>
      ) : tab === "prompts" ? (
        <div className="bp-body" role="tabpanel">
          <h3>Work experience › Bullets</h3>
          <p>Stuck? Go through these for each job. Every “yes” is a bullet.</p>
          <ul className="bp-prompts">
            {PROMPTS.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bp-body" role="tabpanel">
          <ul className="bp-examples">
            {EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
          <p className="bp-note">How they read, not what they say: write your own facts.</p>
        </div>
      )}
    </section>
  );
}
