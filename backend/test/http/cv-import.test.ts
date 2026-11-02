import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Module, ServiceUnavailableException, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { AuthGuard } from '../../src/modules/auth/http';
import { CvImportController } from '../../src/modules/cv-import/adapters/inbound/http/cv-import.controller';
import { ClaudeCvTranscriber } from '../../src/modules/cv-import/adapters/outbound/ai/claude-cv.transcriber';
import { CvDocumentTextExtractor } from '../../src/modules/cv-import/adapters/outbound/documents/document-text.extractor';
import { ImportCv } from '../../src/modules/cv-import/application/use-cases/import-cv';
import type { ImportProposal } from '../../src/modules/cv-import/contracts';
import { IMPORT_CV } from '../../src/modules/cv-import/cv-import.tokens';
import { textDocx, textPdf } from '../fixtures/cv-import';

let reply = '{}';
let failure: Error | undefined;
const calls: { prompt: string; system: string }[] = [];
const runner = {
  complete: (prompt: string, system: string) => {
    calls.push({ prompt, system });
    return failure ? Promise.reject(failure) : Promise.resolve(reply);
  },
};
const importer = new ImportCv(new CvDocumentTextExtractor(), new ClaudeCvTranscriber(runner), {
  next: () => 'proposal-id',
});

@Module({
  controllers: [CvImportController],
  providers: [AuthGuard, { provide: IMPORT_CV, useValue: importer }],
})
class HttpFixtureModule {}

let app: INestApplication;
let base: string;
before(async () => {
  app = await NestFactory.create(HttpFixtureModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(session({ secret: 'cv-import-http-test-secret', resave: false, saveUninitialized: false }));
  // Only this fixture can turn a test header into an authenticated session.
  app.use((request: Request, _response: Response, next: NextFunction) => {
    if (request.headers['x-fixture-session'] === 'owner') request.session.userId = 'owner';
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  await app?.close();
});

async function upload(
  filename?: string,
  bytes: Uint8Array = Buffer.from('Ada Example'),
  authenticated = true,
  field = 'file',
) {
  const body = new FormData();
  if (filename) body.set(field, new Blob([new Uint8Array(bytes)]), filename);
  return fetch(`${base}/api/import/cv`, {
    method: 'POST',
    headers: authenticated ? { 'x-fixture-session': 'owner' } : {},
    body,
  });
}

test('HTTP requires a session and keeps the missing-file error', async () => {
  failure = undefined;
  const count = calls.length;
  const unauthorized = await upload('resume.txt', Buffer.from('CV'), false);
  assert.equal(unauthorized.status, 401);
  assert.equal(((await unauthorized.json()) as { message: string }).message, 'Not signed in.');
  const missing = await upload();
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as { message: string }).message, 'No file was uploaded.');
  assert.equal(calls.length, count);
});

test('HTTP retains multipart file field, 201 proposal fields, text cleaning and no automatic save', async () => {
  failure = undefined;
  reply = '{"fullName":"Ada Example","email":"ada@example.com","skills":["TypeScript"]}';
  const response = await upload('resume.TXT', Buffer.from(' Ada\t Example\r\nBuild soft-\nware '));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    id: 'proposal-id',
    proposed: { fullName: 'Ada Example', email: 'ada@example.com', skills: ['TypeScript'] },
    charsRead: 'Ada Example\nBuild software'.length,
    notFound: ['phone', 'location', 'linkedin', 'github'],
  });
  assert.match(calls.at(-1)!.prompt, /<cv>\nAda Example\nBuild software\n<\/cv>/);
  assert.match(calls.at(-1)!.system, /TRANSCRIPTION, not writing/);
  const wrongField = await upload('resume.txt', Buffer.from('CV'), true, 'resume');
  assert.equal(wrongField.status, 400);
  assert.match(((await wrongField.json()) as { message: string }).message, /Unexpected field/);
});

test('HTTP supports synthetic Markdown, DOCX and text PDF uploads', async () => {
  failure = undefined;
  reply = '{}';
  const files: [string, Buffer][] = [
    ['resume.md', Buffer.from('# Ada Example\nTypeScript developer')],
    ['resume.docx', textDocx(['Ada Example', 'Built TypeScript services.'])],
    [
      'resume.pdf',
      textPdf(
        Array.from(
          { length: 6 },
          (_, index) => `Role ${index}: Built TypeScript services and preserved candidate claims.`,
        ),
      ),
    ],
  ];
  for (const [filename, bytes] of files) {
    const response = await upload(filename, bytes);
    assert.equal(response.status, 201, filename);
    const proposal = (await response.json()) as ImportProposal;
    assert.equal(proposal.id, 'proposal-id');
    assert.ok(proposal.charsRead > 0);
    assert.deepEqual(proposal.proposed, {});
    assert.deepEqual(proposal.notFound, ['email', 'phone', 'location', 'linkedin', 'github']);
  }
});

test('HTTP maps unsupported files and short/scanned PDFs to their existing 400 messages', async () => {
  failure = undefined;
  const count = calls.length;
  const unsupported = await upload('resume.rtf');
  assert.equal(unsupported.status, 400);
  assert.equal(
    ((await unsupported.json()) as { message: string }).message,
    'Unsupported file type ".rtf". Send a PDF, DOCX or TXT.',
  );
  const scanned = await upload('resume.pdf', textPdf(['Ada Example']));
  assert.equal(scanned.status, 400);
  assert.equal(
    ((await scanned.json()) as { message: string }).message,
    'That PDF has almost no extractable text — it is probably a scan. Send the DOCX, or export a text-based PDF.',
  );
  assert.equal(calls.length, count);
});

test('HTTP preserves malformed model reply messages and provider failure status', async () => {
  for (const [raw, message] of [
    ['No object', 'Could not read that CV — no structured data came back.'],
    ['{"email": }', 'Could not read that CV — the parsed data was malformed.'],
    ['{"email":"ada@example.com"', 'Could not read that CV — the parsed data was incomplete.'],
  ]) {
    failure = undefined;
    reply = raw;
    const response = await upload('resume.txt');
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { message: string }).message, message);
  }
  failure = new ServiceUnavailableException('The AI took too long to answer. Try again.');
  const unavailable = await upload('resume.txt');
  assert.equal(unavailable.status, 503);
  assert.equal(((await unavailable.json()) as { message: string }).message, failure.message);
  failure = undefined;
});

test('HTTP retains the existing Multer limit just below and at 10 MiB', async () => {
  failure = undefined;
  reply = '{}';
  const max = 10 * 1024 * 1024;
  const allowed = await upload('resume.txt', Buffer.alloc(max - 1, 'a'));
  assert.equal(allowed.status, 201);
  assert.equal(((await allowed.json()) as ImportProposal).charsRead, max - 1);
  const count = calls.length;
  for (const size of [max, max + 1]) {
    const rejected = await upload('resume.txt', Buffer.alloc(size, 'a'));
    assert.equal(rejected.status, 413);
    assert.match(((await rejected.json()) as { message: string }).message, /File too large/);
  }
  assert.equal(calls.length, count);
});
