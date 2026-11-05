export interface StoredPdf {
  version: string;
  fileName: string;
  pdf: Buffer;
}

/** The CV's design and its kept PDF. */
export interface ResumePdfStore {
  theme(resumeId: string): Promise<unknown>;
  setTheme(resumeId: string, theme: unknown): Promise<void>;
  rename(resumeId: string, name: string): Promise<void>;
  find(resumeId: string): Promise<StoredPdf | null>;
  save(resumeId: string, pdf: StoredPdf): Promise<void>;
}

/** Prints a page to PDF (the server's own Chrome). */
export interface PdfRenderer {
  render(url: string): Promise<Buffer>;
}

/** Short-lived links that let the server's Chrome open one CV's print page. */
export interface PrintTokens {
  sign(userId: string, resumeId: string): string;
  /** The user the link was made for, or null when it is wrong or expired. */
  verify(token: string, resumeId: string): string | null;
}
