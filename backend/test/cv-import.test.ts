import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { ImportCv } from '../src/modules/cv-import/application/use-cases/import-cv';
import { CvImportError } from '../src/modules/cv-import/application/errors';
import { ClaudeCvTranscriber } from '../src/modules/cv-import/adapters/outbound/ai/claude-cv.transcriber';
import { parseTranscription } from '../src/modules/cv-import/adapters/outbound/ai/transcription.parser';
import { CvDocumentTextExtractor } from '../src/modules/cv-import/adapters/outbound/documents/document-text.extractor';
import { IMPORT_PROMPT_BASELINE, READABLE_PDF_TEXT, textDocx, textPdf } from './fixtures/cv-import';

test('ImportCv returns a proposal and reports missing fields without a persistence dependency', async () => {
  const calls: string[] = [];
  const proposed = {
    fullName: 'Ada Example',
    email: 'ada@example.com',
    phone: '',
    github: 'https://github.com/example',
    experience: [
      { company: 'Example', title: 'Engineer', from: '2020-01', bullets: ['Kept my own wording.'] },
    ],
  };
  const importer = new ImportCv(
    {
      extract: (bytes, filename) => {
        calls.push(`${filename}:${bytes.length}`);
        return Promise.resolve('Clean CV text');
      },
    },
    {
      transcribe: (text) => {
        calls.push(text);
        return Promise.resolve(proposed);
      },
    },
    { next: () => 'proposal-id' },
  );
  const result = await importer.execute({ bytes: new Uint8Array([1, 2, 3]), filename: 'resume.txt' });
  assert.deepEqual(result, {
    id: 'proposal-id',
    proposed,
    charsRead: 13,
    notFound: ['phone', 'location', 'linkedin'],
  });
  assert.deepEqual(calls, ['resume.txt:3', 'Clean CV text']);
  assert.equal(result.proposed, proposed);
});

test('transcription accepts prose/fences, escaped quotes and nested objects without tightening validation', () => {
  const proposed = {
    email: 'ada@example.com',
    summary: 'My "quoted" {claim}',
    skills: ['TypeScript'],
    unknownMetadata: { kept: true },
  };
  const reply = `Here is the result:\n\`\`\`json\n${JSON.stringify(proposed)}\n\`\`\`\nextra prose`;
  assert.deepEqual(parseTranscription(reply), proposed);
  assert.deepEqual(parseTranscription('{}'), {});
});

test('transcription retains separate no-data, malformed and incomplete error messages', () => {
  for (const [reply, message] of [
    ['No object', 'Could not read that CV — no structured data came back.'],
    ['{"email": }', 'Could not read that CV — the parsed data was malformed.'],
    ['{"email":"ada@example.com"', 'Could not read that CV — the parsed data was incomplete.'],
  ])
    assert.throws(
      () => parseTranscription(reply),
      (error: unknown) => error instanceof CvImportError && error.message === message,
    );
});

test('document extraction preserves text/Markdown spacing and unsupported-extension errors', async () => {
  const extractor = new CvDocumentTextExtractor();
  const bytes = Buffer.from('  Ada\t Example\r\nBuild soft-\nware\r\n\r\n\r\n  Done.  ');
  for (const filename of ['resume.TXT', 'resume.MD']) {
    const text = await extractor.extract(bytes, filename);
    assert.equal(text, 'Ada Example\nBuild software\n\nDone.');
  }
  await assert.rejects(
    extractor.extract(bytes, 'resume.rtf'),
    /Unsupported file type ".rtf". Send a PDF, DOCX or TXT./,
  );
  await assert.rejects(extractor.extract(bytes, 'resume'), /Unsupported file type "."/);
});

test('synthetic DOCX extraction retains paragraphs and candidate wording', async () => {
  const bytes = textDocx(['Ada Example', 'Built TypeScript services & kept exact claims.']);
  const text = await new CvDocumentTextExtractor().extract(bytes, 'resume.docx');
  assert.equal(text, 'Ada Example\n\nBuilt TypeScript services & kept exact claims.');
});

test('synthetic PDF extraction retains readable text and the existing scan threshold', async () => {
  const extractor = new CvDocumentTextExtractor();
  const readable = textPdf(
    Array.from(
      { length: 6 },
      (_, i) => `Role ${i}: Built TypeScript services and preserved candidate claims.`,
    ),
  );
  const text = await extractor.extract(readable, 'resume.pdf');
  assert.ok(text.length >= 200);
  assert.match(text, /Built TypeScript services/);
  assert.equal(text, READABLE_PDF_TEXT);
  const short = textPdf(['Ada Example']);
  await assert.rejects(
    extractor.extract(short, 'resume.pdf'),
    (error: unknown) =>
      error instanceof CvImportError &&
      error.message ===
        'That PDF has almost no extractable text — it is probably a scan. Send the DOCX, or export a text-based PDF.',
  );
});

test('import matches recorded prompt bytes, truncation, full charsRead and proposal data', async () => {
  const text = `Ada Example\n${'a'.repeat(25000)}`;
  const proposed = { email: 'ada@example.com', phone: '', skills: ['TypeScript'], extra: { preserve: true } };
  const calls: { prompt: string; system: string }[] = [];
  const runner = {
    complete: (prompt: string, system: string) => {
      calls.push({ prompt, system });
      return Promise.resolve(JSON.stringify(proposed));
    },
  };
  const importer = new ImportCv({ extract: () => Promise.resolve(text) }, new ClaudeCvTranscriber(runner), {
    next: () => 'new-id',
  });
  const next = await importer.execute({ bytes: new Uint8Array(), filename: 'resume.txt' });
  assert.equal(calls.length, 1);
  assert.equal(
    createHash('sha256').update(calls[0].system).digest('hex'),
    IMPORT_PROMPT_BASELINE.systemSha256,
  );
  assert.equal(
    createHash('sha256').update(calls[0].prompt).digest('hex'),
    IMPORT_PROMPT_BASELINE.promptSha256,
  );
  assert.equal(calls[0].prompt.slice('<cv>\n'.length).split('\n</cv>')[0].length, 24000);
  assert.deepEqual(next, {
    id: 'new-id',
    proposed: { email: 'ada@example.com', phone: '', skills: ['TypeScript'], extra: { preserve: true } },
    charsRead: IMPORT_PROMPT_BASELINE.textLength,
    notFound: ['phone', 'location', 'linkedin', 'github'],
  });
  assert.equal(text.length, IMPORT_PROMPT_BASELINE.textLength);
});

test('provider failures keep their existing status and never produce a proposal id', async () => {
  const failure = new ServiceUnavailableException('The AI took too long to answer. Try again.');
  let generated = false;
  const transcriber = new ClaudeCvTranscriber({ complete: () => Promise.reject(failure) });
  const importer = new ImportCv({ extract: () => Promise.resolve('CV text') }, transcriber, {
    next: () => {
      generated = true;
      return 'id';
    },
  });
  await assert.rejects(
    importer.execute({ bytes: new Uint8Array(), filename: 'resume.txt' }),
    (error: unknown) => error === failure,
  );
  assert.equal(generated, false);
});
