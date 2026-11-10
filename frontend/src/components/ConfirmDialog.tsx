import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import "./confirm-dialog.css";

export interface ConfirmRequest {
  /** "Are you sure you want to remove this position?" */
  title: string;
  /** What else goes with it, in plain words; may hold <b>. */
  body?: ReactNode;
  /** The red button: "Delete position". */
  action: string;
}

type Ask = (request: ConfirmRequest) => Promise<boolean>;
const ConfirmContext = createContext<Ask>(() => Promise.resolve(window.confirm("Delete?")));

/** Asks before something is deleted, in one dialog style everywhere: `if (!(await confirm({...}))) return;` */
export const useConfirm = () => useContext(ConfirmContext);

/** Holds the one delete dialog of the app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmRequest & { answer(yes: boolean): void }) | null>(null);
  const ask = useCallback<Ask>(
    (next) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...next, answer: resolve });
      }),
    [],
  );
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && (
        <ConfirmDialog
          request={request}
          onAnswer={(yes) => {
            request.answer(yes);
            setRequest(null);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ request, onAnswer }: { request: ConfirmRequest; onAnswer(yes: boolean): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onAnswer(false);
      }}
      onClick={(event) => {
        // A click on the dimmed page around it is Cancel.
        if (event.target === event.currentTarget) onAnswer(false);
      }}
    >
      <h2 id="confirm-title">{request.title}</h2>
      {request.body && <div className="confirm-body">{request.body}</div>}
      <footer>
        <button type="button" className="confirm-cancel" autoFocus onClick={() => onAnswer(false)}>
          Cancel
        </button>
        <button type="button" className="confirm-danger" onClick={() => onAnswer(true)}>
          {request.action}
        </button>
      </footer>
    </dialog>
  );
}
