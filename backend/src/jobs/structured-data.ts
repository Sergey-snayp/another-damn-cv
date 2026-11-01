import { htmlToText, decodeEntities } from './html-text';
import type { JobFields } from './jobs.types';

/**
 * Reads a schema.org JobPosting out of a page's JSON-LD.
 *
 * Most job boards publish one so Google for Jobs can index them. When it is
 * there it is exact and free, so it is tried before any model is asked.
 * The shape is loose in practice — strings where objects are specified,
 * arrays where one value is — so every field is read defensively.
 */
export function jobFromJsonLd(blocks: unknown[]): JobFields | null {
  const posting = findPosting(blocks);
  if (!posting) return null;

  const fields: JobFields = {
    title: text(posting.title),
    company: organisation(posting.hiringOrganization),
    location: location(posting.jobLocation),
    remote: remote(posting),
    employmentType: list(posting.employmentType)?.map(humanise).join(', ') || undefined,
    salary: salary(posting.baseSalary),
    postedAt: date(posting.datePosted),
    description:
      typeof posting.description === 'string' ? htmlToText(posting.description) || undefined : undefined,
  };

  // A JobPosting with neither a title nor a description is not one worth trusting.
  if (!fields.title && !fields.description) return null;
  return fields;
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosting(node: Obj): boolean {
  const type = node['@type'];
  return (Array.isArray(type) ? type : [type]).some((t) => t === 'JobPosting');
}

/** Breadth-first through arrays, @graph and nesting, so the first match is the outermost. */
function findPosting(blocks: unknown[]): Obj | null {
  const queue: unknown[] = [...blocks];
  let visited = 0;

  while (queue.length > 0 && visited++ < 5_000) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (!isObj(node)) continue;
    if (isPosting(node)) return node;
    for (const value of Object.values(node)) {
      if (typeof value === 'object' && value !== null) queue.push(value);
    }
  }
  return null;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const cleaned = decodeEntities(String(value)).replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function list(value: unknown): unknown[] | undefined {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

function organisation(value: unknown): string | undefined {
  const first = list(value)?.[0];
  return isObj(first) ? text(first.name) : text(first);
}

function location(value: unknown): string | undefined {
  const places = (list(value) ?? [])
    .map((place) => {
      if (!isObj(place)) return text(place);
      const address = place.address;
      if (!isObj(address)) return text(address) ?? text(place.name);

      const country = isObj(address.addressCountry)
        ? text(address.addressCountry.name)
        : text(address.addressCountry);
      return (
        [text(address.addressLocality), text(address.addressRegion), country].filter(Boolean).join(', ') ||
        undefined
      );
    })
    .filter((place): place is string => Boolean(place));

  return [...new Set(places)].join(' · ') || undefined;
}

function remote(posting: Obj): boolean | undefined {
  const types = list(posting.jobLocationType)?.map((t) => String(t).toUpperCase()) ?? [];
  if (types.includes('TELECOMMUTE')) return true;
  return undefined;
}

const UNITS: Record<string, string> = {
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

function salary(value: unknown): string | undefined {
  if (!isObj(value)) return text(value);

  const currency = text(value.currency) ?? '';
  const amount = isObj(value.value) ? value.value : { value: value.value };
  const unitText = text(amount.unitText) ?? text(value.unitText);
  const unit = unitText ? (UNITS[unitText.toUpperCase()] ?? unitText.toLowerCase()) : undefined;

  const money = (n: unknown) => {
    const num = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    return Number.isFinite(num) && num > 0 ? num.toLocaleString('en-US') : undefined;
  };

  const min = money(amount.minValue);
  const max = money(amount.maxValue);
  const single = money(amount.value);

  const range = min && max && min !== max ? `${min}–${max}` : (min ?? max ?? single);
  if (!range) return undefined;

  return [currency, range].filter(Boolean).join(' ') + (unit ? ` / ${unit}` : '');
}

function date(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** FULL_TIME → Full time */
function humanise(value: unknown): string {
  const raw = String(value).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
