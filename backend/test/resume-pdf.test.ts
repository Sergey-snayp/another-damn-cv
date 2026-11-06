import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pdfFileName,
  pdfVersion,
  PdfNotReadyError,
  PdfUnavailableError,
} from '../src/modules/resumes/domain/resume-pdf';
import { HmacPrintTokens } from '../src/modules/resumes/adapters/outbound/pdf/print-tokens';
import { ResumePdfs } from '../src/modules/resumes/application/use-cases/resume-pdfs';
import type { StoredPdf } from '../src/modules/resumes/application/ports/resume-pdf';
import type { RenderedResume } from '../src/modules/resumes/contracts';

test('a PDF version changes with the CV version and its design', () => {
  const theme = { accent: '#123456' };
  assert.equal(pdfVersion(3, theme), pdfVersion(3, { accent: '#123456' }));
  assert.notEqual(pdfVersion(3, theme), pdfVersion(4, theme));
  assert.notEqual(pdfVersion(3, theme), pdfVersion(3, { accent: '#654321' }));
});

test('the PDF is named after the person, as Simplify names resumes', () => {
  assert.equal(pdfFileName({ firstName: 'Sergey', lastName: 'Proniuk' }), 'Sergey_Proniuk_Resume.pdf');
  assert.equal(pdfFileName({ firstName: ' Ana María ', lastName: "O'Neil" }), 'Ana_Maria_ONeil_Resume.pdf');
  assert.equal(pdfFileName(null), 'Resume.pdf');
});

test('application PDFs retain full name, CV, company and role', () => {
  assert.equal(
    pdfFileName(null, 'Sergey_Proniuk_CV_Box_Software_Engineer_III'),
    'Sergey_Proniuk_CV_Box_Software_Engineer_III.pdf',
  );
  assert.equal(pdfFileName(null, 'Sam Lee CV ACME / R&D Engineer.pdf'), 'Sam_Lee_CV_ACME_R_D_Engineer.pdf');
  assert.equal(pdfFileName(null, 'José_Коваль_CV_Box_Engineer'), 'José_Коваль_CV_Box_Engineer.pdf');
});

test('print links work for one CV, for two minutes', () => {
  let now = 1_000_000;
  const tokens = new HmacPrintTokens('secret', () => now);
  const token = tokens.sign('user-1', 'cv-1');
  assert.equal(tokens.verify(token, 'cv-1'), 'user-1');
  assert.equal(tokens.verify(token, 'cv-2'), null);
  assert.equal(tokens.verify(token.replace('user-1', 'user-2'), 'cv-1'), null);
  assert.equal(new HmacPrintTokens('other').verify(token, 'cv-1'), null);
  now += 121_000;
  assert.equal(tokens.verify(token, 'cv-1'), null);
});

function setup(snapshot = 1, applicationName: string | null = null) {
  const cv = { snapshot, contact: { firstName: 'Sergey', lastName: 'Proniuk' } } as unknown as RenderedResume;
  const rendered: string[] = [];
  let kept: StoredPdf | null = null;
  let theme: unknown = null;
  let fail = false;
  const pdfs = new ResumePdfs(
    { assertOwned: () => Promise.resolve(), current: () => Promise.resolve(cv) },
    {
      applicationName: () => Promise.resolve(applicationName),
      theme: () => Promise.resolve(theme),
      setTheme: (_id, next) => {
        theme = next;
        return Promise.resolve();
      },
      rename: (_id, name) => {
        if (applicationName !== null) applicationName = name;
        return Promise.resolve();
      },
      find: () => Promise.resolve(kept),
      save: (_id, pdf) => {
        kept = pdf;
        return Promise.resolve();
      },
    },
    {
      render: async (url) => {
        rendered.push(url);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (fail) throw new Error('Chrome is not there');
        return Buffer.from(`%PDF ${rendered.length}`);
      },
    },
    new HmacPrintTokens('secret'),
    (id, token) => `http://app/print/resumes/${id}?token=${token}`,
  );
  return { pdfs, cv, rendered, fail: () => (fail = true) };
}

test('only explicit generation makes a PDF; reads and design changes never print', async () => {
  const { pdfs, cv, rendered } = setup();
  await assert.rejects(pdfs.file('u', 'cv'), PdfNotReadyError);
  assert.equal(rendered.length, 0, 'opening or downloading a missing PDF never creates one');
  const [first, second] = await Promise.all([pdfs.generate('u', 'cv'), pdfs.generate('u', 'cv')]);
  assert.equal(rendered.length, 1, 'two requests at once make one PDF');
  assert.equal(first.fileName, 'Sergey_Proniuk_Resume.pdf');
  assert.equal(second.pdf.toString(), '%PDF 1');
  await pdfs.file('u', 'cv');
  assert.equal(rendered.length, 1, 'the kept PDF is reused');
  (cv as { snapshot: number }).snapshot = 2;
  await assert.rejects(pdfs.file('u', 'cv'), PdfNotReadyError);
  assert.equal(rendered.length, 1, 'saving a new version does not print or return the old PDF');
  await pdfs.generate('u', 'cv');
  assert.equal(rendered.length, 2, 'the explicit Save action creates the PDF for that version');
  await pdfs.setTheme('u', 'cv', { accent: '#000000' });
  assert.equal(rendered.length, 2, 'a new design does not make a PDF in the background');
  await assert.rejects(pdfs.file('u', 'cv'), PdfNotReadyError);
  await pdfs.generate('u', 'cv');
  assert.equal(rendered.length, 3, 'Save creates the PDF after the new design is persisted');
  assert.match(rendered[0], /^http:\/\/app\/print\/resumes\/cv\?token=u\./);
});

test('cached application PDFs use the latest CV name without printing on download or rename', async () => {
  const { pdfs, rendered } = setup(1, 'Sergey_Proniuk_CV_Box_Software_Engineer_III');
  const made = await pdfs.generate('u', 'cv');
  assert.equal(made.fileName, 'Sergey_Proniuk_CV_Box_Software_Engineer_III.pdf');
  await pdfs.rename('u', 'cv', 'Sergey_Proniuk_CV_Acme_Backend_Engineer');
  const downloaded = await pdfs.file('u', 'cv');
  const saved = await pdfs.generate('u', 'cv');
  assert.equal(downloaded.fileName, 'Sergey_Proniuk_CV_Acme_Backend_Engineer.pdf');
  assert.equal(saved.fileName, downloaded.fileName);
  assert.deepEqual(downloaded.pdf, made.pdf);
  assert.equal(rendered.length, 1);
});

test('the print view needs a valid link, and a failed print says why', async () => {
  const { pdfs, rendered, fail } = setup();
  assert.equal(await pdfs.printView('nonsense', 'cv'), null);
  await pdfs.generate('u', 'cv');
  const token = decodeURIComponent(rendered[0].split('token=')[1]);
  assert.ok(await pdfs.printView(token, 'cv'));
  fail();
  await pdfs.setTheme('u', 'cv', { accent: '#111111' });
  await assert.rejects(
    pdfs.generate('u', 'cv'),
    (error: unknown) => error instanceof PdfUnavailableError && /Chrome is not there/.test(error.message),
  );
});

test('a PDF cannot be created before the CV has a saved version', async () => {
  const { pdfs, rendered } = setup(0);
  await assert.rejects(pdfs.generate('u', 'cv'), PdfNotReadyError);
  assert.equal(rendered.length, 0);
});
