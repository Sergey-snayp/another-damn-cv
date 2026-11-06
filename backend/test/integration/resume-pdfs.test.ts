import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';
import { PDF_RENDERER } from '../../src/modules/resumes/resumes.tokens';

let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let ownerToken: string, otherToken: string;
const printed: string[] = [];

function call(
  path: string,
  options: { method?: string; body?: unknown; user?: string; token?: string } = {},
) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.user && { 'x-test-user': options.user }),
      ...(options.token && { authorization: `Bearer ${options.token}` }),
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Pdf Owner');
  other = await createUser('Pdf Other');
  [ownerToken, otherToken] = [`token-${randomUUID()}`, `token-${randomUUID()}`];
  await prisma.user.update({ where: { id: owner.user.id }, data: { syncToken: ownerToken } });
  await prisma.user.update({ where: { id: other.user.id }, data: { syncToken: otherToken } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    // The server's Chrome stands in: it records the print link and returns a tiny PDF.
    .overrideProvider(PDF_RENDERER)
    .useValue({
      render: (url: string) => {
        printed.push(url);
        return Promise.resolve(Buffer.from(`%PDF-1.4 test ${printed.length}`));
      },
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _response: Response, next: NextFunction) => {
    const id = req.headers['x-test-user'];
    Object.assign(req, { session: typeof id === 'string' ? { userId: id } : {} });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

const theme = {
  template: 'professional',
  accent: '#134e4a',
  fontFamily: 'Georgia, serif',
  fontSize: 10.5,
  lineHeight: 1.4,
  sectionGap: 14,
};

test('Save explicitly creates the PDF after the CV; reads, edits and layout saves never print', async () => {
  const initialPrints = printed.length;
  const cv = (await (
    await call('/resumes', { method: 'POST', user: owner.user.id, body: { name: 'Server CV' } })
  ).json()) as { id: string };
  assert.equal((await call(`/resumes/${cv.id}/pdf`, { method: 'POST', user: owner.user.id })).status, 409);
  await call(`/resumes/${cv.id}/save`, {
    method: 'POST',
    user: owner.user.id,
    body: {
      contact: { firstName: 'Sergey', lastName: 'Proniuk', email: 's@example.com' },
      summaries: [{ variant: 'default', text: 'Engineer.' }],
    },
  });
  assert.equal(printed.length, initialPrints, 'creating and saving the CV never generates a PDF');
  assert.equal((await call(`/resumes/${cv.id}/pdf`, { user: owner.user.id })).status, 409);
  assert.equal((await call(`/extension/resumes/${cv.id}/pdf`, { token: ownerToken })).status, 409);

  // The design moves to the server.
  assert.equal(
    (
      await call(`/resumes/${cv.id}/theme`, {
        method: 'PUT',
        user: owner.user.id,
        body: { ...theme, fontSize: 99 },
      })
    ).status,
    400,
  );
  const saved = await call(`/resumes/${cv.id}/theme`, { method: 'PUT', user: owner.user.id, body: theme });
  assert.equal(saved.status, 200);
  assert.deepEqual(
    ((await (await call(`/resumes/${cv.id}/theme`, { user: owner.user.id })).json()) as { theme: unknown })
      .theme,
    theme,
  );
  assert.equal((await call(`/resumes/${cv.id}/theme`, { user: other.user.id })).status, 404);
  assert.equal(printed.length, initialPrints, 'layout changes never generate a PDF');
  assert.equal((await call(`/resumes/${cv.id}/pdf`, { method: 'POST', user: other.user.id })).status, 404);
  assert.equal((await call(`/resumes/${cv.id}/pdf`, { method: 'POST' })).status, 401);
  assert.equal((await call(`/resumes/${cv.id}/pdf`, { method: 'POST', user: owner.user.id })).status, 200);
  assert.equal(printed.length, initialPrints + 1);

  const before = printed.length;
  const file = await call(`/extension/resumes/${cv.id}/pdf`, { token: ownerToken });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.match(
    file.headers.get('content-disposition') ?? '',
    /attachment; filename="Sergey_Proniuk_Resume.pdf"/,
  );
  assert.match(Buffer.from(await file.arrayBuffer()).toString(), /^%PDF-1\.4/);
  await call(`/extension/resumes/${cv.id}/pdf`, { token: ownerToken });
  assert.equal(printed.length, before, 'the extension only downloads the PDF made by Save');
  assert.equal((await call(`/extension/resumes/${cv.id}/pdf`, { token: otherToken })).status, 404);

  // The print link the server's Chrome opens works once signed, and only for this CV.
  const link = new URL(printed.at(-1)!);
  assert.equal(link.pathname, `/print/resumes/${cv.id}`);
  const view = await call(
    `/print/resumes/${cv.id}?token=${encodeURIComponent(link.searchParams.get('token')!)}`,
  );
  assert.equal(view.status, 200);
  assert.deepEqual(((await view.json()) as { theme: unknown }).theme, theme);
  assert.equal((await call(`/print/resumes/${cv.id}?token=bad`)).status, 401);

  // Editing the saved CV leaves printing for the next explicit Save action.
  await call(`/resumes/${cv.id}/save`, {
    method: 'POST',
    user: owner.user.id,
    body: { summaries: [{ variant: 'default', text: 'Senior engineer.' }] },
  });
  assert.equal(printed.length, before);
  assert.equal(
    (await call(`/extension/resumes/${cv.id}/pdf`, { token: ownerToken })).status,
    409,
    'the extension cannot upload a stale PDF',
  );
  assert.equal(printed.length, before, 'requesting a stale PDF never creates one');
  assert.equal((await call(`/resumes/${cv.id}/pdf`, { method: 'POST', user: owner.user.id })).status, 200);
  assert.equal(printed.length, before + 1);
  const app = await call(`/resumes/${cv.id}/pdf`, { user: owner.user.id });
  assert.match(app.headers.get('content-disposition') ?? '', /^inline/);
  assert.equal(printed.length, before + 1, 'the app preview uses the kept PDF');
});

test('the editor renames a CV and keeps its section order with the design', async () => {
  const cv = (await (
    await call('/resumes', { method: 'POST', user: owner.user.id, body: { name: 'Old name' } })
  ).json()) as { id: string };
  const renamed = await call(`/resumes/${cv.id}/name`, {
    method: 'PATCH',
    user: owner.user.id,
    body: { name: '  Backend CV  ' },
  });
  assert.deepEqual(await renamed.json(), { name: 'Backend CV' });
  assert.equal(
    (await call(`/resumes/${cv.id}/name`, { method: 'PATCH', user: other.user.id, body: { name: 'Mine' } }))
      .status,
    404,
  );
  assert.equal(
    (await call(`/resumes/${cv.id}/name`, { method: 'PATCH', user: owner.user.id, body: { name: ' ' } }))
      .status,
    400,
  );
  const list = (await (await call('/resumes', { user: owner.user.id })).json()) as {
    id: string;
    name: string;
  }[];
  assert.equal(list.find((row) => row.id === cv.id)?.name, 'Backend CV');
  const design = {
    ...theme,
    sectionOrder: ['experience', 'summary', 'skills', 'education'],
    hiddenSections: ['skills'],
  };
  assert.equal(
    (await call(`/resumes/${cv.id}/theme`, { method: 'PUT', user: owner.user.id, body: design })).status,
    200,
  );
  assert.deepEqual(
    ((await (await call(`/resumes/${cv.id}/theme`, { user: owner.user.id })).json()) as { theme: unknown })
      .theme,
    design,
  );
});

test('app downloads and extension uploads retain the application CV name, including international names', async () => {
  for (const contact of [
    { firstName: 'Sergey', lastName: 'Proniuk', email: 's@example.com' },
    { firstName: 'José', lastName: 'Коваль', email: 'j@example.com' },
  ]) {
    const source = (await (
      await call('/resumes', {
        method: 'POST',
        user: owner.user.id,
        body: { name: 'Master CV' },
      })
    ).json()) as { id: string };
    await call(`/resumes/${source.id}/save`, { method: 'POST', user: owner.user.id, body: { contact } });
    const job = (await (
      await call('/jobs', {
        method: 'POST',
        user: owner.user.id,
        body: { title: 'Engineer (Remote)', company: 'Box', description: 'Build content creation services.' },
      })
    ).json()) as { id: string };
    const copyResponse = await call(`/jobs/${job.id}/tailor-copy`, {
      method: 'POST',
      user: owner.user.id,
      body: { sourceResumeId: source.id },
    });
    assert.equal(copyResponse.status, 200);
    const { resumeId } = (await copyResponse.json()) as { resumeId: string };
    const expected = `${contact.firstName}_${contact.lastName}_CV_Box_Engineer.pdf`;
    const before = printed.length;
    const generated = await call(`/resumes/${resumeId}/pdf`, { method: 'POST', user: owner.user.id });
    assert.equal(generated.status, 200);
    assert.equal(((await generated.json()) as { fileName: string }).fileName, expected);
    // An existing PDF with the old metadata is reused, with the correct response name.
    await prisma.resumePdf.update({ where: { resumeId }, data: { fileName: 'Old_Resume.pdf' } });
    const appFile = await call(`/resumes/${resumeId}/pdf?download=1`, { user: owner.user.id });
    const extensionFile = await call(`/extension/resumes/${resumeId}/pdf`, { token: ownerToken });
    assert.equal(appFile.status, 200);
    assert.equal(extensionFile.status, 200);
    const header = appFile.headers.get('content-disposition') ?? '';
    assert.match(header, /^attachment;/);
    assert.equal(extensionFile.headers.get('content-disposition'), header);
    const encoded = /filename\*=UTF-8''([^;\s]+)/i.exec(header)?.[1];
    assert.equal(encoded ? decodeURIComponent(encoded) : /filename="([^"]+)"/.exec(header)?.[1], expected);
    assert.deepEqual(await appFile.arrayBuffer(), await extensionFile.arrayBuffer());
    assert.equal(printed.length, before + 1, 'downloads do not regenerate the PDF to change its file name');
  }
});
