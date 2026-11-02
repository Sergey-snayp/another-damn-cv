import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DocumentIcon } from './DocumentIcon';

export function CreateResumeDialog({
  onClose,
  onCreate,
}: {
  onClose(): void;
  onCreate(name: string, targetRole?: string): Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), role.trim() || undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create the resume.',
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      className="documents-dialog"
      ref={dialog}
      aria-labelledby="new-resume-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form onSubmit={(event) => void create(event)}>
        <div className="documents-dialog-heading">
          <h2 id="new-resume-title">New resume</h2>
          <button
            type="button"
            className="documents-icon-button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <DocumentIcon name="close" />
          </button>
        </div>
        <p>You can edit every detail later.</p>
        <label>
          Resume name
          <input
            autoFocus
            required
            maxLength={200}
            placeholder="e.g. Backend Engineer"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Target role <span>(optional)</span>
          <input
            maxLength={200}
            placeholder="e.g. Senior Backend Engineer"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="documents-error" role="alert">
            {error}
          </p>
        )}
        <div className="documents-dialog-actions">
          <button
            type="button"
            className="documents-control"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="documents-control documents-control-primary"
            disabled={!name.trim() || busy}
          >
            {busy ? 'Creating…' : 'Create resume'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
