import type { ResumesApi } from '../../contracts';
import { pdfFileName, pdfVersion, PdfUnavailableError } from '../../domain/resume-pdf';
import type { PdfRenderer, PrintTokens, ResumePdfStore, StoredPdf } from '../ports/resume-pdf';

/**
 * Each CV's PDF, kept on the server (as Simplify keeps resume files). The
 * extension downloads it; nothing opens in the person's browser. A PDF is
 * made from the app's print page with the CV's design, after the CV is saved
 * or its design changes, and on request when the kept one is out of date.
 */
export class ResumePdfs {
  private readonly making = new Map<string, Promise<StoredPdf>>();

  constructor(
    private readonly resumes: Pick<ResumesApi, 'assertOwned' | 'current'>,
    private readonly store: ResumePdfStore,
    private readonly renderer: PdfRenderer,
    private readonly tokens: PrintTokens,
    private readonly printUrl: (resumeId: string, token: string) => string,
  ) {}

  async theme(userId: string, id: string): Promise<unknown> {
    await this.resumes.assertOwned(userId, id);
    return this.store.theme(id);
  }

  /** Saves the design and makes the PDF again in the background. */
  async setTheme(userId: string, id: string, theme: unknown): Promise<unknown> {
    await this.resumes.assertOwned(userId, id);
    await this.store.setTheme(id, theme);
    this.refresh(userId, id);
    return theme;
  }

  /** A new name for the CV (the editor's ✎). The PDF's file name comes from the person's name, so it stays. */
  async rename(userId: string, id: string, name: string): Promise<string> {
    await this.resumes.assertOwned(userId, id);
    await this.store.rename(id, name.trim());
    return name.trim();
  }

  /** The current PDF, made now when the kept one is missing or out of date. */
  async file(userId: string, id: string): Promise<StoredPdf> {
    const cv = await this.resumes.current(userId, id);
    const version = pdfVersion(cv.snapshot, await this.store.theme(id));
    const kept = await this.store.find(id);
    if (kept?.version === version) return kept;
    const key = `${id}@${version}`;
    let pending = this.making.get(key);
    if (!pending) {
      pending = this.make(userId, id, version, cv.contact).finally(() => this.making.delete(key));
      this.making.set(key, pending);
    }
    return pending;
  }

  /** Makes the PDF in the background after a change, so it is ready when the extension asks. */
  refresh(userId: string, id: string): void {
    void this.file(userId, id).catch(() => {
      /* made on the next request instead */
    });
  }

  /** What the print page draws, for a link the server made. */
  async printView(token: string, id: string) {
    const userId = this.tokens.verify(token, id);
    if (!userId) return null;
    return { resume: await this.resumes.current(userId, id), theme: await this.store.theme(id) };
  }

  private async make(
    userId: string,
    id: string,
    version: string,
    contact: { firstName?: string | null; lastName?: string | null } | null,
  ): Promise<StoredPdf> {
    let pdf: Buffer;
    try {
      pdf = await this.renderer.render(this.printUrl(id, this.tokens.sign(userId, id)));
    } catch (error) {
      throw new PdfUnavailableError(
        `The CV PDF could not be made: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const made = { version, fileName: pdfFileName(contact), pdf };
    await this.store.save(id, made);
    return made;
  }
}
