import { withoutDashPunctuation } from './cv-writing-guide';

/** Who the letter is from, for its header and file name. */
export interface LetterAuthor {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin?: string | null;
}

const filePart = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');

/** "Sergey_Proniuk_Cover_Letter_Paymorrow.pdf" */
export function coverLetterFileName(author: LetterAuthor | null, company: string | null): string {
  const name = filePart([author?.firstName, author?.lastName].filter(Boolean).join(' '));
  const where = filePart(company ?? '');
  return `${[name, 'Cover_Letter', where].filter(Boolean).join('_')}.pdf`;
}

/** The letter's paragraphs: blank lines split them; spacing inside one is tidied. */
export function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean);
}

/** An AI-written letter as it is kept: paragraphs tidied, no dashes as punctuation, no markdown. */
export function tidyLetter(text: string): string {
  return paragraphsOf(text.replace(/\*\*|__/g, ''))
    .map((paragraph) => paragraph.split('\n').map(withoutDashPunctuation).join('\n'))
    .join('\n\n');
}

/** Above this a letter no longer fits one page. */
export const LETTER_WORD_LIMIT = 400;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The letter as a printable US Letter page, laid out like the candidate's own
 * letters: the name centered in bold, one centered contact line (phone | email
 * | LinkedIn), then the paragraphs in a serif face with a blank line between.
 * Printed by the server's Chrome.
 */
export function coverLetterHtml(text: string, author: LetterAuthor | null): string {
  const name = [author?.firstName, author?.lastName].filter(Boolean).join(' ');
  const contact = [author?.phone, author?.email, author?.linkedin]
    .map((part) => part?.trim())
    .filter(Boolean)
    .map((part) => escapeHtml(part!))
    .join('<span class="sep"> | </span>');
  const body = paragraphsOf(text)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(name || 'Cover letter')}</title>
<style>
  @page { size: Letter; margin: 0.9in 1in; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.38; color: #000; }
  header { margin-bottom: 22pt; text-align: center; }
  h1 { margin: 0; font-size: 22pt; font-weight: 700; line-height: 1.1; }
  .contact { margin: 2pt 0 0; font-size: 11pt; }
  p { margin: 0 0 13pt; }
</style></head>
<body>
${name || contact ? `<header>${name ? `<h1>${escapeHtml(name)}</h1>` : ''}${contact ? `<p class="contact">${contact}</p>` : ''}</header>` : ''}
${body}
</body></html>`;
}
