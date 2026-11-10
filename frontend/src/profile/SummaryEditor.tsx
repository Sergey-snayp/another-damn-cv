import { useEffect, useState } from "react";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import { useSetActiveBullet } from "./bulletFocus";
import { RichEditor } from "../text/RichEditor";
import { Marked } from "../text/Marked";
import { withoutMarks } from "../text/marks";
import { careerApi } from "./careerApi";
import { AiBadge, AiBox } from "./AiBox";

/** A summary's length, in characters: 3 or 4 sentences, 60 to 120 words. */
const LENGTH = { min: 400, max: 800 } as const;
/** A number left for the person to fill: "[X]", "[N]". */
const PLACEHOLDER = /\[[A-Z]\]/;

/**
 * The Profile's professional summary, edited in place as Teal does it: "Edit
 * Professional Summary", its length against the target, Write (or Improve)
 * with AI from the whole Profile, Cancel and Save; the panel beside the page
 * checks it as it is written.
 */
export function SummaryEditor({
  summary,
  keywords,
  disabled,
  onSave,
}: {
  summary: string;
  /** Every technology and skill on the Profile: what "Keywords" looks for. */
  keywords: string[];
  disabled: boolean;
  /** Saves the summary on the latest Profile; rejects with a message when it cannot. */
  onSave(text: string): Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setActive = useSetActiveBullet();
  useEffect(() => {
    setActive(editing === null ? null : { kind: "summary", text: withoutMarks(editing), keywords, job: "Professional summary" });
    // The text decides it; the keywords are read as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const close = () => {
    setEditing(null);
    setAi(false);
    setError("");
  };

  async function save() {
    if (editing === null || PLACEHOLDER.test(editing)) return;
    const text = editing.trim();
    if (text === summary.trim()) return close();
    setBusy(true);
    setError("");
    try {
      await onSave(text);
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const length = withoutMarks(editing ?? "").trim().length;
  const mode = (editing ?? "").trim() ? "improve" : "write";
  return (
    <section className="profile-panel summary-card" aria-labelledby="profile-summary-heading">
      <div className="profile-panel-heading">
        <h2 id="profile-summary-heading">{editing !== null ? "Edit Professional Summary" : "Professional summary"}</h2>
        {editing === null && (
          <button className="profile-edit-button" aria-label="Edit profile summary" title="Edit" disabled={disabled} onClick={() => setEditing(summary)}>
            <Icon name="edit" size={16} />
          </button>
        )}
      </div>
      {editing !== null ? (
        <div className="summary-edit">
          <p className={`summary-length${length && (length < LENGTH.min || length > LENGTH.max) ? " is-off" : ""}`}>
            Length {length} / {LENGTH.min} - {LENGTH.max}
          </p>
          <div className="ach-editor">
            <RichEditor
              label="Professional summary"
              multiline
              autoFocus
              placeholder="Your title, years of experience, core stack and your strongest result, in 3 or 4 sentences. Or let AI write a draft from your Profile."
              value={editing}
              onChange={setEditing}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
            />
            <div className="summary-tools">
              {!ai && (
                <button type="button" className="ai-write ach-ai-button" disabled={busy} onClick={() => setAi(true)}>
                  {mode === "improve" ? "Improve with AI" : "Write with AI"} <AiBadge />
                </button>
              )}
            </div>
          </div>
          {PLACEHOLDER.test(editing) && <p className="ach-placeholder-note">Replace [X] and [N] with your own numbers to save.</p>}
          <div className="ach-editor-actions">
            <span className="ach-actions-gap" />
            <button type="button" className="profile-text-button" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button type="button" className="ach-save" disabled={busy || PLACEHOLDER.test(editing)} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          {ai && (
            <AiBox
              subject="summary"
              mode={mode}
              text={editing}
              autoStart
              tabs={["automatic", "keywords", "custom"]}
              keywordChoices={keywords}
              run={async (request) =>
                (await careerApi.assistSummary({ mode, text: editing, keywords: request.keywords, instruction: request.instruction })).options
              }
              onUse={(next) => {
                setEditing(next);
                setAi(false);
              }}
              onClose={() => setAi(false)}
            />
          )}
          {error && <p className="profile-error" role="alert">{error}</p>}
        </div>
      ) : summary ? (
        <div className="profile-body">
          <Marked text={summary} />
        </div>
      ) : (
        <p className="profile-empty-line">Your title, years of experience, core stack and strongest result, in 3 or 4 sentences.</p>
      )}
    </section>
  );
}
