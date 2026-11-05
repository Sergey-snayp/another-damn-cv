/**
 * A CV's PDF is made on the server and kept, like Simplify keeps its
 * candidates' resume files: the extension only downloads it. It is made again
 * when the CV gets a new version or its design changes.
 */

/** FNV-1a over the design's JSON: enough to notice that the design changed. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** "12:3f9a01bc": the CV version and a fingerprint of its design. */
export function pdfVersion(snapshot: number, theme: unknown): string {
  return `${snapshot}:${fingerprint(JSON.stringify(theme ?? null))}`;
}

/** "Sergey_Proniuk_Resume.pdf", as Simplify names uploaded resumes; the CV's name when it has no name on it. */
export function pdfFileName(contact: { firstName?: string | null; lastName?: string | null } | null): string {
  const name = [contact?.firstName, contact?.lastName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} -]+/gu, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${name || 'Resume'}${name ? '_Resume' : ''}.pdf`;
}

export class PdfUnavailableError extends Error {
  constructor(message = 'The CV PDF could not be made. Is the app running?') {
    super(message);
    this.name = 'PdfUnavailableError';
  }
}
