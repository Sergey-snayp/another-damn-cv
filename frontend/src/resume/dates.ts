export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-10" → "Oct 2024"; anything else as written. */
export function monthYear(value?: string | null): string {
  const text = (value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : text;
}

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2024-10" in the CV's date format: "Oct 2024", "10/2024", "2024" or "October 2024". Anything else as written. */
export function formatDate(value: string | null | undefined, format: 'short' | 'numeric' | 'year' | 'long' = 'short'): string {
  const text = (value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) return text;
  if (format === 'numeric') return `${String(month).padStart(2, '0')}/${match[1]}`;
  if (format === 'year') return match[1]!;
  if (format === 'long') return `${LONG_MONTHS[month - 1]} ${match[1]}`;
  return `${MONTHS[month - 1]} ${match[1]}`;
}

/** "Oct 2023 - Present", as the CV shows a job's dates. */
export const range = (from?: string | null, to?: string | null, current?: boolean, format: 'short' | 'numeric' | 'year' | 'long' = 'short') =>
  [formatDate(from, format), current ? 'Present' : formatDate(to, format)].filter(Boolean).join(' - ');

/** Common country names at the end of a place: "Vancouver, BC, Canada" without its country is "Vancouver, BC". */
const COUNTRIES = new Set(['canada', 'united states', 'united states of america', 'usa', 'us', 'u.s.', 'u.s.a.', 'united kingdom', 'uk', 'england',
  'ukraine', 'germany', 'france', 'poland', 'spain', 'portugal', 'italy', 'netherlands', 'ireland', 'india', 'australia',
  'new zealand', 'mexico', 'brazil', 'argentina', 'israel', 'singapore', 'japan', 'china', 'sweden', 'norway', 'denmark',
  'finland', 'switzerland', 'austria', 'belgium', 'czech republic', 'czechia', 'romania', 'estonia', 'latvia', 'lithuania', 'georgia', 'moldova']);

/** The place without its country, when it ends with one and has something before it. */
export function withoutCountry(place: string): string {
  const parts = place.split(',').map((part) => part.trim());
  return parts.length > 1 && COUNTRIES.has(parts.at(-1)!.toLowerCase()) ? parts.slice(0, -1).join(', ') : place;
}
