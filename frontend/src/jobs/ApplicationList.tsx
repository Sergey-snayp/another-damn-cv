import { Link } from 'react-router-dom';
import {
  ALL_STATUSES,
  STATUS_LABELS,
  jobName,
  type JobStatus,
  type JobSummary,
} from '../jobsApi';
import {
  CompanyAvatar,
  FavoriteButton,
  ApplicationMenu,
  type ApplicationActions,
} from './ApplicationCard';
import { jobType } from './dashboardState';

export function ApplicationList({
  rows,
  actions,
}: {
  rows: JobSummary[];
  actions: ApplicationActions;
}) {
  return (
    <div className="application-list-scroll">
      <table className="application-list">
        <caption className="dashboard-sr-only">Applications</caption>
        <thead>
          <tr>
            {actions.managing && <th scope="col">Select</th>}
            <th scope="col">Company</th>
            <th scope="col">Position</th>
            <th scope="col">Location</th>
            <th scope="col">Job type</th>
            <th scope="col">Status</th>
            <th scope="col">Applied</th>
            <th scope="col">Added</th>
            <th scope="col">
              <span className="dashboard-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={actions.selected.has(row.id) ? 'is-selected' : ''}
            >
              {actions.managing && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${jobName(row)}`}
                    checked={actions.selected.has(row.id)}
                    onChange={() => actions.onSelect(row.id)}
                  />
                </td>
              )}
              <td>
                <span className="application-list-company">
                  <CompanyAvatar company={row.company} />
                  <span>{row.company || 'Company not added'}</span>
                </span>
              </td>
              <td>
                <Link to={`/jobs/${row.id}`}>{jobName(row)}</Link>
                {row.extraction === 'pending' && <small>Reading…</small>}
              </td>
              <td>{row.location || (row.remote ? 'Remote' : '—')}</td>
              <td>{jobType(row.employmentType)}</td>
              <td>
                <select
                  className={`application-status-select status-${row.status}`}
                  aria-label={`Move ${jobName(row)} to`}
                  value={row.status}
                  disabled={actions.busyIds.has(row.id)}
                  onChange={(event) =>
                    actions.onMove(row, event.target.value as JobStatus)
                  }
                >
                  {ALL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {row.appliedAt
                  ? new Date(row.appliedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </td>
              <td>
                {new Date(row.capturedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </td>
              <td>
                <div className="application-list-actions">
                  <FavoriteButton row={row} actions={actions} />
                  <ApplicationMenu row={row} actions={actions} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
