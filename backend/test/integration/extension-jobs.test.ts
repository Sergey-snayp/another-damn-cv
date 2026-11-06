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

let app: INestApplication, base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
const token = randomUUID(),
  otherToken = randomUUID();
function call(
  path: string,
  options: { method?: string; token?: string; user?: string; body?: unknown } = {},
) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token && { authorization: `Bearer ${options.token}` }),
      ...(options.user && { 'x-test-user': options.user }),
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}
before(async () => {
  migrateTestDatabase();
  owner = await createUser('Extension job owner');
  other = await createUser('Other owner');
  await prisma.user.update({ where: { id: owner.user.id }, data: { syncToken: token } });
  await prisma.user.update({ where: { id: other.user.id }, data: { syncToken: otherToken } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue() {} })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((request: Request, _response: Response, next: NextFunction) => {
    Object.assign(request, { session: { userId: request.headers['x-test-user'] } });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

test('the saved extension form and web app read and edit the same job without duplicates or lost status/application data', async () => {
  const url = `https://jobs.example.com/${randomUUID()}`;
  const captured = await call('/jobs/capture', {
    method: 'POST',
    token,
    body: {
      url,
      jsonLd: [
        {
          '@type': 'JobPosting',
          title: 'Engineer',
          hiringOrganization: { name: 'Acme' },
          description: 'Build reliable services.',
        },
      ],
    },
  });
  assert.equal(captured.status, 201);
  const { job } = (await captured.json()) as { job: { id: string } };
  const path = `/extension/jobs/${job.id}`;
  await call(`/jobs/${job.id}`, { method: 'PATCH', user: owner.user.id, body: { status: 'interview' } });
  await call(`/jobs/${job.id}/application`, {
    method: 'POST',
    token,
    body: { answers: [{ question: 'Why Acme?', answer: 'The product.' }] },
  });
  const read = await call(path, { token });
  assert.equal(read.status, 200);
  const before = (await read.json()) as {
    appliedAt: string;
    history: unknown[];
    applicationAnswers: unknown;
  };
  assert.equal((await call(path)).status, 401);
  assert.equal((await call(path, { token: otherToken })).status, 404);
  assert.equal(
    (await call(path, { method: 'PATCH', token: otherToken, body: { title: 'Not mine' } })).status,
    404,
  );
  const updated = await call(path, {
    method: 'PATCH',
    token,
    body: {
      title: 'Reviewed Engineer',
      company: 'Acme',
      location: 'Remote',
      notes: 'Follow up next week.',
      salaryMin: 110000,
      salaryMax: 90000,
      salaryCurrency: 'usd',
      salaryPeriod: 'year',
      status: 'interview',
      url,
    },
  });
  assert.equal(updated.status, 200);
  const web = (await (await call(`/jobs/${job.id}`, { user: owner.user.id })).json()) as {
    id: string;
    title: string;
    status: string;
    salaryMin: number;
    salaryMax: number;
    salaryCurrency: string;
    notes: string;
    appliedAt: string;
    history: unknown[];
    applicationAnswers: unknown;
  };
  assert.equal(web.id, job.id);
  assert.equal(web.title, 'Reviewed Engineer');
  assert.equal(web.status, 'interview');
  assert.equal(web.salaryMin, 90000);
  assert.equal(web.salaryMax, 110000);
  assert.equal(web.salaryCurrency, 'USD');
  assert.equal(web.notes, 'Follow up next week.');
  assert.equal(web.appliedAt, before.appliedAt);
  assert.deepEqual(web.history, before.history);
  assert.deepEqual(web.applicationAnswers, before.applicationAnswers);
  assert.equal(await prisma.job.count({ where: { userId: owner.user.id } }), 1);
  const lookup = (await (await call(`/jobs/lookup?url=${encodeURIComponent(url)}`, { token })).json()) as {
    job: { id: string };
  };
  assert.equal(lookup.job.id, job.id);
});
