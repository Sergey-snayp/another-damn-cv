import puppeteer, { type Browser } from 'puppeteer-core';
import type { PdfRenderer } from '../../../application/ports/resume-pdf';

/**
 * The server's own headless Chrome prints the CV's print page, the same page
 * and print style the editor's Print / PDF uses, so the file looks the same.
 * One Chrome is kept and reused; PDFs are made one at a time.
 */
export class PuppeteerPdfRenderer implements PdfRenderer {
  private browser: Promise<Browser> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly chromePath: string) {}

  render(url: string): Promise<Buffer> {
    const run = this.queue.then(() => this.print(url));
    this.queue = run.catch(() => undefined);
    return run;
  }

  renderHtml(html: string): Promise<Buffer> {
    const run = this.queue.then(() => this.printHtml(html));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** A self-contained page (its fonts from Google Fonts), printed once its fonts are in. */
  private async printHtml(html: string): Promise<Buffer> {
    const page = await (await this.chrome()).newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      await page.evaluate('document.fonts.ready');
      return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private chrome(): Promise<Browser> {
    this.browser ??= puppeteer
      .launch({
        executablePath: this.chromePath,
        headless: true,
        args: ['--no-first-run', '--disable-extensions'],
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          this.browser = null;
        });
        return browser;
      })
      .catch((error: unknown) => {
        this.browser = null;
        throw error;
      });
    return this.browser;
  }

  private async print(url: string): Promise<Buffer> {
    const page = await (await this.chrome()).newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
      // The print page sets this once the CV and its fonts are drawn, or reports why not.
      await page.waitForFunction(
        'window.__resumeReady === true || typeof window.__resumeError === "string"',
        {
          timeout: 20_000,
        },
      );
      const problem = await page.evaluate('window.__resumeError');
      if (typeof problem === 'string') throw new Error(problem);
      return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browser = await this.browser?.catch(() => null);
    await browser?.close().catch(() => undefined);
  }
}
