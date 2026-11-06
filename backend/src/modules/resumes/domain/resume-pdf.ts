/**
 * A CV's PDF is made on the server and kept, like Simplify keeps its
 * candidates' resume files: the extension only downloads it. It is made only
 * by an explicit Save action, after the CV has been saved.
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

/**
 * The print page's layout. Raise it when the print style changes, so PDFs
 * made with the old style are made again. 2: page margins on every page.
 * 3: every CV in the one design.
 */
export const PRINT_LAYOUT = 3;

/** "12:3f9a01bc:2": the CV version, a fingerprint of its design and the print layout. */
export function pdfVersion(snapshot: number, theme: unknown): string {
  return `${snapshot}:${fingerprint(JSON.stringify(theme ?? null))}:${PRINT_LAYOUT}`;
}

/** Application PDFs use the saved full_name_CV_company_role name. */
export function pdfFileName(
  contact: { firstName?: string | null; lastName?: string | null } | null,
  applicationName?: string | null,
): string {
  const application = (applicationName ?? '')
    .replace(/\.pdf$/i, '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_|_$/g, '');
  if (application) return `${Array.from(application).slice(0, 120).join('').replace(/_$/g, '')}.pdf`;
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

export class PdfNotReadyError extends Error {
  constructor(message = 'Save this CV to create an up-to-date PDF.') {
    super(message);
    this.name = 'PdfNotReadyError';
  }
}
