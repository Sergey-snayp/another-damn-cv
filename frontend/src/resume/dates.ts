export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-10" → "Oct 2024"; anything else as written. */
export function monthYear(value?: string | null): string {
  const text = (value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : text;
}

/** "Oct 2023 - Present", as the CV shows a job's dates. */
export const range = (from?: string | null, to?: string | null, current?: boolean) =>
  [monthYear(from), current ? 'Present' : monthYear(to)].filter(Boolean).join(' - ');
