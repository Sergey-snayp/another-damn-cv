import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ALL_STATUSES,
  STATUS_LABELS,
  jobName,
  type JobStatus,
  type JobSummary,
} from '../jobsApi';
import { Popover } from '../components/Popover';
import { DashboardIcon } from './DashboardIcon';
import { needsReview } from './dashboardState';
import { isInterviewJob } from '../interviews/interviewJobs';

export interface ApplicationActions {
  onMove(job: JobSummary, to: JobStatus): void;
  onFavorite(job: JobSummary): void;
  onArchive(job: JobSummary): void;
  busyIds: Set<string>;
  managing: boolean;
  selected: Set<string>;
  onSelect(id: string): void;
}
export function CompanyAvatar({ company }: { company: string | null }) {
  const name = company?.trim() || '?';
  const hash = [...name].reduce((value, char) => value + char.charCodeAt(0), 0);
  const colors = [
    '#146a8c',
    '#393347',
    '#20352c',
    '#775f42',
    '#273e54',
    '#404345',
  ];
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className="application-company-avatar"
      style={{ background: colors[hash % colors.length] }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
export function ApplicationMenu({
  row,
  actions,
}: {
  row: JobSummary;
  actions: ApplicationActions;
}) {
  const [open, setOpen] = useState(false);
  const busy = actions.busyIds.has(row.id);
  return (
    <Popover
      portal
      open={open}
      onToggle={() => setOpen(!open)}
      onClose={() => setOpen(false)}
      label={`More actions for ${jobName(row)}`}
      className="application-card-menu"
      triggerClassName="dashboard-icon-button"
      panelClassName="dashboard-menu application-menu"
      trigger={<DashboardIcon name="more" size={19} />}
    >
      <Link to={`/jobs/${row.id}`} className="dashboard-menu-item">
        <DashboardIcon name="file" />
        <span>View details</span>
      </Link>
      {isInterviewJob(row) && (
        <Link to={`/interview-prep/${row.id}`} className="dashboard-menu-item">
          <DashboardIcon name="interview" />
          <span>Interview Prep</span>
        </Link>
      )}
      {row.url && (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer noopener"
          className="dashboard-menu-item"
        >
          <DashboardIcon name="arrow" />
          <span>Open job posting</span>
        </a>
      )}
      {row.applicationResumeId && (
        <Link
          className="dashboard-menu-item"
          to={`/documents/${row.applicationResumeId}/history?snapshot=${row.applicationSnapshot ?? ''}`}
        >
          <DashboardIcon name="file" />
          <span>Application resume</span>
        </Link>
      )}
      {row.tailoredResumeId && (
        <Link
          className="dashboard-menu-item"
          to={`/documents/${row.tailoredResumeId}`}
        >
          <DashboardIcon name="file" />
          <span>Tailored resume</span>
        </Link>
      )}
      <label className="application-move-field">
        Move to
        <select
          aria-label={`Move ${jobName(row)} to`}
          disabled={busy}
          value={row.status}
          onChange={(event) => {
            actions.onMove(row, event.target.value as JobStatus);
            setOpen(false);
          }}
        >
          {ALL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <div className="dashboard-menu-divider" />
      <button
        type="button"
        className="dashboard-menu-item"
        disabled={busy}
        onClick={() => {
          actions.onArchive(row);
          setOpen(false);
        }}
      >
        <DashboardIcon name={row.archivedAt ? 'restore' : 'archive'} />
        <span>
          {row.archivedAt ? 'Restore application' : 'Archive application'}
        </span>
      </button>
    </Popover>
  );
}
export function FavoriteButton({
  row,
  actions,
}: {
  row: JobSummary;
  actions: ApplicationActions;
}) {
  return (
    <button
      type="button"
      className={`dashboard-icon-button application-favorite${row.isFavorite ? ' is-favorite' : ''}`}
      aria-label={`${row.isFavorite ? 'Unfavorite' : 'Favorite'} ${jobName(row)}`}
      aria-pressed={Boolean(row.isFavorite)}
      disabled={actions.busyIds.has(row.id)}
      onClick={() => actions.onFavorite(row)}
    >
      <DashboardIcon name="heart" size={21} filled={row.isFavorite} />
    </button>
  );
}
export function ApplicationCard({
  row,
  actions,
  lifted = false,
  onOpen,
}: {
  row: JobSummary;
  actions?: ApplicationActions;
  lifted?: boolean;
  onOpen?: (event: MouseEvent) => void;
}) {
  return (
    <article
      className={`application-card${lifted ? ' is-lifted' : ''}${actions?.selected.has(row.id) ? ' is-selected' : ''}`}
    >
      <div className="application-card-company">
        <CompanyAvatar company={row.company} />
        <span title={row.company ?? ''}>
          {row.company || 'Company not added'}
        </span>
        {actions && (
          <div
            className="application-card-actions"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          >
            <FavoriteButton row={row} actions={actions} />
            <ApplicationMenu row={row} actions={actions} />
          </div>
        )}
      </div>
      {actions?.managing && (
        <input
          className="application-selection-checkbox"
          type="checkbox"
          aria-label={`Select ${jobName(row)}`}
          checked={actions.selected.has(row.id)}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onChange={() => actions.onSelect(row.id)}
        />
      )}
      <Link
        to={`/jobs/${row.id}`}
        className="application-card-title"
        draggable={false}
        onClick={onOpen}
      >
        {jobName(row)}
      </Link>
      <p className="application-card-location">
        <DashboardIcon name="location" size={17} />
        <span>
          {row.location || (row.remote ? 'Remote' : 'Unknown location')}
          {row.location && row.remote && !/remote/i.test(row.location)
            ? ' · Remote'
            : ''}
        </span>
      </p>
      <footer className="application-card-footer">
        <span>
          Added{' '}
          <time dateTime={row.capturedAt}>
            {new Date(row.capturedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </time>
        </span>
        {row.extraction === 'pending' ? (
          <span className="application-card-note">Reading…</span>
        ) : needsReview(row) ? (
          <span className="application-card-note needs-review">
            Needs review
          </span>
        ) : null}
      </footer>
    </article>
  );
}
