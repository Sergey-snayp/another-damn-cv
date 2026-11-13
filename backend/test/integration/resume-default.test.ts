import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';

let app: INestApplication;
let base: string;

function call(path: string, user: string, options: { method?: string; body?: unknown } = {}) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: { 'x-test-user': user, ...(options.body !== undefined && { 'content-type': 'application/json' }) },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}
type Row = { id: string; name: string; isPrimary: boolean };
const list = async (user: string) => (await (await call('/resumes', user)).json()) as Row[];
const defaults = (rows: Row[]) => rows.filter((row) => row.isPrimary).map((row) => row.name);

before(async () => {
  migrateTestDatabase();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
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

test('there is always one default CV: the first made, until another is chosen; deleting it passes it on', async () => {
  const { user } = await createUser('Default CV');
  const other = await createUser('Someone Else');
  const create = async (name: string) => (await (await call('/resumes', user.id, { method: 'POST', body: { name } })).json()) as Row;
  const master = await create('Master');
  const second = await create('Backend');
  await create('Frontend');
  assert.deepEqual(defaults(await list(user.id)), ['Master'], 'none chosen: the first CV made');

  assert.equal((await call(`/resumes/${second.id}/default`, user.id, { method: 'PUT' })).status, 204);
  assert.deepEqual(defaults(await list(user.id)), ['Backend'], 'Make default moves it');
  assert.equal((await call(`/resumes/${second.id}/default`, other.user.id, { method: 'PUT' })).status, 404, "someone else's CV cannot be made default");

  assert.equal((await call(`/resumes/${second.id}`, user.id, { method: 'DELETE' })).status, 204);
  const rows = await prisma.resume.findMany({ where: { profile: { userId: user.id }, isPrimary: true }, select: { name: true } });
  assert.deepEqual(rows.map((row) => row.name), ['Master'], 'the default deleted: the first CV left takes over at once');
  assert.ok(master.id);
});
