import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DocumentIcon } from './DocumentIcon';
import { DocumentKindSwitch } from './DocumentKindSwitch';
import { DocumentPopover } from './DocumentPopover';

/** One toolbar geometry and interaction model for both document libraries. */
export function DocumentLibraryToolbar({
  query,
  onQuery,
  panel,
  onPanel,
  addMenu,
  filters,
}: {
  query: string;
  onQuery(value: string): void;
  panel: string | null;
  onPanel(value: string | null): void;
  addMenu: ReactNode;
  filters: ReactNode;
}) {
  return (
    <>
      <header className="documents-header">
        <h1>Documents</h1>
        <DocumentPopover
          open={panel === 'add'}
          onToggle={() => onPanel(panel === 'add' ? null : 'add')}
          onClose={() => onPanel(null)}
          label="Add document"
          className="documents-add"
          trigger={
            <>
              <DocumentIcon name="plus" size={16} />
              <span>Add</span>
            </>
          }
        >
          {addMenu}
        </DocumentPopover>
      </header>
      <DocumentKindSwitch />
      <div className="documents-toolbar">
        <label className="documents-search">
          <DocumentIcon name="search" size={18} />
          <span className="documents-sr-only">Search documents</span>
          <input
            type="search"
            placeholder="Search documents"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="documents-icon-button"
              aria-label="Clear search"
              onClick={() => onQuery('')}
            >
              <DocumentIcon name="close" size={17} />
            </button>
          )}
        </label>
        <DocumentPopover
          open={panel === 'filters'}
          onToggle={() => onPanel(panel === 'filters' ? null : 'filters')}
          onClose={() => onPanel(null)}
          label="Filter and sort documents"
          className="documents-filter"
          trigger={<DocumentIcon name="filters" size={18} />}
        >
          {filters}
        </DocumentPopover>
      </div>
    </>
  );
}

export function NewDocumentCard({
  title,
  label,
  onClick,
  disabled = false,
}: {
  title: string;
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="documents-new-card"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="documents-new-page">
        <DocumentIcon name="plus" size={32} />
      </span>
      <span className="documents-card-title">{title}</span>
    </button>
  );
}

export function DocumentLibraryLoading() {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <div
          className="documents-card documents-loading-card"
          key={index}
          aria-hidden="true"
        >
          <div className="documents-preview">
            <div className="documents-preview-skeleton">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <span className="documents-loading-label" />
          <span className="documents-loading-label short" />
        </div>
      ))}
    </>
  );
}

export function DocumentLibraryCard({
  title,
  to,
  preview,
  pinned,
  selected,
  onPin,
  onSelect,
  children,
}: {
  title: string;
  to: string;
  preview: ReactNode;
  pinned: boolean;
  selected: boolean;
  onPin(): void;
  onSelect(): void;
  children: ReactNode;
}) {
  return (
    <article className={`documents-card${selected ? ' is-selected' : ''}`}>
      <Link
        className="documents-preview-link"
        to={to}
        aria-label={`Open ${title}`}
      >
        {preview}
      </Link>
      <input
        type="checkbox"
        className="documents-select"
        aria-label={`Select ${title}`}
        checked={selected}
        onChange={onSelect}
      />
      <button
        type="button"
        className={`documents-pin${pinned ? ' is-pinned' : ''}`}
        aria-label={`${pinned ? 'Unpin' : 'Pin'} ${title}`}
        aria-pressed={pinned}
        title={pinned ? 'Unpin document' : 'Pin to top'}
        onClick={onPin}
      >
        <DocumentIcon name="star" size={16} filled={pinned} />
      </button>
      {children}
    </article>
  );
}

export function DocumentLibrarySelection({
  count,
  onPin,
  onDelete,
  onClear,
}: {
  count: number;
  onPin(): void;
  onDelete(): void;
  onClear(): void;
}) {
  if (!count) return null;
  return (
    <div className="documents-selection" aria-live="polite">
      <span>{count} selected</span>
      <button type="button" onClick={onPin}>
        <DocumentIcon name="star" size={15} />
        Pin selected
      </button>
      <button type="button" className="documents-danger" onClick={onDelete}>
        <DocumentIcon name="trash" size={15} />
        Delete selected
      </button>
      <button type="button" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}
