import {
  ALL_STATUSES,
  STATUS_LABELS,
  type ApplicationInput,
  type Job,
} from '../jobsApi';

function parseRecords(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const first = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else field += char;
    } else if (char === '"') {
      if (field.trim() || closed)
        throw new Error(
          'The CSV has an unexpected quote. Check that quoted fields use double quotes.',
        );
      field = '';
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
      closed = false;
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
      closed = false;
    } else if (!closed || !char.trim()) {
      if (!closed) field += char;
    } else throw new Error('The CSV has text after a closing quote.');
  }
  if (quoted) throw new Error('The CSV has an unclosed quote.');
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');
const decode = (value: string) =>
  /^'[=+@\-\t\r]/.test(value) ? value.slice(1) : value;

export function parseApplicationsCsv(text: string): {
  rows: ApplicationInput[];
  errors: string[];
} {
  const records = parseRecords(text);
  const headers = records.shift()?.map(normalize) ?? [];
  const aliases = {
    title: ['positiontitle', 'jobtitle', 'title', 'position', 'role'],
    company: ['company', 'companyname', 'organization'],
    location: ['location', 'joblocation'],
    employmentType: ['jobtype', 'employmenttype', 'type'],
    status: ['status', 'jobstatus', 'applicationstatus'],
    url: ['url', 'joburl', 'link', 'joblink'],
    salary: ['salary', 'salaryrange'],
    description: ['description', 'jobdescription'],
    addedAt: ['added', 'addedat', 'dateadded', 'created', 'createdat'],
    appliedAt: ['applied', 'appliedat', 'dateapplied', 'applicationdate'],
    favorite: ['favorite', 'isfavorite', 'favourite'],
    archived: ['archived', 'isarchived'],
    resumeId: ['resumeid', 'applicationresumeid'],
    resumeSnapshot: ['resumeversion', 'resumesnapshot', 'applicationsnapshot'],
  };
  const indexes = Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [
      field,
      headers.findIndex((header) => names.includes(header)),
    ]),
  ) as Record<keyof typeof aliases, number>;
  if (indexes.title < 0 || indexes.company < 0)
    throw new Error('Your CSV needs Position Title and Company columns.');
  if (!records.length)
    throw new Error('The CSV does not contain any applications.');
  if (records.length > 500)
    throw new Error('Import up to 500 applications at a time.');
  const rows: ApplicationInput[] = [],
    errors: string[] = [];
  records.forEach((record, index) => {
    const get = (field: keyof typeof aliases) =>
      decode(record[indexes[field]] ?? '').trim();
    const title = get('title'),
      company = get('company');
    const problems: string[] = [];
    if (!title) problems.push('Position Title is required');
    if (!company) problems.push('Company is required');
    const statusText = normalize(get('status') || 'saved');
    const status = ALL_STATUSES.find(
      (value) =>
        normalize(value) === statusText ||
        normalize(STATUS_LABELS[value]) === statusText,
    );
    if (!status) problems.push(`Unknown status "${get('status')}"`);
    const date = (field: 'addedAt' | 'appliedAt') => {
      const value = get(field);
      if (!value) return undefined;
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
      const parsed = new Date(dateOnly ? `${value}T00:00:00` : value);
      const localDate = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      if (Number.isNaN(parsed.getTime()) || (dateOnly && localDate !== value)) {
        problems.push(
          `${field === 'addedAt' ? 'Added' : 'Applied'} is not a valid date`,
        );
        return undefined;
      }
      return parsed.toISOString();
    };
    const boolean = (field: 'favorite' | 'archived') => {
      const value = get(field).toLowerCase();
      if (!value || ['false', 'no', '0', 'off'].includes(value)) return false;
      if (['true', 'yes', '1', 'on'].includes(value)) return true;
      problems.push(`${field} must be true or false`);
      return false;
    };
    const url = get('url');
    if (url) {
      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol))
          problems.push('Job link must use http or https');
      } catch {
        problems.push('Job link is not a valid URL');
      }
    }
    const row: ApplicationInput = {
      title,
      company,
      status: status ?? 'saved',
      location: get('location') || undefined,
      employmentType: get('employmentType') || undefined,
      url: url || undefined,
      salary: get('salary') || undefined,
      description: get('description') || undefined,
      addedAt: date('addedAt'),
      appliedAt: date('appliedAt'),
      favorite: boolean('favorite'),
      archived: boolean('archived'),
      resumeId: get('resumeId') || undefined,
    };
    const version = get('resumeSnapshot');
    if (version && (!/^\d+$/.test(version) || Number(version) < 1))
      problems.push('Resume Version must be a positive number');
    else if (version && row.resumeId) row.resumeSnapshot = Number(version);
    for (const [field, value] of Object.entries(row))
      if (
        typeof value === 'string' &&
        value.length > (field === 'description' ? 120_000 : 2_000)
      )
        problems.push(`${field} is too long`);
    if (problems.length)
      errors.push(`Row ${index + 2}: ${problems.join('; ')}.`);
    rows.push(row);
  });
  if (new TextEncoder().encode(JSON.stringify({ rows })).byteLength > 1_900_000)
    throw new Error(
      'The CSV contains too much text. Split it into smaller files.',
    );
  return { rows, errors };
}

function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Keep captured text as text when opened in a spreadsheet.
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function applicationsCsv(rows: Job[]): string {
  const header = [
    'Position Title',
    'Company',
    'Location',
    'Job Type',
    'Status',
    'URL',
    'Salary',
    'Description',
    'Added',
    'Applied',
    'Favorite',
    'Archived',
    'Resume ID',
    'Resume Version',
  ];
  return (
    '\uFEFF' +
    [
      header,
      ...rows.map((row) => [
        row.title ?? row.pageTitle ?? '',
        row.company,
        row.location,
        row.employmentType,
        STATUS_LABELS[row.status],
        row.url,
        row.salary,
        row.description,
        row.capturedAt,
        row.appliedAt,
        row.isFavorite,
        Boolean(row.archivedAt),
        row.applicationResumeId,
        row.applicationSnapshot,
      ]),
    ]
      .map((values) => values.map(cell).join(','))
      .join('\r\n')
  );
}
export function downloadApplications(rows: Job[]) {
  const url = URL.createObjectURL(
    new Blob([applicationsCsv(rows)], { type: 'text/csv;charset=utf-8;' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `applications-${new Date().toLocaleDateString('en-CA')}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
