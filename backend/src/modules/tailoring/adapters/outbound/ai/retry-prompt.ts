import type { BlockedLine } from '../../../domain/retry';

export function retryPrompt(lines: BlockedLine[]): string {
  const body = lines
    .map(
      (line) => `<line id="${line.id}">
<original>${line.original}</original>
<your-rewrite>${line.rejected}</your-rewrite>
<not-allowed>${line.problems.join(', ')}</not-allowed>
</line>`,
    )
    .join('\n');

  return `Your rewrites of these lines used words the resume does not support.
Rewrite each again WITHOUT any word listed in <not-allowed>, and without adding
any other technology, product name or number that is not in <original>.
If you cannot, return the original text.

${body}

Return ONLY JSON, no prose and no code fences:
{ "lines": [ { "id": "summary", "text": "..." } ] }`;
}
