import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';
import { AUTH_API } from '../../src/modules/auth/auth.tokens';
import { RESUMES_API } from '../../src/modules/resumes/resumes.tokens';
import { JobsModule } from '../../src/modules/jobs/jobs.module';
import { JOB_READ_SCHEDULER, JOB_REPOSITORY, RESUME_LINK_READER } from '../../src/modules/jobs/jobs.tokens';
import { exampleJob, MemoryJobs, queuedJobs, structuredPosting } from '../fixtures/jobs-clean';

test('jobs module starts with fake providers and preserves HTTP auth, schemas, responses and statuses', async (context) => {
  const jobs = new MemoryJobs(exampleJob({ structuredData: structuredPosting() }));
  const queue = queuedJobs();
  let startups = 0;
  const pending = jobs.pendingIds.bind(jobs);
  jobs.pendingIds = () => {
    startups++;
    return pending();
  };
  const module = await Test.createTestingModule({ imports: [JobsModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(ClaudeProcessRunner)
    .useValue({ complete: () => Promise.reject(new Error('HTTP tests must never call real AI.')) })
    .overrideProvider(JOB_REPOSITORY)
    .useValue(jobs)
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue(queue)
    .overrideProvider(RESUME_LINK_READER)
    .useValue({ latestIdsForJobs: () => Promise.resolve({ 'job-1': 'resume-copy-1' }) })
    .overrideProvider(RESUMES_API)
    .useValue({})
    .overrideProvider(AUTH_API)
    .useValue({
      resolveSyncToken: (token: string) =>
        token === 'test-token'
          ? Promise.resolve('owner')
          : Promise.reject(new UnauthorizedException('Invalid sync token.')),
    })
    .compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((request: Request, _response: Response, next: NextFunction) => {
    const userId = request.headers['x-test-user'];
    Object.assign(request, { session: typeof userId === 'string' ? { userId } : undefined });
    next();
  });
  await app.listen(0, '127.0.0.1');
  context.after(() => app.close());
  const base = await app.getUrl();
  const request = (
    path: string,
    options: { method?: string; body?: unknown; user?: string; token?: string } = {},
  ) =>
    fetch(`${base}/api/jobs${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.user && { 'x-test-user': options.user }),
        ...(options.token && { authorization: `Bearer ${options.token}` }),
        ...(options.body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });

  await context.test(
    'one worker starts, missing login is 401 and foreign/missing jobs are both 404',
    async () => {
      assert.equal(startups, 1);
      assert.equal((await request('/job-1')).status, 401);
      assert.equal((await request('/job-1', { user: 'stranger' })).status, 404);
      const missing = await request('/missing', { user: 'owner' });
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), {
        message: 'No such job.',
        error: 'Not Found',
        statusCode: 404,
      });
      const detail = await request('/job-1', { user: 'owner' });
      assert.equal(detail.status, 200);
      const body = (await detail.json()) as Record<string, unknown>;
      assert.equal(body.status, 'saved');
      assert.equal(body.extraction, 'structured');
      assert.equal(body.capturedAt, '2026-10-01T12:00:00.000Z');
      assert.deepEqual(body.history, []);
      for (const privateField of ['userId', 'canonicalUrl', 'html', 'pageText', 'structuredData'])
        assert.ok(!(privateField in body));
    },
  );

  await context.test('PATCH and undo keep current shapes, event behavior and status codes', async () => {
    const invalid = await request('/job-1', { method: 'PATCH', user: 'owner', body: { status: 'hired' } });
    assert.equal(invalid.status, 400);
    const moved = await request('/job-1', {
      method: 'PATCH',
      user: 'owner',
      body: { title: '  ', remote: false, status: 'interview' },
    });
    assert.equal(moved.status, 200);
    const body = (await moved.json()) as {
      title: string | null;
      remote: boolean;
      status: string;
      history: { id: string }[];
    };
    assert.equal(body.title, null);
    assert.equal(body.remote, false);
    assert.equal(body.status, 'interview');
    assert.equal(body.history.length, 1);
    const same = await request('/job-1', { method: 'PATCH', user: 'owner', body: { status: 'interview' } });
    assert.equal(((await same.json()) as { history: unknown[] }).history.length, 1);
    const undo = await request('/job-1/status/undo', {
      method: 'POST',
      user: 'owner',
      body: { eventId: body.history[0].id },
    });
    assert.equal(undo.status, 200);
    assert.equal(((await undo.json()) as { status: string }).status, 'saved');
    assert.equal(
      (
        await request('/job-1/status/undo', {
          method: 'POST',
          user: 'owner',
          body: { eventId: body.history[0].id },
        })
      ).status,
      409,
    );
  });

  await context.test(
    'capture uses bearer auth and its existing job/created envelope, including recapture',
    async () => {
      assert.equal(
        (
          await request('/capture', {
            method: 'POST',
            user: 'owner',
            body: { url: 'https://jobs.example.com/new' },
          })
        ).status,
        401,
      );
      const input = {
        url: 'https://jobs.example.com/new?utm_source=x',
        jsonLd: structuredPosting('Captured title'),
      };
      const first = await request('/capture', { method: 'POST', token: 'test-token', body: input });
      assert.equal(first.status, 201);
      const body = (await first.json()) as {
        created: boolean;
        job: { id: string; extraction: string; title: string };
      };
      assert.equal(body.created, true);
      assert.equal(body.job.extraction, 'structured');
      const again = await request('/capture', {
        method: 'POST',
        token: 'test-token',
        body: { ...input, url: 'https://jobs.example.com/new?utm_campaign=y' },
      });
      assert.equal(again.status, 201);
      const recaptured = (await again.json()) as { created: boolean; job: { id: string } };
      assert.equal(recaptured.created, false);
      assert.equal(recaptured.job.id, body.job.id);
    },
  );

  await context.test(
    'manual create, list, reread and delete preserve existing success statuses',
    async () => {
      assert.equal(
        (await request('', { method: 'POST', user: 'owner', body: { description: '  ' } })).status,
        400,
      );
      const created = await request('', {
        method: 'POST',
        user: 'owner',
        body: { description: 'Build systems.', title: 'Title', company: 'Example' },
      });
      assert.equal(created.status, 201);
      const createdJob = (await created.json()) as { id: string };
      const list = await request('', { user: 'owner' });
      assert.equal(list.status, 200);
      const rows = (await list.json()) as Record<string, unknown>[];
      assert.equal(rows.find((job) => job.id === 'job-1')?.tailoredResumeId, 'resume-copy-1');
      assert.ok(rows.every((job) => !('description' in job) && !('pageText' in job)));
      const reread = await request('/job-1/reread', { method: 'POST', user: 'owner' });
      assert.equal(reread.status, 201);
      assert.equal(((await reread.json()) as { title: string }).title, 'Engineer');
      const removed = await request(`/${createdJob.id}`, { method: 'DELETE', user: 'owner' });
      assert.equal(removed.status, 204);
      assert.equal(await removed.text(), '');
      assert.equal((await request(`/${createdJob.id}`, { user: 'owner' })).status, 404);
    },
  );
});
