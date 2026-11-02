import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import {
  EXCEPTION_FILTERS_METADATA,
  FILTER_CATCH_EXCEPTIONS,
  GUARDS_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ClaudeProcessRunner } from '../src/shared/ai/claude-process.runner';
import { AUTH_API } from '../src/modules/auth/auth.tokens';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { JOB_READ_SCHEDULER, JOB_REPOSITORY, RESUME_LINK_READER } from '../src/modules/jobs/jobs.tokens';
import { ListJobs } from '../src/modules/jobs/application/use-cases/list-jobs';
import { PublicResumeLinkReader } from '../src/modules/jobs/adapters/outbound/modules/resume-link.reader';
import { ProfilesModule } from '../src/modules/profiles/profiles.module';
import { ResumesModule } from '../src/modules/resumes/resumes.module';
import { RESUMES_API } from '../src/modules/resumes/resumes.tokens';
import { ResumeError, type ResumesApi } from '../src/modules/resumes/contracts';
import { ResumeOwnerGuard } from '../src/modules/resumes/http';
import { ResumesController } from '../src/modules/resumes/adapters/inbound/http/resumes.controller';
import { PrismaResumeRepository } from '../src/modules/resumes/adapters/outbound/persistence/prisma-resume.repository';
import { TailoringModule } from '../src/modules/tailoring/tailoring.module';
import { TailoringController } from '../src/modules/tailoring/adapters/inbound/http/tailoring.controller';
import { TailoringErrorFilter } from '../src/modules/tailoring/adapters/inbound/http/tailoring-error.filter';
import { exampleJob, MemoryJobs, queuedJobs } from './fixtures/jobs-clean';

test('full feature graph starts one database lifecycle, AI provider and job worker without external I/O', async () => {
  let connections = 0;
  let disconnections = 0;
  let runners = 0;
  let readers = 0;
  const jobs = new MemoryJobs();
  jobs.pendingIds = () => {
    readers++;
    return Promise.resolve([]);
  };
  const database = {
    onModuleInit: () => {
      connections++;
    },
    onModuleDestroy: () => {
      disconnections++;
    },
  };
  const runner = {
    onModuleInit: () => {
      runners++;
    },
    complete: () => Promise.reject(new Error('Audit must never call AI.')),
  };
  const module = await Test.createTestingModule({
    imports: [ProfilesModule, ResumesModule, JobsModule, TailoringModule],
  })
    .overrideProvider(PrismaService)
    .useValue(database)
    .overrideProvider(ClaudeProcessRunner)
    .useValue(runner)
    .overrideProvider(JOB_REPOSITORY)
    .useValue(jobs)
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue(queuedJobs())
    .overrideProvider(RESUME_LINK_READER)
    .useValue({ latestIdsForJobs: () => Promise.resolve({}) })
    .overrideProvider(RESUMES_API)
    .useValue({})
    .overrideProvider(AUTH_API)
    .useValue({})
    .compile();
  try {
    await module.init();
    assert.equal(connections, 1);
    assert.equal(runners, 1);
    assert.equal(readers, 1);
    assert.equal(module.get(PrismaService), database);
    assert.equal(module.get(ClaudeProcessRunner), runner);
  } finally {
    await module.close();
  }
  assert.equal(disconnections, 1);
});

test('resume routes keep ownership guards before body pipes, including tailoring routes moved to another controller', () => {
  const guards = (Reflect.getMetadata(GUARDS_METADATA, ResumesController) ?? []) as unknown[];
  assert.ok(guards.includes(ResumeOwnerGuard));
  for (const name of ['pending', 'discard']) {
    const action = Object.getOwnPropertyDescriptor(TailoringController.prototype, name)?.value as object;
    const routeGuards = (Reflect.getMetadata(GUARDS_METADATA, action) ?? []) as unknown[];
    assert.ok(routeGuards.includes(ResumeOwnerGuard));
  }
  const filters = (Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, TailoringController) ?? []) as unknown[];
  assert.ok(filters.includes(TailoringErrorFilter));
  const handledErrors = (Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, TailoringErrorFilter) ??
    []) as unknown[];
  assert.ok(
    handledErrors.includes(ResumeError),
    'The resume guard throws ResumeError before the tailoring use case runs.',
  );
});

test('a missing/foreign resume from the moved tailoring guard is presented as 404, not 500', async () => {
  const guard = new ResumeOwnerGuard({
    assertOwned: () => Promise.reject(new ResumeError('not-found', 'No such resume.')),
  } as unknown as ResumesApi);
  const request = { userId: 'stranger', params: { id: 'resume-owned' } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  let error: unknown;
  try {
    await guard.canActivate(context);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof ResumeError);
  let status: number | undefined;
  let body: unknown;
  const response = {
    status: (code: number) => {
      status = code;
      return response;
    },
    json: (value: unknown) => {
      body = value;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new TailoringErrorFilter().catch(error, host);
  assert.equal(status, 404);
  assert.deepEqual(body, { statusCode: 404, message: 'No such resume.', error: 'Not Found' });
});

test('jobs list uses the latest created resume copy through an owner-scoped public query and preserves null links', async () => {
  const queries: unknown[] = [];
  const repository = new PrismaResumeRepository({
    resume: {
      findMany: (input: unknown) => {
        queries.push(input);
        return Promise.resolve([
          { id: 'new-copy', jobId: 'job-1' },
          { id: 'old-copy', jobId: 'job-1' },
        ]);
      },
    },
  } as unknown as PrismaService);
  const resumes = {
    latestIdsForJobs: (userId: string, ids: readonly string[]) => repository.latestIdsForJobs(userId, ids),
  };
  const jobs = new MemoryJobs(
    exampleJob(),
    exampleJob({ id: 'job-2' }),
    exampleJob({ id: 'foreign', userId: 'stranger' }),
  );
  const list = await new ListJobs(jobs, new PublicResumeLinkReader(resumes)).execute('owner');
  assert.deepEqual(
    list.map(({ job, tailoredResumeId }) => [job.id, tailoredResumeId]),
    [
      ['job-1', 'new-copy'],
      ['job-2', null],
    ],
  );
  assert.deepEqual(queries, [
    {
      where: { profile: { userId: 'owner' }, jobId: { in: ['job-1', 'job-2'] } },
      select: { id: true, jobId: true },
      orderBy: { createdAt: 'desc' },
    },
  ]);
});
