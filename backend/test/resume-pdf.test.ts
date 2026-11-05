import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfFileName, pdfVersion, PdfUnavailableError } from '../src/modules/resumes/domain/resume-pdf';
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

function setup(snapshot = 1) {
  const cv = { snapshot, contact: { firstName: 'Sergey', lastName: 'Proniuk' } } as unknown as RenderedResume;
  const rendered: string[] = [];
  let kept: StoredPdf | null = null;
  let theme: unknown = null;
  let fail = false;
  const pdfs = new ResumePdfs(
    { assertOwned: () => Promise.resolve(), current: () => Promise.resolve(cv) },
    {
      theme: () => Promise.resolve(theme),
      setTheme: (_id, next) => {
        theme = next;
        return Promise.resolve();
      },
      rename: () => Promise.resolve(),
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

test('a CV PDF is made once per version and design, and kept', async () => {
  const { pdfs, cv, rendered } = setup();
  const [first, second] = await Promise.all([pdfs.file('u', 'cv'), pdfs.file('u', 'cv')]);
  assert.equal(rendered.length, 1, 'two requests at once make one PDF');
  assert.equal(first.fileName, 'Sergey_Proniuk_Resume.pdf');
  assert.equal(second.pdf.toString(), '%PDF 1');
  await pdfs.file('u', 'cv');
  assert.equal(rendered.length, 1, 'the kept PDF is reused');
  (cv as { snapshot: number }).snapshot = 2;
  await pdfs.file('u', 'cv');
  assert.equal(rendered.length, 2, 'a new CV version makes a new PDF');
  await pdfs.setTheme('u', 'cv', { accent: '#000000' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(rendered.length, 3, 'a new design makes a new PDF in the background');
  assert.match(rendered[0], /^http:\/\/app\/print\/resumes\/cv\?token=u\./);
});

test('the print view needs a valid link, and a failed print says why', async () => {
  const { pdfs, rendered, fail } = setup();
  assert.equal(await pdfs.printView('nonsense', 'cv'), null);
  await pdfs.file('u', 'cv');
  const token = decodeURIComponent(rendered[0].split('token=')[1]);
  assert.ok(await pdfs.printView(token, 'cv'));
  fail();
  await pdfs.setTheme('u', 'cv', { accent: '#111111' });
  await assert.rejects(
    pdfs.file('u', 'cv'),
    (error: unknown) => error instanceof PdfUnavailableError && /Chrome is not there/.test(error.message),
  );
});
