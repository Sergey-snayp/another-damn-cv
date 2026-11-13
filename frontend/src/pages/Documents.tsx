import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { resumeApi, type ResumeSummary } from '../resumeApi';
import { onResumesChanged } from '../extensionBridge';
import { importCv, draftFromImport } from '../resume/fromImport';
import { NewResumeDialog } from '../documents/NewResumeDialog';
import { createCopy, createFromProfile } from '../documents/newResume';
import {
  DocumentFilters,
  type ResumeType,
  type SortBy,
  type SortOrder,
} from '../documents/DocumentFilters';
import { DocumentIcon } from '../documents/DocumentIcon';
import { DocumentPopover } from '../documents/DocumentPopover';
import {
  DocumentLibraryToolbar,
  DocumentLibraryCard,
  DocumentLibraryLoading,
  DocumentLibrarySelection,
  NewDocumentCard,
} from '../documents/DocumentLibrary';
import { DocumentPreview } from '../documents/DocumentPreview';
import '../documents/documents.css';

interface Preferences {
  version: 1;
  type: ResumeType;
  sortBy: SortBy;
  order: SortOrder;
  pins: Record<string, boolean>;
}
const defaults: Preferences = {
  version: 1,
  type: 'all',
  sortBy: 'updatedAt',
  order: 'desc',
  pins: {},
};
const importStages = [
  'Reading your CV…',
  'Extracting the text…',
  'Building your draft…',
  'Finishing your draft…',
];

function readPreferences(key: string): Preferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem(key) ?? 'null',
    ) as Partial<Preferences> | null;
    if (!stored || typeof stored !== 'object') return defaults;
    return {
      version: 1,
      // Older preferences persisted the implicit "My resumes" filter. Start
      // with the complete library once, then remember deliberate filters.
      type:
        stored.version === 1 &&
        ['mine', 'generated', 'all'].includes(stored.type ?? '')
          ? stored.type!
          : defaults.type,
      sortBy: ['updatedAt', 'createdAt', 'name'].includes(stored.sortBy ?? '')
        ? stored.sortBy!
        : defaults.sortBy,
      order: ['asc', 'desc'].includes(stored.order ?? '')
        ? stored.order!
        : defaults.order,
      pins: Object.fromEntries(
        Object.entries(stored.pins ?? {}).filter(
          ([, value]) => typeof value === 'boolean',
        ),
      ),
    };
  } catch {
    return defaults;
  }
}

export function timeAgo(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

export function Documents() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const storageKey = `documents-library:${user?.id ?? 'local'}`;
  const [preferences, setPreferences] = useState(() =>
    readPreferences(storageKey),
  );
  const [rows, setRows] = useState<ResumeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [importing, setImporting] = useState(false);
  const [importStage, setImportStage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const createTrigger = useRef<HTMLElement | null>(null);
  const closePanel = () => setPanel(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoadFailed(false);
    void resumeApi
      .list()
      .then((resumes) => {
        if (active) setRows(resumes);
      })
      .catch((err: unknown) => {
        if (active) {
          setLoadFailed(true);
          setError(
            err instanceof Error ? err.message : 'Could not load your resumes.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible')
        setReload((value) => value + 1);
    };
    const unsubscribe = onResumesChanged(refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // Also pick up changes made directly through the backend or extension.
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Storage may be unavailable. */
    }
  }, [preferences, storageKey]);

  useEffect(() => {
    if (!importing) return;
    setImportStage(0);
    const timer = setInterval(
      () =>
        setImportStage((stage) => Math.min(stage + 1, importStages.length - 1)),
      15_000,
    );
    return () => clearInterval(timer);
  }, [importing]);

  // CVs the type filter hides, so the page can say so instead of looking empty.
  const hiddenByType = (rows ?? []).filter((row) => {
    const generated = Boolean(row.jobId || row.sourceResumeId);
    return (
      (preferences.type === 'mine' && generated) ||
      (preferences.type === 'generated' && !generated)
    );
  }).length;

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const matches = (rows ?? []).filter((row) => {
      const generated = Boolean(row.jobId || row.sourceResumeId);
      if (preferences.type === 'mine' && generated) return false;
      if (preferences.type === 'generated' && !generated) return false;
      return `${row.name} ${row.targetRole ?? ''}`
        .toLocaleLowerCase()
        .includes(search);
    });
    return matches.sort((a, b) => {
      const pin =
        Number(preferences.pins[b.id] ?? b.isPrimary) -
        Number(preferences.pins[a.id] ?? a.isPrimary);
      if (pin) return pin;
      const comparison =
        preferences.sortBy === 'name'
          ? a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          : new Date(a[preferences.sortBy] ?? a.updatedAt).getTime() -
            new Date(b[preferences.sortBy] ?? b.updatedAt).getTime();
      return (
        (preferences.order === 'asc' ? comparison : -comparison) ||
        a.id.localeCompare(b.id)
      );
    });
  }, [rows, query, preferences]);

  function pin(row: ResumeSummary) {
    setPreferences((current) => ({
      ...current,
      pins: {
        ...current.pins,
        [row.id]: !(current.pins[row.id] ?? row.isPrimary),
      },
    }));
  }

  /** "Make default": the master CV the others are tailored from, offered first by the extension. */
  async function makeDefault(row: ResumeSummary) {
    setError(null);
    try {
      await resumeApi.makeDefault(row.id);
      setRows((current) => current && current.map((item) => ({ ...item, isPrimary: item.id === row.id })));
    } catch (err) {
      setError(`Could not make "${row.name}" the default: ${(err as Error).message}`);
    }
  }

  /** Deletes after asking; the CV, its versions and its PDF are gone for good. */
  async function remove(ids: string[]) {
    const names = (rows ?? [])
      .filter((row) => ids.includes(row.id))
      .map((row) => row.name);
    if (!names.length) return;
    const what =
      names.length === 1 ? `"${names[0]}"` : `${names.length} resumes`;
    if (
      !confirm(
        `Delete ${what}? Its versions and PDF are deleted too. This cannot be undone.`,
      )
    )
      return;
    setError(null);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await resumeApi.remove(id);
      } catch {
        failed.push(id);
      }
    }
    setRows(
      (current) =>
        current &&
        current.filter(
          (row) => !ids.includes(row.id) || failed.includes(row.id),
        ),
    );
    setSelected(new Set(failed));
    // The default deleted: the server has passed it on to another CV.
    void resumeApi.list().then(setRows).catch(() => undefined);
    if (failed.length)
      setError(
        `${failed.length === 1 ? 'One resume' : `${failed.length} resumes`} could not be deleted. Try again.`,
      );
  }

  function openCreate(trigger: HTMLElement) {
    createTrigger.current =
      trigger.closest('.documents-popover-anchor')?.querySelector('button') ??
      trigger;
    closePanel();
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
    requestAnimationFrame(() => createTrigger.current?.focus());
  }

  async function upload(file: File) {
    if (importing) return;
    setImporting(true);
    setError(null);
    setLoadFailed(false);
    try {
      if (file.size >= 10 * 1024 * 1024)
        throw new Error('Choose a CV smaller than 10 MB.');
      const draft = draftFromImport(await importCv(file));
      const created = await resumeApi.create(
        file.name.replace(/\.[^.]+$/, '') || 'Imported CV',
      );
      sessionStorage.setItem(
        `resume-draft:${created.id}`,
        JSON.stringify(draft),
      );
      navigate(`/documents/${created.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not import this CV.',
      );
    } finally {
      setImporting(false);
    }
  }

  const filtered = query.trim() !== '' || preferences.type !== 'all';

  return (
    <section className="documents-page" aria-label="Documents">
      <DocumentLibraryToolbar
        query={query}
        onQuery={setQuery}
        panel={panel}
        onPanel={setPanel}
        addMenu={
          <>
            <button
              type="button"
              className="documents-menu-item"
              disabled={importing}
              onClick={(event) => openCreate(event.currentTarget)}
            >
              <DocumentIcon name="file" />
              <span>New Resume</span>
            </button>
            <div className="documents-menu-divider" />
            <button
              type="button"
              className="documents-menu-item"
              disabled={importing}
              onClick={() => {
                closePanel();
                fileInput.current?.click();
              }}
            >
              <DocumentIcon name="upload" />
              <span>Upload</span>
            </button>
          </>
        }
        filters={
          <DocumentFilters
            type={preferences.type}
            sortBy={preferences.sortBy}
            order={preferences.order}
            onType={(type) =>
              setPreferences((current) => ({ ...current, type }))
            }
            onSort={(sortBy) =>
              setPreferences((current) => ({ ...current, sortBy }))
            }
            onOrder={(order) =>
              setPreferences((current) => ({ ...current, order }))
            }
          />
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />

      {error && (
        <div className="documents-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() =>
              loadFailed ? setReload((value) => value + 1) : setError(null)
            }
          >
            {loadFailed ? 'Try again' : 'Dismiss'}
          </button>
        </div>
      )}
      {importing && (
        <div className="documents-import-status" role="status">
          <span className="documents-spinner" />
          <div>
            <strong>{importStages[importStage]}</strong>
            <span>
              This can take a minute. You’ll review the draft before saving.
            </span>
          </div>
        </div>
      )}

      <DocumentLibrarySelection
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onDelete={() => void remove([...selected])}
        onPin={() => {
          setPreferences((current) => ({
            ...current,
            pins: {
              ...current.pins,
              ...Object.fromEntries([...selected].map((id) => [id, true])),
            },
          }));
          setSelected(new Set());
        }}
      />

      {hiddenByType > 0 && (
        <div className="documents-hidden-note" role="status">
          <span>
            {hiddenByType === 1 ? '1 resume is' : `${hiddenByType} resumes are`}{' '}
            hidden by the filter
            {preferences.type === 'mine'
              ? ': made for a job by tailoring.'
              : ': your own resumes.'}
          </span>
          <button
            type="button"
            onClick={() =>
              setPreferences((current) => ({ ...current, type: 'all' }))
            }
          >
            Show all
          </button>
        </div>
      )}

      <div className="documents-grid" aria-busy={rows === null && !error}>
        <NewDocumentCard
          title="New Resume"
          label="Create a new resume"
          disabled={importing}
          onClick={(event) => openCreate(event.currentTarget)}
        />
        {!rows && !error && <DocumentLibraryLoading />}

        {visible.map((row) => {
          const pinned = preferences.pins[row.id] ?? row.isPrimary;
          const checked = selected.has(row.id);
          return (
            <DocumentLibraryCard
              key={row.id}
              title={row.name}
              to={`/documents/${row.id}`}
              preview={<DocumentPreview row={row} />}
              pinned={pinned}
              selected={checked}
              onPin={() => pin(row)}
              onSelect={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.delete(row.id);
                  else next.add(row.id);
                  return next;
                })
              }
            >
              <div className="documents-card-info">
                <Link
                  className="documents-card-title"
                  to={`/documents/${row.id}`}
                  title={row.name}
                >
                  {row.name}
                </Link>
                <DocumentPopover
                  open={panel === row.id}
                  onToggle={() => setPanel(panel === row.id ? null : row.id)}
                  onClose={closePanel}
                  label={`More actions for ${row.name}`}
                  className="documents-card-more"
                  trigger={<DocumentIcon name="more" size={18} />}
                >
                  <Link
                    className="documents-menu-item"
                    to={`/documents/${row.id}`}
                  >
                    <DocumentIcon name="file" />
                    <span>Edit resume</span>
                  </Link>
                  <Link
                    className="documents-menu-item"
                    to={`/documents/${row.id}/history`}
                  >
                    <DocumentIcon name="history" />
                    <span>Version history</span>
                  </Link>
                  {row.hasTailoring && (
                    <Link
                      className="documents-menu-item"
                      to={`/documents/${row.id}/tailor`}
                    >
                      <DocumentIcon name="arrow" />
                      <span>Review suggestions</span>
                    </Link>
                  )}
                  <div className="documents-menu-divider" />
                  {!row.isPrimary && (
                    <button
                      type="button"
                      className="documents-menu-item"
                      onClick={() => {
                        closePanel();
                        void makeDefault(row);
                      }}
                    >
                      <DocumentIcon name="default" />
                      <span>Make default</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="documents-menu-item"
                    onClick={() => {
                      pin(row);
                      closePanel();
                    }}
                  >
                    <DocumentIcon name="star" filled={pinned} />
                    <span>{pinned ? 'Unpin resume' : 'Pin to top'}</span>
                  </button>
                  <button
                    type="button"
                    className="documents-menu-item documents-danger"
                    onClick={() => {
                      closePanel();
                      void remove([row.id]);
                    }}
                  >
                    <DocumentIcon name="trash" />
                    <span>Delete</span>
                  </button>
                </DocumentPopover>
                <p className="documents-card-meta">
                  {row.isPrimary && (
                    <span className="documents-default" title="Your master CV: new jobs start from it">
                      Default
                    </span>
                  )}
                  <time
                    dateTime={row.updatedAt}
                    title={new Date(row.updatedAt).toLocaleString()}
                  >
                    {timeAgo(row.updatedAt)}
                  </time>
                  <span aria-hidden="true">·</span>
                  <span>
                    {!row.currentSnapshotId
                      ? 'Draft'
                      : row.jobId || row.sourceResumeId
                        ? 'For a job'
                        : 'Resume'}
                  </span>
                </p>
              </div>
            </DocumentLibraryCard>
          );
        })}
      </div>

      {/* Only for a search or filter that finds nothing: an empty library has its New Resume card. */}
      {rows && visible.length === 0 && filtered && (
        <div className="documents-empty" role="status">
          <h2>No matching resumes</h2>
          <p>Try another name or change your resume filters.</p>
          {(
            <button
              type="button"
              className="documents-control"
              onClick={() => {
                setQuery('');
                setPreferences((current) => ({ ...current, type: 'all' }));
              }}
            >
              Show all resumes
            </button>
          )}
        </div>
      )}
      {rows && filtered && visible.length > 0 && (
        <p className="documents-result-count" role="status">
          {visible.length} {visible.length === 1 ? 'resume' : 'resumes'}
        </p>
      )}
      {creating && (
        <NewResumeDialog
          resumes={rows}
          onClose={closeCreate}
          onProfile={async () => navigate(`/documents/${await createFromProfile()}`)}
          onCopy={async (resume) => navigate(`/documents/${await createCopy(resume)}`)}
          onUpload={() => {
            setCreating(false);
            fileInput.current?.click();
          }}
        />
      )}
    </section>
  );
}
