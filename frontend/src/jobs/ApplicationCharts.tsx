import { useState } from 'react';
import {
  ALL_STATUSES,
  STATUS_LABELS,
  type JobStatus,
  type JobSummary,
} from '../jobsApi';

export function ApplicationCharts({
  rows,
  onStatus,
}: {
  rows: JobSummary[];
  onStatus(status: JobStatus): void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const counts = ALL_STATUSES.map((status) => ({
    status,
    count: rows.filter((row) => row.status === status).length,
  }));
  const maximum = Math.max(1, ...counts.map(({ count }) => count));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (7 - index) * 7 - 6);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      date: start,
      count: rows.filter((row) => {
        const at = new Date(row.capturedAt);
        return at >= start && at < end;
      }).length,
    };
  });
  const high = Math.max(1, ...weeks.map((week) => week.count));
  const points = weeks.map((week, index) => ({
    x: 35 + index * 80,
    y: 190 - (week.count / high) * 145,
  }));
  const applied = rows.filter((row) => Boolean(row.appliedAt)).length;
  return (
    <div className="application-charts">
      <section className="application-chart-card">
        <header>
          <h2>Applications by status</h2>
          <span>{rows.length} total</span>
        </header>
        <p>See where your applications stand.</p>
        <div className="application-status-chart">
          {counts.map(({ status, count }) => (
            <button
              type="button"
              key={status}
              onClick={() => onStatus(status)}
              aria-label={`View ${count} ${STATUS_LABELS[status]} applications`}
            >
              <span>{STATUS_LABELS[status]}</span>
              <span className="application-chart-bar-track">
                <span style={{ width: `${(count / maximum) * 100}%` }} />
              </span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>
      </section>
      <section className="application-chart-card">
        <header>
          <h2>Applications added</h2>
          <span>Last 8 weeks</span>
        </header>
        <p>
          {hovered === null
            ? 'Your activity over time.'
            : `${weeks[hovered]!.count} added in the week of ${weeks[hovered]!.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </p>
        <svg
          className="application-trend-chart"
          viewBox="0 0 640 235"
          role="img"
          aria-label={`Applications added over the last eight weeks: ${weeks.map((week) => week.count).join(', ')}`}
        >
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1="35"
                x2="605"
                y1={190 - ratio * 145}
                y2={190 - ratio * 145}
                stroke="#ededed"
              />
              <text x="22" y={194 - ratio * 145} textAnchor="end">
                {Math.round(high * ratio)}
              </text>
            </g>
          ))}
          <path
            d={`M35 190 ${points.map((point) => `L${point.x} ${point.y}`).join(' ')} L595 190Z`}
            fill="#e5f8fc"
          />
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="#13a1bb"
            strokeWidth="3"
          />
          {points.map((point, index) => (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r={hovered === index ? 6 : 4}
                fill="#13a1bb"
                stroke="white"
                strokeWidth="2"
                tabIndex={0}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
              >
                <title>
                  {weeks[index]!.date.toLocaleDateString()}:{' '}
                  {weeks[index]!.count} applications
                </title>
              </circle>
              <text x={point.x} y="220" textAnchor="middle">
                {weeks[index]!.date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </text>
            </g>
          ))}
        </svg>
        <div className="application-chart-summary">
          <span>
            <strong>{applied}</strong> applied
          </span>
          <span>
            <strong>
              {rows.filter((row) => row.status === 'interview').length}
            </strong>{' '}
            interviewing
          </span>
          <span>
            <strong>
              {
                rows.filter(
                  (row) => row.status === 'offer' || row.status === 'accepted',
                ).length
              }
            </strong>{' '}
            offers
          </span>
        </div>
      </section>
    </div>
  );
}
