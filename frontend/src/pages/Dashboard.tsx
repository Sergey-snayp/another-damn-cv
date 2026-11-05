import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_STATUSES,
  STATUS_LABELS,
  jobName,
  jobsApi,
  type ApplicationInput,
  type JobStatus,
  type JobSummary,
} from '../jobsApi';
import { resumeApi, type ResumeSummary } from '../resumeApi';
import { useAuth } from '../AuthContext';
import { Board } from '../jobs/Board';
import { ApplicationList } from '../jobs/ApplicationList';
import { ApplicationCharts } from '../jobs/ApplicationCharts';
import { AddApplicationDrawer } from '../jobs/AddApplicationDrawer';
import { ImportApplicationsDialog } from '../jobs/ImportApplicationsDialog';
import { DashboardOptions } from '../jobs/DashboardOptions';
import { DashboardIcon } from '../jobs/DashboardIcon';
import type { ApplicationActions } from '../jobs/ApplicationCard';
import {
  jobType,
  needsReview,
  readDashboardPreferences,
  visibleApplications,
  type DashboardPreferences,
  type DashboardScope,
  type DashboardView,
} from '../jobs/dashboardState';
import { downloadApplications } from '../jobs/csv';
import '../jobs/dashboard.css';

type Notice = {
  text: string;
  undo?:
    | { kind: 'move'; id: string; eventId: string }
    | { kind: 'archive'; ids: string[]; archived: boolean };
};

export function Dashboard() {
  const { user } = useAuth();
  const storageKey = `application-dashboard:${user?.id ?? 'local'}`;
  const [preferences, setPreferences] = useState(() =>
    readDashboardPreferences(storageKey),
  );
  const [scope, setScope] = useState<DashboardScope>('active');
  const [rows, setRows] = useState<JobSummary[] | null>(null);
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(new Set<string>());
  const [exporting, setExporting] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  // Applications waiting for the delete confirmation.
  const [deleting, setDeleting] = useState<JobSummary[] | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const archiveDialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    const jobs = await jobsApi.list();
    setRows((current) =>
      jobs.map((job) =>
        inFlight.current.has(job.id)
          ? (current?.find((row) => row.id === job.id) ?? job)
          : job,
      ),
    );
    setError(null);
  }, []);
  useEffect(() => {
    let active = true;
    jobsApi
      .list()
      .then((jobs) => {
        if (active) setRows(jobs);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    resumeApi
      .list()
      .then((list) => {
        if (active) setResumes(list);
      })
      .catch(() => {
        if (active) setResumes([]);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Preferences are optional. */
    }
  }, [storageKey, preferences]);
  const pending = rows?.some((job) => job.extraction === 'pending') ?? false;
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      void refresh().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [pending, rows, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const dialog = archiveDialog.current;
    if (confirmAll) dialog?.showModal();
    else dialog?.close();
  }, [confirmAll]);
  useEffect(() => {
    const dialog = deleteDialog.current;
    if (deleting) dialog?.showModal();
    else dialog?.close();
  }, [deleting]);

  const change = (patch: Partial<DashboardPreferences>) =>
    setPreferences((current) => ({ ...current, ...patch }));
  const visible = useMemo(
    () =>
      visibleApplications(rows ?? [], scope, query, preferences, reviewOnly),
    [rows, scope, query, preferences, reviewOnly],
  );
  const scoped = (rows ?? []).filter(
    (job) => (scope === 'archived') === Boolean(job.archivedAt),
  );
  const activeCount = rows?.filter((job) => !job.archivedAt).length;
  const archivedCount = rows?.filter((job) => job.archivedAt).length;
  const reviewCount = (rows ?? []).filter(
    (job) => !job.archivedAt && needsReview(job),
  ).length;
  const types = [
    ...new Set([
      'Full-Time',
      'Part-Time',
      'Contract',
      'Temporary',
      'Internship',
      'Freelance',
      ...(rows ?? []).map((job) => jobType(job.employmentType)),
    ]),
  ];
  const columns = ALL_STATUSES.filter(
    (status) =>
      preferences.columns.includes(status) ||
      (!preferences.customColumns &&
        scoped.some((job) => job.status === status)),
  );
  const companies = [
    ...new Set(
      (rows ?? [])
        .map((job) => job.company)
        .filter((company): company is string => Boolean(company)),
    ),
  ].sort();
  const activeFilters =
    preferences.favoritesOnly ||
    preferences.statuses.length > 0 ||
    preferences.types.length > 0 ||
    Boolean(preferences.appliedFrom || preferences.appliedUntil) ||
    reviewOnly;

  function lock(ids: string[]) {
    ids.forEach((id) => inFlight.current.add(id));
    setBusyIds(new Set(inFlight.current));
  }
  function unlock(ids: string[]) {
    ids.forEach((id) => inFlight.current.delete(id));
    setBusyIds(new Set(inFlight.current));
  }
  function replace(id: string, patch: Partial<JobSummary>) {
    setRows(
      (current) =>
        current?.map((row) => (row.id === id ? { ...row, ...patch } : row)) ??
        current,
    );
  }
  async function move(job: JobSummary, status: JobStatus) {
    if (job.status === status || inFlight.current.has(job.id)) return;
    lock([job.id]);
    setError(null);
    replace(job.id, { status });
    try {
      const saved = await jobsApi.update(job.id, { status });
      replace(job.id, saved);
      const event = saved.history[0];
      setNotice({
        text: `Moved ${jobName(job)} to ${STATUS_LABELS[status]}.`,
        ...(event && event.to === status
          ? { undo: { kind: 'move' as const, id: job.id, eventId: event.id } }
          : {}),
      });
    } catch (err) {
      replace(job.id, job);
      setError(
        err instanceof Error ? err.message : 'Could not move this application.',
      );
    } finally {
      unlock([job.id]);
    }
  }
  /** Deletes applications for good, one request each. Ones that fail stay on the board. */
  async function removeJobs(jobs: JobSummary[]) {
    const ids = jobs.map((job) => job.id).filter((id) => !inFlight.current.has(id));
    if (!ids.length) return;
    lock(ids);
    setError(null);
    const removed: string[] = [];
    try {
      for (const id of ids) {
        await jobsApi.remove(id);
        removed.push(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this application.');
    } finally {
      setRows((current) => current?.filter((row) => !removed.includes(row.id)) ?? current);
      setSelected((current) => new Set([...current].filter((id) => !removed.includes(id))));
      unlock(ids);
      if (removed.length) {
        const only = jobs.find((job) => job.id === removed[0]);
        setNotice({ text: removed.length === 1 && only ? `Deleted ${jobName(only)}.` : `Deleted ${removed.length} applications.` });
      }
    }
  }
  async function updatePreferences(
    ids: string[],
    edit: { favorite?: boolean; archived?: boolean },
    offerUndo = true,
  ) {
    if (!ids.length || ids.some((id) => inFlight.current.has(id))) return;
    lock(ids);
    setError(null);
    try {
      for (let offset = 0; offset < ids.length; offset += 1000) {
        const saved = await jobsApi.preferences(
          ids.slice(offset, offset + 1000),
          edit,
        );
        const patches = new Map(saved.map((job) => [job.id, job]));
        setRows(
          (current) =>
            current?.map((job) =>
              patches.has(job.id) ? { ...job, ...patches.get(job.id)! } : job,
            ) ?? current,
        );
      }
      setSelected(new Set());
      if (edit.archived !== undefined && offerUndo)
        setNotice({
          text: `${ids.length === 1 ? 'Application' : `${ids.length} applications`} ${edit.archived ? 'archived' : 'restored'}.`,
          undo: { kind: 'archive', ids, archived: !edit.archived },
        });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not update the applications.',
      );
      await refresh().catch(() => {});
    } finally {
      unlock(ids);
    }
  }
  async function undo() {
    const action = notice?.undo;
    if (!action) return;
    setNotice(null);
    if (action.kind === 'archive') {
      await updatePreferences(action.ids, { archived: action.archived }, false);
      return;
    }
    lock([action.id]);
    try {
      const saved = await jobsApi.undoStatus(action.id, action.eventId);
      replace(action.id, saved);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not undo this move.',
      );
      await refresh().catch(() => {});
    } finally {
      unlock([action.id]);
    }
  }
  const actions: ApplicationActions = {
    onMove: (job, status) => void move(job, status),
    onFavorite: (job) =>
      void updatePreferences([job.id], { favorite: !job.isFavorite }),
    onArchive: (job) =>
      void updatePreferences([job.id], { archived: !job.archivedAt }),
    onDelete: (job) => setDeleting([job]),
    busyIds,
    managing,
    selected,
    onSelect: (id) =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
  };
  function setView(view: DashboardView) {
    change({ view });
    setOptionsOpen(false);
  }
  function setTab(next: DashboardScope) {
    setScope(next);
    setReviewOnly(false);
    setSelected(new Set());
    setOptionsOpen(false);
  }
  async function add(input: ApplicationInput) {
    const saved = await jobsApi.addApplication(input);
    setRows((current) => [
      { ...saved, tailoredResumeId: null },
      ...(current ?? []),
    ]);
    setAdding(false);
    setScope(input.archived ? 'archived' : 'active');
    setQuery('');
    setReviewOnly(false);
    change({
      favoritesOnly: false,
      statuses: [],
      types: [],
      appliedFrom: '',
      appliedUntil: '',
      columns: [...new Set([...columns, saved.status])],
    });
    setNotice({ text: `${jobName(saved)} added.` });
    addButton.current?.focus();
  }
  async function importRows(input: ApplicationInput[]) {
    const result = await jobsApi.importApplications(input);
    await refresh();
    setImporting(false);
    setNotice({
      text: `Imported ${result.imported} ${result.imported === 1 ? 'application' : 'applications'}${result.skipped ? `; skipped ${result.skipped} existing job ${result.skipped === 1 ? 'link' : 'links'}` : ''}.`,
    });
  }
  async function exportRows() {
    setOptionsOpen(false);
    if (!visible.length) {
      setNotice({ text: 'No matching applications to export.' });
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const ids = new Set(visible.map((job) => job.id));
      const exported = (await jobsApi.exportApplications()).filter((job) =>
        ids.has(job.id),
      );
      downloadApplications(exported);
      setNotice({ text: `Exported ${exported.length} applications.` });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not export the applications.',
      );
    } finally {
      setExporting(false);
    }
  }
  function clearFilters() {
    setQuery('');
    setReviewOnly(false);
    change({
      favoritesOnly: false,
      statuses: [],
      types: [],
      appliedFrom: '',
      appliedUntil: '',
    });
  }
  const selectedCount = selected.size;

  return (
    <section
      className={`dashboard-page${reviewCount && scope === 'active' ? ' has-review' : ''}`}
      aria-label="Dashboard"
    >
      <h1 className="dashboard-sr-only">Dashboard</h1>
      <div className="dashboard-top-row">
        <div
          className="dashboard-segmented dashboard-scopes"
          role="group"
          aria-label="Application collection"
        >
          <button
            type="button"
            className={scope === 'active' ? 'is-active' : ''}
            aria-pressed={scope === 'active'}
            onClick={() => setTab('active')}
          >
            Active <span>({activeCount ?? '—'})</span>
          </button>
          <button
            type="button"
            className={scope === 'archived' ? 'is-active' : ''}
            aria-pressed={scope === 'archived'}
            onClick={() => setTab('archived')}
          >
            Archived <span>({archivedCount ?? '—'})</span>
          </button>
        </div>
        <button
          type="button"
          className="dashboard-control dashboard-primary dashboard-add"
          ref={addButton}
          onClick={() => setAdding(true)}
        >
          <DashboardIcon name="plus" />
          <span>Add application</span>
        </button>
      </div>
      <div className="dashboard-toolbar">
        <label className="dashboard-search">
          <DashboardIcon name="search" size={21} />
          <span className="dashboard-sr-only">
            Search for roles or companies
          </span>
          <input
            type="search"
            placeholder="Search for roles or companies"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="dashboard-icon-button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <DashboardIcon name="close" size={16} />
            </button>
          )}
        </label>
        <div
          className="dashboard-segmented dashboard-views"
          role="group"
          aria-label="Dashboard view"
        >
          {(['board', 'list', 'chart'] as const).map((view) => (
            <button
              type="button"
              key={view}
              className={preferences.view === view ? 'is-active' : ''}
              aria-pressed={preferences.view === view}
              onClick={() => setView(view)}
            >
              <DashboardIcon name={view} />
              <span>{view.charAt(0).toUpperCase() + view.slice(1)}</span>
            </button>
          ))}
        </div>
        <DashboardOptions
          open={optionsOpen}
          onToggle={() => setOptionsOpen(!optionsOpen)}
          onClose={() => setOptionsOpen(false)}
          preferences={preferences}
          onChange={change}
          types={types}
          columns={columns}
          archived={scope === 'archived'}
          busy={busyIds.size > 0}
          exporting={exporting}
          onManage={() => {
            if (!managing && preferences.view === 'chart')
              change({ view: 'list' });
            setManaging(!managing);
            setSelected(new Set());
            setOptionsOpen(false);
          }}
          onImport={() => {
            setOptionsOpen(false);
            setImporting(true);
          }}
          onExport={() => void exportRows()}
          onArchiveAll={() => {
            setOptionsOpen(false);
            if (scoped.length) setConfirmAll(true);
            else setNotice({ text: `No ${scope} applications.` });
          }}
        />
      </div>
      {reviewCount > 0 && scope === 'active' && (
        <div className="dashboard-review-banner">
          <span className="dashboard-review-icon">
            <DashboardIcon name="briefcase" size={24} />
          </span>
          <div>
            <strong>
              {reviewCount}{' '}
              {reviewCount === 1 ? 'application needs' : 'applications need'}{' '}
              review
            </strong>
            <p>
              Some captured applications are missing details. Add the missing
              information or archive them.
            </p>
          </div>
          <button
            type="button"
            className="dashboard-control"
            onClick={() => {
              setReviewOnly(true);
              change({
                view: 'list',
                statuses: [],
                types: [],
                favoritesOnly: false,
                appliedFrom: '',
                appliedUntil: '',
              });
              setQuery('');
            }}
          >
            Review {reviewCount}{' '}
            {reviewCount === 1 ? 'application' : 'applications'}
            <DashboardIcon name="arrow" />
          </button>
        </div>
      )}
      {error && (
        <div className="dashboard-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="dashboard-text-button"
            onClick={() =>
              void refresh().catch((err: Error) => setError(err.message))
            }
          >
            Try again
          </button>
        </div>
      )}
      {activeFilters || query ? (
        <div className="dashboard-filter-summary">
          <span>
            {visible.length} matching{' '}
            {visible.length === 1 ? 'application' : 'applications'}
            {reviewOnly ? ' · Needs review' : ''}
            {preferences.favoritesOnly ? ' · Favorites' : ''}
          </span>
          <button
            type="button"
            className="dashboard-text-button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : null}
      {managing && (
        <div className="dashboard-manage-bar">
          <label>
            <input
              type="checkbox"
              aria-label="Select all visible applications"
              checked={
                visible.length > 0 &&
                visible.every((job) => selected.has(job.id))
              }
              onChange={() =>
                setSelected(
                  visible.length > 0 &&
                    visible.every((job) => selected.has(job.id))
                    ? new Set()
                    : new Set(visible.map((job) => job.id)),
                )
              }
            />
            {selectedCount} selected
          </label>
          <button
            type="button"
            disabled={!selectedCount || busyIds.size > 0}
            onClick={() =>
              void updatePreferences([...selected], { favorite: true })
            }
          >
            <DashboardIcon name="heart" size={17} />
            Favorite selected
          </button>
          <button
            type="button"
            disabled={!selectedCount || busyIds.size > 0}
            onClick={() =>
              void updatePreferences([...selected], {
                archived: scope !== 'archived',
              })
            }
          >
            <DashboardIcon
              name={scope === 'archived' ? 'restore' : 'archive'}
              size={17}
            />
            {scope === 'archived' ? 'Restore selected' : 'Archive selected'}
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={!selectedCount || busyIds.size > 0}
            onClick={() => setDeleting((rows ?? []).filter((row) => selected.has(row.id)))}
          >
            <DashboardIcon name="trash" size={17} />
            Delete selected
          </button>
          <button
            type="button"
            className="dashboard-manage-done"
            onClick={() => {
              setManaging(false);
              setSelected(new Set());
            }}
          >
            Done
          </button>
        </div>
      )}
      {preferences.view === 'board' && (
        <Board
          rows={visible}
          columns={columns}
          loading={rows === null && !error}
          actions={actions}
          onHide={(status) =>
            change({
              columns: columns.filter((value) => value !== status),
              customColumns: true,
            })
          }
        />
      )}
      {preferences.view === 'list' && rows && (
        <ApplicationList rows={visible} actions={actions} />
      )}
      {preferences.view === 'chart' && rows && (
        <ApplicationCharts
          rows={visible}
          onStatus={(status) => {
            change({ statuses: [status], view: 'list' });
            setReviewOnly(false);
          }}
        />
      )}
      {preferences.view !== 'board' && !rows && !error && (
        <div className="dashboard-loading" role="status">
          Loading applications…
        </div>
      )}
      {rows && visible.length === 0 && (
        <div className="dashboard-empty" role="status">
          <h2>
            {scope === 'archived' && !archivedCount
              ? 'No archived applications'
              : activeFilters || query
                ? 'No matching applications'
                : 'Your next opportunity starts here.'}
          </h2>
          <p>
            {scope === 'archived' && !archivedCount
              ? 'Applications you archive will appear here. You can restore them at any time.'
              : activeFilters || query
                ? 'Try a different search or clear your filters.'
                : 'Add an application, import a CSV, or send a job from the extension.'}
          </p>
        </div>
      )}
      {adding && (
        <AddApplicationDrawer
          resumes={resumes}
          companies={companies}
          onClose={() => {
            setAdding(false);
            requestAnimationFrame(() => addButton.current?.focus());
          }}
          onAdd={add}
        />
      )}
      {importing && (
        <ImportApplicationsDialog
          onClose={() => setImporting(false)}
          onImport={importRows}
        />
      )}
      <dialog
        className="dashboard-dialog"
        ref={archiveDialog}
        aria-labelledby="archive-all-title"
        onCancel={(event) => {
          event.preventDefault();
          setConfirmAll(false);
        }}
      >
        <header>
          <h2 id="archive-all-title">
            {scope === 'archived' ? 'Restore' : 'Archive'} all applications?
          </h2>
          <button
            type="button"
            className="dashboard-icon-button"
            aria-label="Close archive confirmation"
            onClick={() => setConfirmAll(false)}
          >
            <DashboardIcon name="close" />
          </button>
        </header>
        <p>
          {scope === 'archived'
            ? `Restore all ${scoped.length} archived applications to Active? Their statuses will stay the same.`
            : `Move all ${scoped.length} active applications to Archived? Their statuses will stay the same, and you can restore them later.`}
        </p>
        <footer>
          <button
            type="button"
            className="dashboard-control"
            onClick={() => setConfirmAll(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dashboard-control dashboard-primary"
            onClick={() => {
              setConfirmAll(false);
              void updatePreferences(
                scoped.map((job) => job.id),
                { archived: scope !== 'archived' },
              );
            }}
          >
            {scope === 'archived' ? 'Restore all' : 'Archive all'}
          </button>
        </footer>
      </dialog>
      <dialog
        className="dashboard-dialog"
        ref={deleteDialog}
        aria-labelledby="delete-jobs-title"
        onCancel={(event) => {
          event.preventDefault();
          setDeleting(null);
        }}
      >
        <header>
          <h2 id="delete-jobs-title">
            {deleting?.length === 1 ? 'Delete this application?' : `Delete ${deleting?.length ?? 0} applications?`}
          </h2>
          <button
            type="button"
            className="dashboard-icon-button"
            aria-label="Close delete confirmation"
            onClick={() => setDeleting(null)}
          >
            <DashboardIcon name="close" />
          </button>
        </header>
        <p>
          {deleting?.length === 1 && deleting[0] ? `"${jobName(deleting[0])}" and its` : 'These applications and their'} interview prep
          and status history are deleted for good. CVs tailored for {deleting?.length === 1 ? 'it' : 'them'} stay in
          Documents. To keep {deleting?.length === 1 ? 'it' : 'them'} out of the way instead, use Archive.
        </p>
        <footer>
          <button type="button" className="dashboard-control" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="dashboard-control dashboard-danger"
            onClick={() => {
              const jobs = deleting ?? [];
              setDeleting(null);
              void removeJobs(jobs);
            }}
          >
            Delete
          </button>
        </footer>
      </dialog>
      {notice && (
        <div className="dashboard-toast" role="status">
          <span>{notice.text}</span>
          {notice.undo && (
            <button type="button" onClick={() => void undo()}>
              Undo
            </button>
          )}
          <button
            type="button"
            className="dashboard-toast-close"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <DashboardIcon name="close" size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
