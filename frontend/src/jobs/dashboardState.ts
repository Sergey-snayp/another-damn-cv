import { ALL_STATUSES, type JobStatus, type JobSummary } from '../jobsApi';

export type DashboardView = 'board' | 'list' | 'chart';
export type DashboardScope = 'active' | 'archived';
export type SortField =
  | 'capturedAt'
  | 'updatedAt'
  | 'appliedAt'
  | 'title'
  | 'company';
export interface DashboardPreferences {
  view: DashboardView;
  favoritesOnly: boolean;
  statuses: JobStatus[];
  types: string[];
  appliedFrom: string;
  appliedUntil: string;
  columns: JobStatus[];
  customColumns: boolean;
  sortBy: SortField;
  order: 'asc' | 'desc';
}
export const DEFAULT_COLUMNS: JobStatus[] = [
  'saved',
  'applied',
  'interview',
  'offer',
  'rejected',
];
export const DEFAULT_DASHBOARD: DashboardPreferences = {
  view: 'board',
  favoritesOnly: false,
  statuses: [],
  types: [],
  appliedFrom: '',
  appliedUntil: '',
  columns: DEFAULT_COLUMNS,
  customColumns: false,
  sortBy: 'capturedAt',
  order: 'desc',
};
export function readDashboardPreferences(key: string): DashboardPreferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem(key) ?? 'null',
    ) as Partial<DashboardPreferences> | null;
    if (!stored || typeof stored !== 'object') return DEFAULT_DASHBOARD;
    const columns = Array.isArray(stored.columns)
      ? stored.columns.filter((status) => ALL_STATUSES.includes(status))
      : [];
    return {
      view: ['board', 'list', 'chart'].includes(stored.view ?? '')
        ? stored.view!
        : 'board',
      favoritesOnly: stored.favoritesOnly === true,
      statuses: Array.isArray(stored.statuses)
        ? stored.statuses.filter((status) => ALL_STATUSES.includes(status))
        : [],
      types: Array.isArray(stored.types)
        ? stored.types.filter((type) => typeof type === 'string')
        : [],
      appliedFrom: /^\d{4}-\d{2}-\d{2}$/.test(stored.appliedFrom ?? '')
        ? stored.appliedFrom!
        : '',
      appliedUntil: /^\d{4}-\d{2}-\d{2}$/.test(stored.appliedUntil ?? '')
        ? stored.appliedUntil!
        : '',
      columns: columns.length ? columns : DEFAULT_COLUMNS,
      customColumns: stored.customColumns === true,
      sortBy: [
        'capturedAt',
        'updatedAt',
        'appliedAt',
        'title',
        'company',
      ].includes(stored.sortBy ?? '')
        ? stored.sortBy!
        : 'capturedAt',
      order: stored.order === 'asc' ? 'asc' : 'desc',
    };
  } catch {
    return DEFAULT_DASHBOARD;
  }
}
export function jobType(value: string | null): string {
  if (!value?.trim()) return 'Not specified';
  const type = value
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const labels: Record<string, string> = {
    'full time': 'Full-Time',
    fulltime: 'Full-Time',
    'part time': 'Part-Time',
    parttime: 'Part-Time',
    contract: 'Contract',
    temporary: 'Temporary',
    internship: 'Internship',
    freelance: 'Freelance',
  };
  return labels[type] ?? value.trim();
}
export function needsReview(job: JobSummary): boolean {
  return (
    job.extraction !== 'pending' &&
    (job.extraction === 'failed' || !job.title?.trim() || !job.company?.trim())
  );
}
export function visibleApplications(
  rows: JobSummary[],
  scope: DashboardScope,
  query: string,
  preferences: DashboardPreferences,
  reviewOnly: boolean,
): JobSummary[] {
  const search = query.trim().toLocaleLowerCase();
  const from = preferences.appliedFrom
    ? new Date(`${preferences.appliedFrom}T00:00:00`).getTime()
    : null;
  const until = preferences.appliedUntil
    ? new Date(`${preferences.appliedUntil}T23:59:59.999`).getTime()
    : null;
  return rows
    .filter((job) => {
      if ((scope === 'archived') !== Boolean(job.archivedAt)) return false;
      if (preferences.favoritesOnly && !job.isFavorite) return false;
      if (
        preferences.statuses.length &&
        !preferences.statuses.includes(job.status)
      )
        return false;
      if (
        preferences.types.length &&
        !preferences.types.includes(jobType(job.employmentType))
      )
        return false;
      if (reviewOnly && !needsReview(job)) return false;
      if (
        !`${job.title ?? job.pageTitle ?? ''} ${job.company ?? ''}`
          .toLocaleLowerCase()
          .includes(search)
      )
        return false;
      if (from !== null || until !== null) {
        if (!job.appliedAt) return false;
        const applied = new Date(job.appliedAt).getTime();
        if (from !== null && applied < from) return false;
        if (until !== null && applied > until) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const field = preferences.sortBy;
      const comparison =
        field === 'title' || field === 'company'
          ? (a[field] ?? '').localeCompare(b[field] ?? '', undefined, {
              sensitivity: 'base',
              numeric: true,
            })
          : new Date(a[field] ?? 0).getTime() -
            new Date(b[field] ?? 0).getTime();
      return (
        (preferences.order === 'asc' ? comparison : -comparison) ||
        a.id.localeCompare(b.id)
      );
    });
}
