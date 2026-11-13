import { useState, type KeyboardEvent, type ReactNode } from "react";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import { RichEditor } from "../text/RichEditor";
import { useConfirm } from "../components/ConfirmDialog";

/**
 * A piece of the Profile edited where it is, as bullets are: pointing at it
 * shows the same toolbar (Edit, Delete), clicking it opens the editor, then
 * Cancel or Save. Used for a job's description and technologies, and the skills.
 */
export function InlineEdit({
  label,
  value,
  children,
  empty,
  multiline = false,
  rich = false,
  placeholder,
  disabled,
  deleteTitle,
  deleteBody,
  onSave,
}: {
  /** What it is, for buttons and the editor: "description", "technologies". */
  label: string;
  /** The text being edited. */
  value: string;
  /** How it shows when not edited. */
  children: ReactNode;
  /** Shown instead when there is nothing yet; with it, Edit adds the first text. */
  empty?: ReactNode;
  multiline?: boolean;
  /** Bold and lists allowed (the description); otherwise plain text (lists of names). */
  rich?: boolean;
  placeholder?: string;
  disabled: boolean;
  deleteTitle: string;
  deleteBody: ReactNode;
  /** Saves the text ("" deletes it); rejects with a message when it cannot. */
  onSave(text: string): Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();

  async function save(text: string) {
    setBusy(true);
    setError("");
    try {
      await onSave(text);
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const finish = () => {
    if (editing === null) return;
    const text = editing.trim();
    if (text === value.trim()) setEditing(null);
    else void save(text);
  };
  async function askRemove() {
    if (await confirm({ title: deleteTitle, body: deleteBody, action: `Delete ${label}` })) void save("");
  }
  const keys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditing(null);
      setError("");
    } else if (event.key === "Enter" && (!multiline ? !event.shiftKey : event.metaKey || event.ctrlKey)) {
      // One line: Enter saves. Several: Enter is a new line, ⌘/Ctrl+Enter saves.
      event.preventDefault();
      finish();
    }
  };

  if (editing !== null)
    return (
      <div className="inline-edit is-editing">
        <div className="ach-editor">
          {rich ? (
            <RichEditor label={`Edit ${label}`} multiline={multiline} autoFocus placeholder={placeholder} value={editing} onChange={setEditing} onKeyDown={keys} />
          ) : (
            <textarea
              aria-label={`Edit ${label}`}
              autoFocus
              rows={multiline ? 3 : 1}
              placeholder={placeholder}
              value={editing}
              onChange={(event) => setEditing(event.target.value)}
              onKeyDown={keys}
            />
          )}
        </div>
        <div className="ach-editor-actions">
          <span className="ach-actions-gap" />
          <button type="button" className="profile-text-button" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>
            Cancel
          </button>
          <button type="button" className="ach-save" disabled={busy} onClick={finish}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        {error && <p className="profile-error" role="alert">{error}</p>}
      </div>
    );

  const has = Boolean(value.trim());
  if (!has && !empty) return null;
  return (
    <div className="inline-edit">
      {/* The text itself opens the editor, as a bullet's does; the toolbar's Edit is the keyboard way. */}
      <div className="inline-edit-text" title={disabled ? undefined : "Click to edit"} onClick={() => !disabled && !busy && setEditing(value)}>
        {has ? children : empty}
      </div>
      <span className="ach-tools" role="toolbar" aria-label={`${label[0]!.toUpperCase()}${label.slice(1)} actions`}>
        <button type="button" className="ach-tool" aria-label={`Edit ${label}`} title="Edit" disabled={disabled || busy} onClick={() => setEditing(value)}>
          <Icon name="edit" size={15} />
        </button>
        {has && (
          <button type="button" className="ach-tool" aria-label={`Delete ${label}`} title="Delete" disabled={disabled || busy} onClick={() => void askRemove()}>
            <Icon name="trash" size={15} />
          </button>
        )}
      </span>
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * One short required text edited where it is, as a job's title or company:
 * click it, type, Enter (or click away) saves, Escape cancels. It cannot be
 * left empty.
 */
export function InlineText({
  label,
  value,
  as: Tag = "p",
  disabled,
  onSave,
}: {
  /** What it is: "job title", "company". */
  label: string;
  value: string;
  /** The element it shows in: the title's h3, the company's p. */
  as?: "h3" | "p";
  disabled: boolean;
  /** Saves the text; rejects with a message when it cannot. */
  onSave(text: string): Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    if (editing === null || busy) return;
    const text = editing.trim();
    if (!text) {
      setError(`A job needs a ${label}.`);
      return;
    }
    if (text === value.trim()) {
      setEditing(null);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(text);
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tag className="inline-text-line">
      {editing !== null ? (
        <input
          className="inline-text-input"
          aria-label={`Edit ${label}`}
          autoFocus
          maxLength={2000}
          value={editing}
          disabled={busy}
          onChange={(event) => setEditing(event.target.value)}
          onBlur={() => void finish()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void finish();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setEditing(null);
              setError("");
            }
          }}
        />
      ) : (
        <button type="button" className="inline-text" title="Click to edit" aria-label={`Edit ${label}: ${value}`} disabled={disabled} onClick={() => setEditing(value)}>
          {value}
        </button>
      )}
      </Tag>
      {error && <p className="profile-error" role="alert">{error}</p>}
    </>
  );
}
