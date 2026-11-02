import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { DashboardIcon } from "../jobs/DashboardIcon";
import "./account-menu.css";

export type AccountDialogKind = "settings" | "feedback";

export function AccountDialog({
  kind,
  feedback,
  onFeedbackChange,
  onClose,
}: {
  kind: AccountDialogKind;
  feedback: string;
  onFeedbackChange(value: string): void;
  onClose(): void;
}) {
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function copyFeedback(event: FormEvent) {
    event.preventDefault();
    if (!feedback.trim() || copying) return;
    setNotice("");
    setError("");
    setCopying(true);
    try {
      await navigator.clipboard.writeText(feedback.trim());
      setNotice(
        "Feedback copied. You can paste it where you want to share it.",
      );
    } catch {
      setError("Could not copy. Select your message and copy it manually.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="account-dialog"
      aria-labelledby="account-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="account-dialog-title">
          {kind === "settings" ? "Settings" : "Give feedback"}
        </h2>
        <button
          type="button"
          className="account-dialog-close"
          aria-label={`Close ${kind === "settings" ? "settings" : "feedback"}`}
          onClick={onClose}
        >
          <DashboardIcon name="close" />
        </button>
      </header>
      {kind === "settings" ? (
        <>
          <section>
            <h3>Account</h3>
            <dl>
              <div>
                <dt>Name</dt>
                <dd>{user?.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user?.email}</dd>
              </div>
            </dl>
            <Link
              className="account-dialog-link"
              to="/profile"
              onClick={onClose}
            >
              Edit your profile <DashboardIcon name="arrow" size={16} />
            </Link>
          </section>
          <section>
            <h3>Appearance</h3>
            <p>Light theme with your acid-yellow palette.</p>
          </section>
          <section>
            <h3>Notifications</h3>
            <p>Notification preferences are coming soon.</p>
          </section>
          <footer>
            <button
              type="button"
              className="account-dialog-button"
              onClick={onClose}
            >
              Done
            </button>
          </footer>
        </>
      ) : (
        <form onSubmit={(event) => void copyFeedback(event)}>
          <p>Tell us what could be better, or describe a problem you found.</p>
          <label>
            Your feedback
            <textarea
              autoFocus
              rows={6}
              required
              maxLength={4000}
              value={feedback}
              onChange={(event) => {
                onFeedbackChange(event.target.value);
                setNotice("");
                setError("");
              }}
              placeholder="What happened? What did you expect?"
            />
          </label>
          <p className="account-dialog-hint">
            Copy your message to share it. Nothing is sent automatically. Your
            draft stays here while you use the app.
          </p>
          {notice && (
            <p className="account-dialog-success" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="account-dialog-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="account-dialog-button is-secondary"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="submit"
              className="account-dialog-button"
              disabled={!feedback.trim() || copying}
            >
              {copying ? "Copying…" : "Copy feedback"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
