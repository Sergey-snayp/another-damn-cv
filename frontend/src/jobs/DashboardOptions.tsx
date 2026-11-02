import { ALL_STATUSES, STATUS_LABELS, type JobStatus } from '../jobsApi';
import { Popover } from '../components/Popover';
import { DashboardIcon } from './DashboardIcon';
import type { DashboardPreferences, SortField } from './dashboardState';

export function DashboardOptions({
  open,
  onToggle,
  onClose,
  preferences,
  onChange,
  types,
  columns,
  onManage,
  onImport,
  onExport,
  onArchiveAll,
  archived,
  exporting,
  busy,
}: {
  open: boolean;
  onToggle(): void;
  onClose(): void;
  preferences: DashboardPreferences;
  onChange(change: Partial<DashboardPreferences>): void;
  types: string[];
  columns: JobStatus[];
  onManage(): void;
  onImport(): void;
  onExport(): void;
  onArchiveAll(): void;
  archived: boolean;
  exporting: boolean;
  busy: boolean;
}) {
  const toggle = <T extends string>(values: T[], value: T) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
  return (
    <Popover
      open={open}
      onToggle={onToggle}
      onClose={onClose}
      label="Dashboard options"
      className="dashboard-options"
      triggerClassName="dashboard-control"
      panelClassName="dashboard-menu dashboard-options-menu"
      trigger={
        <>
          <DashboardIcon name="options" />
          <span>Options</span>
          <span className="dashboard-options-arrows">
            ⌃<br />⌄
          </span>
        </>
      }
    >
      <div className="dashboard-menu-section">
        <h3>Filters</h3>
        <details className="dashboard-option-group">
          <summary>
            Applied from{' '}
            {preferences.appliedFrom && (
              <span className="dashboard-filter-dot" />
            )}
            <DashboardIcon name="chevron" size={16} />
          </summary>
          <label className="dashboard-option-content">
            <span className="dashboard-sr-only">Applied from</span>
            <input
              type="date"
              aria-label="Applied from"
              value={preferences.appliedFrom}
              max={preferences.appliedUntil || undefined}
              onChange={(event) =>
                onChange({ appliedFrom: event.target.value })
              }
            />
            {preferences.appliedFrom && (
              <button
                className="dashboard-text-button"
                type="button"
                onClick={() => onChange({ appliedFrom: '' })}
              >
                Clear date
              </button>
            )}
          </label>
        </details>
        <details className="dashboard-option-group">
          <summary>
            Applied until{' '}
            {preferences.appliedUntil && (
              <span className="dashboard-filter-dot" />
            )}
            <DashboardIcon name="chevron" size={16} />
          </summary>
          <label className="dashboard-option-content">
            <span className="dashboard-sr-only">Applied until</span>
            <input
              type="date"
              aria-label="Applied until"
              value={preferences.appliedUntil}
              min={preferences.appliedFrom || undefined}
              onChange={(event) =>
                onChange({ appliedUntil: event.target.value })
              }
            />
            {preferences.appliedUntil && (
              <button
                className="dashboard-text-button"
                type="button"
                onClick={() => onChange({ appliedUntil: '' })}
              >
                Clear date
              </button>
            )}
          </label>
        </details>
        <details className="dashboard-option-group">
          <summary>
            Job type{' '}
            {preferences.types.length > 0 && (
              <span className="dashboard-filter-dot" />
            )}
            <DashboardIcon name="chevron" size={16} />
          </summary>
          <div className="dashboard-option-content">
            {types.map((type) => (
              <label className="dashboard-check" key={type}>
                <span>{type}</span>
                <input
                  type="checkbox"
                  checked={preferences.types.includes(type)}
                  onChange={() =>
                    onChange({ types: toggle(preferences.types, type) })
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <details className="dashboard-option-group">
          <summary>
            Status{' '}
            {preferences.statuses.length > 0 && (
              <span className="dashboard-filter-dot" />
            )}
            <DashboardIcon name="chevron" size={16} />
          </summary>
          <div className="dashboard-option-content">
            {ALL_STATUSES.map((status) => (
              <label className="dashboard-check" key={status}>
                <span>{STATUS_LABELS[status]}</span>
                <input
                  type="checkbox"
                  checked={preferences.statuses.includes(status)}
                  onChange={() =>
                    onChange({ statuses: toggle(preferences.statuses, status) })
                  }
                />
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="dashboard-menu-section">
        <h3>View options</h3>
        <label className="dashboard-check dashboard-option-row">
          <span>Show only favorites</span>
          <input
            type="checkbox"
            checked={preferences.favoritesOnly}
            onChange={() =>
              onChange({ favoritesOnly: !preferences.favoritesOnly })
            }
          />
        </label>
        <details className="dashboard-option-group">
          <summary>
            Visible columns ({columns.length})
            <DashboardIcon name="chevron" size={16} />
          </summary>
          <div className="dashboard-option-content">
            {ALL_STATUSES.map((status) => (
              <label className="dashboard-check" key={status}>
                <span>{STATUS_LABELS[status]}</span>
                <input
                  type="checkbox"
                  checked={columns.includes(status)}
                  disabled={columns.length === 1 && columns.includes(status)}
                  onChange={() =>
                    onChange({
                      columns: ALL_STATUSES.filter((value) =>
                        toggle(columns, status).includes(value),
                      ),
                      customColumns: true,
                    })
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <details className="dashboard-option-group">
          <summary>
            Sort by
            <DashboardIcon name="chevron" size={16} />
          </summary>
          <fieldset className="dashboard-option-content">
            <legend className="dashboard-sr-only">Sort by</legend>
            {(
              [
                { value: 'capturedAt', label: 'Date added' },
                { value: 'updatedAt', label: 'Last edited' },
                { value: 'appliedAt', label: 'Applied date' },
                { value: 'title', label: 'Position title' },
                { value: 'company', label: 'Company' },
              ] as { value: SortField; label: string }[]
            ).map((option) => (
              <label className="dashboard-check" key={option.value}>
                <span>{option.label}</span>
                <input
                  type="radio"
                  name="dashboard-sort"
                  checked={preferences.sortBy === option.value}
                  onChange={() => onChange({ sortBy: option.value })}
                />
              </label>
            ))}
            <div className="dashboard-menu-divider" />
            {(['asc', 'desc'] as const).map((order) => (
              <label className="dashboard-check" key={order}>
                <span>{order === 'asc' ? 'Ascending' : 'Descending'}</span>
                <input
                  type="radio"
                  name="dashboard-order"
                  checked={preferences.order === order}
                  onChange={() => onChange({ order })}
                />
              </label>
            ))}
          </fieldset>
        </details>
      </div>
      <div className="dashboard-menu-section">
        <h3>Actions</h3>
        <button
          type="button"
          className="dashboard-menu-item"
          disabled={busy}
          onClick={onManage}
        >
          <DashboardIcon name="manage" />
          <span>Manage jobs</span>
        </button>
        <button
          type="button"
          className="dashboard-menu-item"
          disabled={busy}
          onClick={onImport}
        >
          <DashboardIcon name="download" />
          <span>Import CSV</span>
        </button>
        <button
          type="button"
          className="dashboard-menu-item"
          disabled={busy || exporting}
          onClick={onExport}
        >
          <DashboardIcon name="upload" />
          <span>{exporting ? 'Preparing CSV…' : 'Export CSV'}</span>
        </button>
        <div className="dashboard-menu-divider" />
        <button
          type="button"
          className="dashboard-menu-item"
          disabled={busy}
          onClick={onArchiveAll}
        >
          <DashboardIcon name={archived ? 'restore' : 'archive'} />
          <span>
            {archived ? 'Restore all applications' : 'Archive all applications'}
          </span>
        </button>
      </div>
    </Popover>
  );
}
