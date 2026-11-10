import { BULLET_WORDS, checkBullet } from "./bulletCheck";
import "./bullet-meter.css";

/** The bar runs 0 to this many words; the target band is BULLET_WORDS. */
const SCALE = 60;

/**
 * A bullet's check at a glance: its length against 20 to 40 words, then an
 * action verb, a number, a time frame and keywords. A missing number or time
 * frame can open the question that fills it.
 */
export function BulletMeter({
  text,
  keywords,
  onAsk,
  compact = false,
}: {
  text: string;
  /** The words this line should use: the posting's keywords, or the job's technologies. */
  keywords?: string[];
  onAsk?(kind: "metric" | "time"): void;
  compact?: boolean;
}) {
  const check = checkBullet(text, keywords);
  const at = (words: number) => `${Math.min(100, (words / SCALE) * 100)}%`;
  const item = (ok: boolean, label: string, title: string, ask?: "metric" | "time") =>
    !ok && ask && onAsk ? (
      <button type="button" className="bm-check is-missing is-ask" title={`${title} Click to add it.`} onClick={() => onAsk(ask)}>
        <span aria-hidden="true">✕</span>
        {label}
        <span className="bm-add">+ add</span>
      </button>
    ) : (
      <span className={`bm-check ${ok ? "is-ok" : "is-missing"}`} title={title}>
        <span aria-hidden="true">{ok ? "✓" : "✕"}</span>
        {label}
      </span>
    );
  const used = check.keywords?.used ?? [];
  return (
    <div className={`bm${compact ? " is-compact" : ""}`} role="group" aria-label="Bullet check">
      <div className={`bm-length is-${check.length}`} title={`${check.words} words, ${check.characters} characters. Aim for ${BULLET_WORDS.min} to ${BULLET_WORDS.max} words.`}>
        <span className="bm-count">
          <b>{check.words}</b> words
        </span>
        <span className="bm-bar" aria-hidden="true">
          <span className="bm-band" style={{ left: at(BULLET_WORDS.min), width: `calc(${at(BULLET_WORDS.max)} - ${at(BULLET_WORDS.min)})` }} />
          <span className="bm-mark" style={{ left: at(check.words) }} />
        </span>
        {check.length !== "good" && <span className="bm-hint">{check.length === "short" ? "short" : "long"}</span>}
      </div>
      <div className="bm-checks">
        {item(check.actionVerb, "Action verb", "Starts with a past-tense action verb (Built, Led, Cut).")}
        {item(check.metric, "Metric", "Has a number: a count, an amount, a percentage.", "metric")}
        {item(check.time, "Time", "Has a time frame: daily, in 3 months, over 2 years, still in production.", "time")}
        {check.keywords && check.keywords.total > 0 &&
          item(
            used.length > 0,
            used.length ? `Keywords ${used.length}` : "Keywords",
            used.length ? `Uses ${used.join(", ")}.` : "Uses none of the keywords.",
          )}
      </div>
    </div>
  );
}
