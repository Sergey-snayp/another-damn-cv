import { useState, type KeyboardEvent } from "react";
import { ACHIEVEMENT_WORDS, careerApi, wordsIn, type CareerExperience } from "./careerApi";
import { tagCounts, tagsOf } from "./achievementTags";
import { BulletMeter } from "../resume/BulletMeter";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";

const SHOWN = 5;
export type RolePatch = Pick<CareerExperience, "bullets" | "starred" | "removed">;

/** The bullet guide opens by itself the first time, then stays closed until asked for. */
const GUIDE_SEEN = "profile-bullet-guide-seen";
const guideSeen = () => {
  try {
    return localStorage.getItem(GUIDE_SEEN) === "1";
  } catch {
    return true;
  }
};
const markGuideSeen = () => {
  try {
    localStorage.setItem(GUIDE_SEEN, "1");
  } catch {
    /* Only decides whether the guide opens by itself. */
  }
};

/** "- Built X" / "• Built X" / "1. Built X" → "Built X". */
const clean = (line: string) => line.replace(/^\s*(?:[-•*·–]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim();

/**
 * One job's achievements on the Profile page: the best five (starred first),
 * all of them on demand with tag filters, edited in place, added one or many
 * at a time, and deleted for good.
 */
export function AchievementList({
  role,
  disabled,
  onSave,
  onWrite,
}: {
  role: CareerExperience;
  disabled: boolean;
  /** "✦ Write it for me": rough words about this job, written into bullets to review. */
  onWrite?(text: string): void;
  /** Saves the job's achievements; rejects with a message when it cannot. */
  onSave(patch: (current: CareerExperience) => Partial<RolePatch>): Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [adding, setAdding] = useState("");
  /** "+ Add bullet" opens the box; it closes after adding, on Cancel or Escape. */
  const [addOpen, setAddOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const starred = new Set(role.starred ?? []);
  const technologies = (role.techStack ?? "").split(/[,|;\n]/).map((tool) => tool.trim()).filter(Boolean);
  // Starred first, each group in its own order.
  const ordered = role.bullets
    .map((text, index) => ({ text, index }))
    .sort((a, b) => Number(starred.has(b.text)) - Number(starred.has(a.text)));
  const filtered = filter ? ordered.filter((item) => tagsOf(item.text).includes(filter)) : ordered;
  const visible = expanded ? filtered : ordered.slice(0, SHOWN);
  const tags = role.bullets.length > SHOWN ? tagCounts(role.bullets) : [];
  const pasted = adding.split("\n").map(clean).filter((line) => line.length > 1).length;

  async function run(patch: (current: CareerExperience) => Partial<RolePatch>) {
    setBusy(true);
    setError("");
    try {
      await onSave(patch);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggleStar = (text: string) =>
    void run((current) => {
      const list = current.starred ?? [];
      return { starred: list.includes(text) ? list.filter((item) => item !== text) : [...list, text] };
    });

  /** Drag (or Alt ↑↓ on the handle): the bullet moves to the other one's place. */
  const move = (from: string, to: string) =>
    void run((current) => {
      const list = [...current.bullets];
      const at = list.indexOf(from);
      const target = list.indexOf(to);
      if (at < 0 || target < 0 || at === target) return {};
      list.splice(at, 1);
      list.splice(target, 0, from);
      return { bullets: list };
    });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  /** Copy: a new bullet that starts as this one, to write a variant of it. */
  const copy = (text: string) => {
    setAdding(text);
    setAddOpen(true);
  };

  // Deleted for good: nothing is kept to restore (older saves' kept copies go too).
  const remove = (text: string) =>
    void run((current) => ({
      bullets: current.bullets.filter((item) => item !== text),
      starred: (current.starred ?? []).filter((item) => item !== text),
      removed: [],
    }));

  /** "Split": a line longer than a CV holds becomes 2 to 4 in its place; a star stays on the first. */
  async function split(text: string) {
    setSplitting(text);
    setError("");
    try {
      const { parts } = await careerApi.splitAchievement({
        source: { title: role.title, company: role.company, client: role.client, description: role.description, bullets: role.bullets, techStack: role.techStack ?? "", notes: "" },
        text,
      });
      if (parts.length < 2) {
        setError("This achievement couldn't be split without losing a fact. Edit it to shorten it.");
        return;
      }
      await run((current) => ({
        bullets: current.bullets.flatMap((item) => (item === text ? parts : [item])),
        starred: (current.starred ?? []).map((item) => (item === text ? parts[0]! : item)),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not split. Try again.");
    } finally {
      setSplitting(null);
    }
  }

  async function finishEdit() {
    if (!editing) return;
    const before = role.bullets[editing.index];
    const text = clean(editing.text);
    setEditing(null);
    if (!before || text === before) return;
    if (!text) return remove(before);
    await run((current) => ({
      bullets: current.bullets.map((item) => (item === before ? text : item)),
      starred: (current.starred ?? []).map((item) => (item === before ? text : item)),
    }));
  }

  async function add() {
    // Several lines pasted: several achievements.
    const lines = adding.split("\n").map(clean).filter((line) => line.length > 1);
    if (!lines.length) return;
    const fresh = lines.filter((line) => !role.bullets.includes(line));
    if (await run((current) => ({ bullets: [...current.bullets, ...fresh.filter((line) => !current.bullets.includes(line))] }))) {
      closeAdd();
    }
  }
  const closeAdd = () => {
    setAdding("");
    setAddOpen(false);
    setGuideOpen(false);
  };

  const editKeys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void finishEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditing(null);
    }
  };

  return (
    <div className="ach">
      {expanded && tags.length > 0 && (
        <div className="ach-tags" role="group" aria-label="Show achievements about">
          <button type="button" className={filter ? "" : "is-on"} aria-pressed={!filter} onClick={() => setFilter(null)}>
            All {role.bullets.length}
          </button>
          {tags.map((tag) => (
            <button
              key={tag.name}
              type="button"
              className={filter === tag.name ? "is-on" : ""}
              aria-pressed={filter === tag.name}
              onClick={() => setFilter(filter === tag.name ? null : tag.name)}
            >
              {tag.name} {tag.count}
            </button>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <ul className="ach-list">
          {visible.map(({ text, index }) => {
            const star = starred.has(text);
            return (
              <li
                key={`${index}:${text}`}
                className={`ach-row${star ? " is-starred" : ""}${dragging === text ? " is-dragging" : ""}${dropOn === text && dragging !== text ? " is-drop" : ""}`}
                draggable={dragging === text}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", text);
                }}
                onDragOver={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  setDropOn(text);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging && dragging !== text) move(dragging, text);
                  setDragging(null);
                  setDropOn(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropOn(null);
                }}
              >
                <button
                  type="button"
                  className="ach-grip"
                  aria-label={`Move: ${text}`}
                  title="Drag to move · Alt ↑↓"
                  disabled={disabled || busy}
                  onPointerDown={() => setDragging(text)}
                  onPointerUp={() => setDragging(null)}
                  onKeyDown={(event) => {
                    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                    event.preventDefault();
                    const at = visible.findIndex((item) => item.text === text);
                    const next = visible[at + (event.key === "ArrowUp" ? -1 : 1)];
                    if (next) move(text, next.text);
                  }}
                >
                  <Icon name="grip" size={14} />
                </button>
                <svg className="ach-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <rect x="1.5" y="1.5" width="17" height="17" rx="4" />
                  <path d="m6 10.2 2.7 2.7L14.2 7.3" />
                </svg>
                {editing?.index === index ? (
                  <div className="ach-body">
                    <textarea
                      className="ach-edit"
                      aria-label="Edit achievement"
                      autoFocus
                      rows={1}
                      maxLength={4000}
                      value={editing.text}
                      onChange={(event) => setEditing({ index, text: event.target.value })}
                      onKeyDown={editKeys}
                      onBlur={() => void finishEdit()}
                    />
                    <BulletMeter text={editing.text} keywords={technologies} compact />
                  </div>
                ) : (
                  <div className="ach-body">
                    <button
                      type="button"
                      className="ach-text"
                      title="Click to edit"
                      disabled={disabled || busy}
                      onClick={() => setEditing({ index, text })}
                    >
                      {text}
                    </button>
                    {wordsIn(text) > ACHIEVEMENT_WORDS && (
                      <span className="ach-long">
                        {wordsIn(text)} words: a CV line holds about {ACHIEVEMENT_WORDS}.
                        <button type="button" className="profile-text-button" disabled={disabled || busy || splitting !== null} onClick={() => void split(text)}>
                          {splitting === text ? "Splitting…" : "✦ Split"}
                        </button>
                      </span>
                    )}
                  </div>
                )}
                {star && <span className="ach-starred" title="Starred: shown first" aria-hidden="true">★</span>}
                {editing?.index !== index && (
                  <span className="ach-tools" role="toolbar" aria-label="Bullet actions">
                    <button
                      type="button"
                      className={`ach-tool${star ? " is-on" : ""}`}
                      aria-label={star ? `Unstar: ${text}` : `Star: ${text}`}
                      aria-pressed={star}
                      title={star ? "Starred: shown first" : "Star: show first"}
                      disabled={disabled || busy}
                      onClick={() => toggleStar(text)}
                    >
                      <Icon name="star" size={18} filled={star} />
                    </button>
                    <button
                      type="button"
                      className="ach-tool"
                      aria-label={`Edit: ${text}`}
                      title="Edit"
                      disabled={disabled || busy}
                      onClick={() => setEditing({ index, text })}
                    >
                      <Icon name="edit" size={18} />
                    </button>
                    <button
                      type="button"
                      className="ach-tool"
                      aria-label={`Copy: ${text}`}
                      title="Copy into a new bullet"
                      disabled={disabled || busy}
                      onClick={() => copy(text)}
                    >
                      <Icon name="copy" size={18} />
                    </button>
                    <button
                      type="button"
                      className="ach-tool"
                      aria-label={`Delete: ${text}`}
                      title="Delete"
                      disabled={disabled || busy}
                      onClick={() => remove(text)}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="ach-more">
        {role.bullets.length > SHOWN && (
          <button
            type="button"
            className="profile-text-button"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded(!expanded);
              setFilter(null);
            }}
          >
            {expanded ? "Show fewer" : `Show all ${role.bullets.length}`}
          </button>
        )}
        {!addOpen && (
          <button
            type="button"
            className="add-bullet-button ach-add-open"
            disabled={disabled || busy}
            onClick={() => {
              setAddOpen(true);
              if (!guideSeen()) {
                setGuideOpen(true);
                markGuideSeen();
              }
            }}
          >
            <Icon name="plus" size={18} />
            Add Bullet
          </button>
        )}
      </div>
      {addOpen && (
        <div className="ach-add">
          <textarea
            aria-label="New bullet"
            autoFocus
            rows={2}
            maxLength={20000}
            placeholder="Write the bullet, or a few rough words and let AI write it. Paste several lines to add several."
            disabled={disabled || busy}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeAdd();
              } else if (event.key === "Enter" && !event.shiftKey && !adding.includes("\n")) {
                event.preventDefault();
                void add();
              }
            }}
          />
          {pasted <= 1 && adding.trim() && <BulletMeter text={clean(adding)} keywords={technologies} compact />}
          <div className="ach-add-actions">
            <button type="button" className="profile-add-button" disabled={disabled || busy || !adding.trim()} onClick={() => void add()}>
              {pasted > 1 ? `Add ${pasted}` : "Add"}
            </button>
            {onWrite && (
              <button
                type="button"
                className="profile-add-button ach-write"
                disabled={disabled || busy || !adding.trim()}
                title="Turn rough words into finished bullets to review"
                onClick={() => {
                  onWrite(adding.trim());
                  closeAdd();
                }}
              >
                ✦ Write it for me
              </button>
            )}
            <button type="button" className="profile-text-button" disabled={busy} onClick={closeAdd}>
              Cancel
            </button>
          </div>
          <details className="ach-guide" open={guideOpen} onToggle={(event) => setGuideOpen(event.currentTarget.open)}>
            <summary>How to write a strong bullet</summary>
            <ol>
              <li>Start with a past-tense action verb: Built, Led, Designed, Cut.</li>
              <li>Say what you built and name the technologies where they worked.</li>
              <li>Add a number (users, requests, %, people) and a time frame (daily, in 3 months, still in production).</li>
              <li>Keep it to 20 to 40 words: about two lines on a CV.</li>
            </ol>
            <p className="ach-guide-example">
              e.g. Built a TLS certificate service from scratch on AWS Step Functions and Route53, renewing certificates
              for 40 merchant domains automatically; still in production.
            </p>
            <p>Only rough words? Type them and press ✦ Write it for me.</p>
          </details>
        </div>
      )}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}
