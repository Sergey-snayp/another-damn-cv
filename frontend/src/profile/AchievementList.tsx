import { useEffect, useState, type KeyboardEvent } from "react";
import { ACHIEVEMENT_WORDS, careerApi, wordsIn, type CareerExperience } from "./careerApi";
import { tagCounts, tagsOf } from "./achievementTags";
import { BulletMeter } from "../resume/BulletMeter";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import { useSetActiveBullet } from "./bulletFocus";
import { RichEditor } from "../text/RichEditor";
import { MarkedLine } from "../text/Marked";
import { withoutMarks } from "../text/marks";
import { useConfirm } from "../components/ConfirmDialog";
import { AiBadge, AiBox } from "./AiBox";

/** A number left for the person to fill: "[X]%", "[N] months". */
const PLACEHOLDER = /\[[A-Z]\]/;
const PlaceholderNote = ({ text }: { text: string }) =>
  PLACEHOLDER.test(text) ? <p className="ach-placeholder-note">Replace [X] and [N] with your own numbers to save.</p> : null;

/** "C: 167  W: 27" under a bullet being written. */
const Count = ({ text }: { text: string }) => {
  const words = withoutMarks(text).trim();
  return (
    <span className="ach-count">
      C: <b>{words.length}</b> W: <b>{words ? words.split(/\s+/).length : 0}</b>
    </span>
  );
};

/** A list this long gets topic filters above it. */
const FILTER_FROM = 8;
export type RolePatch = Pick<CareerExperience, "bullets" | "starred" | "removed">;

/** "- Built X" / "• Built X" / "1. Built X" → "Built X". */
const clean = (line: string) => line.replace(/^\s*(?:[-•*·–]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim();

/**
 * One job's achievements on the Profile page, in their own order,
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
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [adding, setAdding] = useState("");
  /** "+ Add bullet" opens the box; it closes after adding, on Cancel or Escape. */
  const [addOpen, setAddOpen] = useState(false);
  /** Write with AI / Improve with AI, open under the bullet being edited or added. */
  const [ai, setAi] = useState<null | { for: "edit" | "add"; autoStart: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const technologies = (role.techStack ?? "").split(/[,|;\n]/).map((tool) => tool.trim()).filter(Boolean);
  // What is being written here goes to the bullet check panel beside the Profile.
  const setActive = useSetActiveBullet();
  const activeText = editing ? editing.text : addOpen ? clean(adding.split("\n")[0] ?? "") : null;
  useEffect(() => {
    setActive(activeText === null ? null : { text: withoutMarks(activeText), keywords: technologies, job: [role.title, role.company].filter(Boolean).join(" · ") });
    // The text and whether a box is open decide it; the job's fields are read as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeText]);
  // In the order they were written (and dragged).
  const ordered = role.bullets.map((text, index) => ({ text, index }));
  const filtered = filter ? ordered.filter((item) => tagsOf(item.text).includes(filter)) : ordered;
  // Every bullet shows: a long list is never collapsed.
  const visible = filtered;
  const tags = role.bullets.length >= FILTER_FROM ? tagCounts(role.bullets) : [];
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

  const confirm = useConfirm();
  /** The toolbar's Delete: asked first, then gone for good. */
  async function askRemove(text: string) {
    const yes = await confirm({
      title: "Are you sure you want to delete this bullet?",
      body: (
        <>
          <p>It will be removed from this job in your Profile. Your saved CVs keep their own copy.</p>
          <blockquote>{withoutMarks(text)}</blockquote>
        </>
      ),
      action: "Delete bullet",
    });
    if (yes) remove(text);
  }

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
    if (!editing || PLACEHOLDER.test(editing.text)) return;
    setAi(null);
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
    if (PLACEHOLDER.test(adding)) return;
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
    setAi(null);
  };

  const editKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void finishEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditing(null);
      setAi(null);
    }
  };

  return (
    <div className="ach">
      {tags.length > 0 && (
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
            return (
              <li
                key={`${index}:${text}`}
                className={`ach-row${dragging === text ? " is-dragging" : ""}${dropOn === text && dragging !== text ? " is-drop" : ""}`}
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
                  <Icon name="grip" size={12} />
                </button>
                <svg className="ach-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <rect x="1.5" y="1.5" width="17" height="17" rx="4" />
                  <path d="m6 10.2 2.7 2.7L14.2 7.3" />
                </svg>
                {editing?.index === index ? (
                  <div className="ach-body">
                    <div className="ach-editor">
                      <RichEditor
                        className="ach-edit"
                        label="Edit achievement"
                        autoFocus
                        value={editing.text}
                        onChange={(next) => setEditing({ index, text: next })}
                        onKeyDown={editKeys}
                      />
                      <Count text={editing.text} />
                    </div>
                    <div className="ach-meter-narrow">
                      <BulletMeter text={editing.text} keywords={technologies} compact />
                    </div>
                    <PlaceholderNote text={editing.text} />
                    <div className="ach-editor-actions">
                      {ai?.for !== "edit" && (
                        <button type="button" className="ai-write ach-ai-button" disabled={busy} onClick={() => setAi({ for: "edit", autoStart: true })}>
                          Improve with AI <AiBadge />
                        </button>
                      )}
                      <span className="ach-actions-gap" />
                      <button
                        type="button"
                        className="profile-text-button"
                        onClick={() => {
                          setEditing(null);
                          setAi(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button type="button" className="ach-save" disabled={busy || PLACEHOLDER.test(editing.text)} onClick={() => void finishEdit()}>
                        Save
                      </button>
                    </div>
                    {ai?.for === "edit" && (
                      <AiBox
                        role={role}
                        mode="improve"
                        text={editing.text}
                        autoStart={ai.autoStart}
                        onUse={(next) => {
                          setEditing({ index, text: next });
                          setAi(null);
                        }}
                        onClose={() => setAi(null)}
                      />
                    )}
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
                      <MarkedLine text={text} linkAsText />
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
                {editing?.index !== index && (
                  <span className="ach-tools" role="toolbar" aria-label="Bullet actions">
                    <button
                      type="button"
                      className="ach-tool"
                      aria-label={`Improve with AI: ${text}`}
                      title="Improve with AI"
                      disabled={disabled || busy}
                      onClick={() => {
                        setEditing({ index, text });
                        setAi({ for: "edit", autoStart: true });
                      }}
                    >
                      <Icon name="wand" size={15} />
                    </button>
                    <button
                      type="button"
                      className="ach-tool"
                      aria-label={`Edit: ${text}`}
                      title="Edit"
                      disabled={disabled || busy}
                      onClick={() => setEditing({ index, text })}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      type="button"
                      className="ach-tool"
                      aria-label={`Copy: ${text}`}
                      title="Copy into a new bullet"
                      disabled={disabled || busy}
                      onClick={() => copy(text)}
                    >
                      <Icon name="copy" size={15} />
                    </button>
                    <button
                      type="button"
                      className="ach-tool"
                      aria-label={`Delete: ${text}`}
                      title="Delete"
                      disabled={disabled || busy}
                      onClick={() => void askRemove(text)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="ach-more">
        {!addOpen && (
          <button
            type="button"
            className="add-bullet-button ach-add-open"
            disabled={disabled || busy}
            onClick={() => {
              setAddOpen(true);
            }}
          >
            <Icon name="plus" size={15} />
            Add Bullet
          </button>
        )}
      </div>
      {addOpen && (
        <div className="ach-add">
          <div className="ach-editor">
          <RichEditor
            label="New bullet"
            multiline
            autoFocus
            placeholder="Type a bullet or use AI to write a draft for you."
            value={adding}
            onChange={setAdding}
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
            <Count text={adding} />
          </div>
          {pasted <= 1 && adding.trim() && (
            <div className="ach-meter-narrow">
              <BulletMeter text={clean(adding)} keywords={technologies} compact />
            </div>
          )}
          <PlaceholderNote text={adding} />
          <div className="ach-add-actions">
            {ai?.for !== "add" && (
              <button
                type="button"
                className="ai-write ach-ai-button"
                disabled={disabled || busy}
                title="Write with AI: 3 drafts from what you typed, this job and your choices"
                onClick={() => {
                  // Several lines: each one written into bullets, reviewed together.
                  if (pasted > 1 && onWrite) {
                    onWrite(adding.trim());
                    closeAdd();
                  } else setAi({ for: "add", autoStart: true });
                }}
              >
                Write with AI <AiBadge />
              </button>
            )}
            <span className="ach-actions-gap" />
            <button type="button" className="profile-text-button" disabled={busy} onClick={closeAdd}>
              Cancel
            </button>
            <button type="button" className="ach-save" disabled={disabled || busy || !adding.trim() || PLACEHOLDER.test(adding)} onClick={() => void add()}>
              {pasted > 1 ? `Save ${pasted}` : "Save"}
            </button>
          </div>
          {ai?.for === "add" && (
            <AiBox
              role={role}
              mode="write"
              text={adding}
              autoStart={ai.autoStart}
              onUse={(next) => {
                setAdding(next);
                setAi(null);
              }}
              onClose={() => setAi(null)}
            />
          )}
        </div>
      )}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}
