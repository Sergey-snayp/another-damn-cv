import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { STATUS_LABELS, type ApplicationInput } from '../jobsApi';
import { DashboardIcon } from './DashboardIcon';
import { parseApplicationsCsv } from './csv';

export function ImportApplicationsDialog({
  onClose,
  onImport,
}: {
  onClose(): void;
  onImport(rows: ApplicationInput[]): Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ApplicationInput[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setRows([]);
    setErrors([]);
    setSubmitError(null);
    setFileName(file.name);
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('Choose a CSV smaller than 2 MB.');
      const parsed = parseApplicationsCsv(await file.text());
      setRows(parsed.rows);
      setErrors(parsed.errors);
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : 'Could not read the CSV.',
      ]);
    }
  }
  async function save() {
    if (!rows.length || errors.length || busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await onImport(rows);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Could not import these applications.',
      );
      setBusy(false);
    }
  }
  return (
    <dialog
      className="dashboard-dialog application-import-dialog"
      ref={dialog}
      aria-labelledby="import-applications-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <header>
        <h2 id="import-applications-title">Import applications</h2>
        <button
          type="button"
          className="dashboard-icon-button"
          aria-label="Close CSV import"
          onClick={onClose}
          disabled={busy}
        >
          <DashboardIcon name="close" />
        </button>
      </header>
      <p>
        Upload a CSV with Position Title and Company columns. You can also
        include Status, Job Type, Location, URL and dates.
      </p>
      <input
        hidden
        type="file"
        accept=".csv,text/csv"
        ref={input}
        onChange={(event) => void read(event)}
      />
      <button
        type="button"
        className="application-csv-upload"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <DashboardIcon name="upload" size={26} />
        <strong>{fileName || 'Choose a CSV file'}</strong>
        <span>Up to 500 applications · 2 MB maximum</span>
      </button>
      {submitError && (
        <p className="dashboard-error" role="alert">
          {submitError}
        </p>
      )}
      {errors.length > 0 && (
        <div className="dashboard-error" role="alert">
          <strong>Check your CSV</strong>
          <ul>
            {errors.slice(0, 8).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
          {errors.length > 8 && <p>And {errors.length - 8} more row errors.</p>}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <p className="application-import-count">
            {rows.length} {rows.length === 1 ? 'application' : 'applications'}{' '}
            found. Existing job links will be skipped.
          </p>
          <div className="application-import-preview">
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Company</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    <td>{row.title || '—'}</td>
                    <td>{row.company || '—'}</td>
                    <td>{STATUS_LABELS[row.status ?? 'saved']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <footer>
        <button
          type="button"
          className="dashboard-control"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="dashboard-control dashboard-primary"
          disabled={busy || !rows.length || errors.length > 0}
          onClick={() => void save()}
        >
          {busy
            ? 'Importing…'
            : `Import${rows.length ? ` ${rows.length}` : ''}`}
        </button>
      </footer>
    </dialog>
  );
}
