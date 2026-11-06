import type { ResumesApi } from '../../contracts';
import { pdfFileName, pdfVersion, PdfNotReadyError, PdfUnavailableError } from '../../domain/resume-pdf';
import type { PdfRenderer, PrintTokens, ResumePdfStore, StoredPdf } from '../ports/resume-pdf';

/**
 * Each CV's PDF, kept on the server (as Simplify keeps resume files). The
 * extension downloads it; nothing opens in the person's browser. A PDF is
 * made from the app's print page only after the person clicks Save. Reading
 * a PDF, autosaving content and changing the design never start printing.
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

  /** Saves the design; making its PDF is a separate, explicit action. */
  async setTheme(userId: string, id: string, theme: unknown): Promise<unknown> {
    await this.resumes.assertOwned(userId, id);
    await this.store.setTheme(id, theme);
    return theme;
  }

  /** A new name for the CV (the editor's ✎). Application downloads use this name too. */
  async rename(userId: string, id: string, name: string): Promise<string> {
    await this.resumes.assertOwned(userId, id);
    await this.store.rename(id, name.trim());
    return name.trim();
  }

  /** Downloads only a PDF explicitly made for the current saved CV and design. */
  async file(userId: string, id: string): Promise<StoredPdf> {
    const cv = await this.resumes.current(userId, id);
    const version = pdfVersion(cv.snapshot, await this.store.theme(id));
    const kept = await this.store.find(id);
    if (kept?.version !== version) throw new PdfNotReadyError();
    return { ...kept, fileName: pdfFileName(cv.contact, await this.store.applicationName(id)) };
  }

  /** Called by Save, after the CV exists and its content is persisted. */
  async generate(userId: string, id: string): Promise<StoredPdf> {
    const cv = await this.resumes.current(userId, id);
    if (!cv.snapshot) throw new PdfNotReadyError('Create and save the CV before making its PDF.');
    const fileName = pdfFileName(cv.contact, await this.store.applicationName(id));
    const version = pdfVersion(cv.snapshot, await this.store.theme(id));
    const kept = await this.store.find(id);
    if (kept?.version === version) return { ...kept, fileName };
    const key = `${id}@${version}`;
    let pending = this.making.get(key);
    if (!pending) {
      pending = this.make(userId, id, version, fileName).finally(() => this.making.delete(key));
      this.making.set(key, pending);
    }
    return pending.then((file) => ({ ...file, fileName }));
  }

  /** What the print page draws, for a link the server made. */
  async printView(token: string, id: string) {
    const userId = this.tokens.verify(token, id);
    if (!userId) return null;
    return { resume: await this.resumes.current(userId, id), theme: await this.store.theme(id) };
  }

  private async make(userId: string, id: string, version: string, fileName: string): Promise<StoredPdf> {
    let pdf: Buffer;
    try {
      pdf = await this.renderer.render(this.printUrl(id, this.tokens.sign(userId, id)));
    } catch (error) {
      throw new PdfUnavailableError(
        `The CV PDF could not be made: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const made = { version, fileName, pdf };
    await this.store.save(id, made);
    return made;
  }
}
