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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const theme = {
  template: 'classic',
  accent: '#134e4a',
  fontFamily: 'Georgia, serif',
  fontSize: 10.5,
  lineHeight: 1.4,
  sectionGap: 14,
};

test('the server keeps each CV as a PDF, and the extension downloads it', async () => {
  const cv = (await (
    await call('/resumes', { method: 'POST', user: owner.user.id, body: { name: 'Server CV' } })
  ).json()) as { id: string };
  await call(`/resumes/${cv.id}/save`, {
    method: 'POST',
    user: owner.user.id,
    body: {
      contact: { firstName: 'Sergey', lastName: 'Proniuk', email: 's@example.com' },
      summaries: [{ variant: 'default', text: 'Engineer.' }],
    },
  });
  await wait(50);

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
  await wait(50);

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
  assert.equal(printed.length, before, 'the PDF made after the design change is reused, not made again');
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

  // A new version of the CV makes a new PDF in the background.
  await call(`/resumes/${cv.id}/save`, {
    method: 'POST',
    user: owner.user.id,
    body: { summaries: [{ variant: 'default', text: 'Senior engineer.' }] },
  });
  await wait(100);
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
