import { useEffect, useId, useRef, useState } from "react";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";

/** "Node.js, TypeScript; AWS" → ["Node.js", "TypeScript", "AWS"]. */
export const splitTags = (text: string) =>
  text
    .split(/[,;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A list of short names (skills, a job's technologies) as chips, never edited
 * as text: "+ Add" types new ones (Enter adds, a pasted list adds them all,
 * suggestions from the rest of the Profile); pointing at a chip shows its ×,
 * which removes it at once with an Undo for a few seconds.
 */
export function TagList({
  label,
  items,
  suggestions = [],
  addLabel,
  disabled,
  onChange,
}: {
  /** What the items are, for buttons and the field: "skill", "technology". */
  label: string;
  items: string[];
  /** Names used elsewhere in the Profile, offered while typing. */
  suggestions?: string[];
  /** The add button's text; "Add" by default. */
  addLabel?: string;
  disabled: boolean;
  /** Saves the new list; rejects with a message when it cannot. */
  onChange(items: string[]): Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  /** The last removal, for Undo: the list as it was before it. */
  const [undo, setUndo] = useState<{ name: string; before: string[] } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(timer);
  }, [undo]);

  async function save(next: string[]) {
    setBusy(true);
    setError("");
    try {
      await onChange(next);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const typed = splitTags(text);
    if (!typed.length) {
      setAdding(false);
      return;
    }
    const fresh = typed.filter((name, at) => !items.some((item) => same(item, name)) && typed.findIndex((other) => same(other, name)) === at);
    const repeated = typed.filter((name) => items.some((item) => same(item, name)));
    setNote(repeated.length ? `Already there: ${repeated.join(", ")}` : "");
    if (!fresh.length) {
      setText("");
      return;
    }
    if (await save([...items, ...fresh])) {
      setText("");
      setUndo(null);
      // Stays open for the next one.
      requestAnimationFrame(() => field.current?.focus());
    }
  }

  async function remove(name: string) {
    const before = items;
    if (await save(items.filter((item) => item !== name))) setUndo({ name, before });
  }

  const offered = suggestions.filter((name, at) => !items.some((item) => same(item, name)) && suggestions.findIndex((other) => same(other, name)) === at);
  return (
    <div className="tag-list">
      <ul className="tag-chips">
        {items.map((item) => (
          <li key={item} className="tag-chip">
            <span>{item}</span>
            <button
              type="button"
              className="tag-chip-x"
              aria-label={`Remove ${label}: ${item}`}
              title="Remove"
              disabled={disabled || busy}
              onClick={() => void remove(item)}
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
        <li className="tag-add-item">
          {adding ? (
            <>
              <input
                ref={field}
                className="tag-add-input"
                aria-label={`Add ${label}`}
                autoFocus
                list={offered.length ? listId : undefined}
                autoComplete="off"
                placeholder={`Type a ${label}, then Enter`}
                value={text}
                disabled={busy}
                maxLength={400}
                onChange={(event) => {
                  setText(event.target.value);
                  setNote("");
                }}
                onBlur={() => {
                  if (!text.trim()) setAdding(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void add();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setText("");
                    setNote("");
                    setAdding(false);
                  }
                }}
              />
              {offered.length > 0 && (
                <datalist id={listId}>
                  {offered.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              )}
            </>
          ) : (
            <button type="button" className="tag-add" disabled={disabled || busy} onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} />
              {addLabel ?? "Add"}
            </button>
          )}
        </li>
      </ul>
      {adding && !note && !error && <p className="tag-hint">Enter adds it. A list separated by commas adds them all. Esc to finish.</p>}
      {note && <p className="tag-hint">{note}</p>}
      {undo && (
        <p className="tag-undo" role="status">
          Removed “{undo.name}”.
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const before = undo.before;
              setUndo(null);
              void save(before);
            }}
          >
            Undo
          </button>
        </p>
      )}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}
