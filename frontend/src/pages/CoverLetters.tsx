import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  coverLetterApi,
  letterTitle,
  type ListedCoverLetter,
} from '../coverLetterApi';
import { DocumentIcon } from '../documents/DocumentIcon';
import { useAuth } from '../AuthContext';
import {
  DocumentLibraryToolbar,
  DocumentLibraryCard,
  DocumentLibraryLoading,
  DocumentLibrarySelection,
  NewDocumentCard,
} from '../documents/DocumentLibrary';
import {
  DocumentFilters,
  type SortBy,
  type SortOrder,
} from '../documents/DocumentFilters';
import { DocumentPopover } from '../documents/DocumentPopover';
import { LETTER_WIDTH, LetterPage } from '../documents/LetterPage';
import { NewCoverLetterDialog } from '../documents/NewCoverLetterDialog';
import { timeAgo } from './Documents';
import '../documents/documents.css';

/** A letter's first page, scaled to its card. */
function LetterPreview({ row }: { row: ListedCoverLetter }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / LETTER_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className="documents-preview letter-preview"
      ref={frame}
      aria-hidden="true"
    >
      <div
        className="letter-preview-paper"
        style={{ transform: `scale(${scale})` }}
      >
        <LetterPage text={row.text} author={row.author} />
      </div>
    </div>
  );
}

interface LetterPreferences {
  sortBy: SortBy;
  order: SortOrder;
  pins: Record<string, boolean>;
}
function readPreferences(key: string): LetterPreferences {
  const defaults: LetterPreferences = {
    sortBy: 'updatedAt',
    order: 'desc',
    pins: {},
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem(key) ?? 'null',
    ) as Partial<LetterPreferences> | null;
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      sortBy: saved.sortBy === 'name' ? 'name' : 'updatedAt',
      order: saved.order === 'asc' ? 'asc' : 'desc',
      pins: Object.fromEntries(
        Object.entries(saved.pins ?? {}).filter(
          ([, value]) => typeof value === 'boolean',
        ),
      ),
    };
  } catch {
    return defaults;
  }
}

/** Shares the resume library's toolbar, card frames and actions. */
export function CoverLetters() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const storageKey = `documents-cover-letters:${user?.id ?? 'local'}`;
  const [preferences, setPreferences] = useState(() =>
    readPreferences(storageKey),
  );
  const [rows, setRows] = useState<ListedCoverLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const createTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    coverLetterApi.list().then(
      (list) => {
        if (active) {
          setRows(list);
          setSelected(
            (current) =>
              new Set(
                [...current].filter((id) =>
                  list.some((row) => row.jobId === id),
                ),
              ),
          );
        }
      },
      (err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load your cover letters.',
          );
      },
    );
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible')
        setReload((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => {
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
  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows ?? [])
      .filter((row) => {
        const haystack =
          `${row.job.company ?? ''} ${row.job.title ?? ''} ${row.text}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .sort((a, b) => {
        const pin =
          Number(preferences.pins[b.jobId] ?? false) -
          Number(preferences.pins[a.jobId] ?? false);
        if (pin) return pin;
        const comparison =
          preferences.sortBy === 'name'
            ? letterTitle(a.job).localeCompare(letterTitle(b.job), undefined, {
                numeric: true,
                sensitivity: 'base',
              })
            : new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        return (
          (preferences.order === 'asc' ? comparison : -comparison) ||
          a.jobId.localeCompare(b.jobId)
        );
      });
  }, [rows, query, preferences]);
  function pin(row: ListedCoverLetter) {
    setPreferences((current) => ({
      ...current,
      pins: { ...current.pins, [row.jobId]: !current.pins[row.jobId] },
    }));
  }
  function openCreate(trigger: HTMLElement) {
    createTrigger.current =
      trigger.closest('.documents-popover-anchor')?.querySelector('button') ??
      trigger;
    setPanel(null);
    setAdding(true);
  }
  function closeCreate() {
    setAdding(false);
    requestAnimationFrame(() => createTrigger.current?.focus());
  }
  async function remove(ids: string[]) {
    setPanel(null);
    const names = (rows ?? [])
      .filter((row) => ids.includes(row.jobId))
      .map((row) => letterTitle(row.job));
    if (!names.length) return;
    if (
      !window.confirm(
        `Delete ${names.length === 1 ? '"' + names[0] + '"' : names.length + ' cover letters'}? This cannot be undone.`,
      )
    )
      return;
    setError(null);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await coverLetterApi.remove(id);
      } catch {
        failed.push(id);
      }
    }
    setRows(
      (current) =>
        current &&
        current.filter(
          (row) => !ids.includes(row.jobId) || failed.includes(row.jobId),
        ),
    );
    setSelected(new Set(failed));
    if (failed.length)
      setError(
        `${failed.length === 1 ? 'One cover letter' : failed.length + ' cover letters'} could not be deleted. Try again.`,
      );
  }
  return (
    <section className="documents-page" aria-label="Documents">
      <DocumentLibraryToolbar
        query={query}
        onQuery={setQuery}
        panel={panel}
        onPanel={setPanel}
        addMenu={
          <button
            type="button"
            className="documents-menu-item"
            onClick={(event) => openCreate(event.currentTarget)}
          >
            <DocumentIcon name="file" />
            <span>New Cover Letter</span>
          </button>
        }
        filters={
          <DocumentFilters
            showResumeType={false}
            showCreated={false}
            sortBy={preferences.sortBy}
            order={preferences.order}
            onSort={(sortBy) =>
              setPreferences((current) => ({ ...current, sortBy }))
            }
            onOrder={(order) =>
              setPreferences((current) => ({ ...current, order }))
            }
          />
        }
      />
      {error && (
        <div className="documents-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Retry
          </button>
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
      <div className="documents-grid" aria-busy={rows === null && !error}>
        <NewDocumentCard
          title="New Cover Letter"
          label="Create a new cover letter"
          onClick={(event) => openCreate(event.currentTarget)}
        />
        {rows === null && !error && <DocumentLibraryLoading />}
        {visible.map((row) => {
          const title = letterTitle(row.job),
            to = `/documents/cover-letters/${encodeURIComponent(row.jobId)}`;
          const pinned = preferences.pins[row.jobId] ?? false,
            checked = selected.has(row.jobId);
          return (
            <DocumentLibraryCard
              key={row.jobId}
              title={title}
              to={to}
              preview={<LetterPreview row={row} />}
              pinned={pinned}
              selected={checked}
              onPin={() => pin(row)}
              onSelect={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.delete(row.jobId);
                  else next.add(row.jobId);
                  return next;
                })
              }
            >
              <div className="documents-card-info">
                <Link className="documents-card-title" to={to} title={title}>
                  {title}
                </Link>
                <DocumentPopover
                  open={panel === row.jobId}
                  onToggle={() =>
                    setPanel(panel === row.jobId ? null : row.jobId)
                  }
                  onClose={() => setPanel(null)}
                  label={`More actions for ${title}`}
                  className="documents-card-more"
                  trigger={<DocumentIcon name="more" size={18} />}
                >
                  <Link className="documents-menu-item" to={to}>
                    <DocumentIcon name="file" />
                    <span>Edit letter</span>
                  </Link>
                  <a
                    className="documents-menu-item"
                    href={coverLetterApi.pdfUrl(row.jobId)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setPanel(null)}
                  >
                    <DocumentIcon name="arrow" />
                    <span>Open PDF</span>
                  </a>
                  <Link
                    className="documents-menu-item"
                    to={`/jobs/${encodeURIComponent(row.jobId)}`}
                  >
                    <DocumentIcon name="history" />
                    <span>Open the job</span>
                  </Link>
                  <div className="documents-menu-divider" />
                  <button
                    type="button"
                    className="documents-menu-item"
                    onClick={() => {
                      pin(row);
                      setPanel(null);
                    }}
                  >
                    <DocumentIcon name="star" filled={pinned} />
                    <span>{pinned ? 'Unpin letter' : 'Pin to top'}</span>
                  </button>
                  <button
                    type="button"
                    className="documents-menu-item documents-danger"
                    onClick={() => void remove([row.jobId])}
                  >
                    <DocumentIcon name="trash" />
                    <span>Delete</span>
                  </button>
                </DocumentPopover>
                <p className="documents-card-meta">
                  <time
                    dateTime={row.updatedAt}
                    title={new Date(row.updatedAt).toLocaleString()}
                  >
                    {timeAgo(row.updatedAt)}
                  </time>
                  <span aria-hidden="true">·</span>
                  <span>Cover letter</span>
                </p>
              </div>
            </DocumentLibraryCard>
          );
        })}
      </div>
      {/* Only for a search that finds nothing: an empty library has its new cover letter card. */}
      {rows && visible.length === 0 && query.trim() && (
        <div className="documents-empty" role="status">
          <h2>No matching cover letters</h2>
          <p>Try another name or clear your search.</p>
          {(
            <button
              type="button"
              className="documents-control"
              onClick={() => setQuery('')}
            >
              Show all cover letters
            </button>
          )}
        </div>
      )}
      {rows && query.trim() && visible.length > 0 && (
        <p className="documents-result-count" role="status">
          {visible.length}{' '}
          {visible.length === 1 ? 'cover letter' : 'cover letters'}
        </p>
      )}
      {adding && (
        <NewCoverLetterDialog
          existing={new Set((rows ?? []).map((row) => row.jobId))}
          onClose={closeCreate}
          onWritten={(letter) =>
            navigate(
              `/documents/cover-letters/${encodeURIComponent(letter.jobId)}`,
              { state: { written: letter } },
            )
          }
        />
      )}
    </section>
  );
}
