import { prisma, migrateTestDatabase, createUser } from './setup';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ResumeOwnerGuard, ResumeErrorFilter } from '../../src/modules/resumes/http';
import { ResumeError } from '../../src/modules/resumes/contracts';
import { createResumesApi } from '../../src/modules/resumes/application/resumes-api';
import { PrismaResumeRepository } from '../../src/modules/resumes/adapters/outbound/persistence/prisma-resume.repository';

function contextFor(userId: string, params: Record<string, string>): ExecutionContext {
  const request = { userId, params };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

const resumes = createResumesApi(
  new PrismaResumeRepository(prisma),
  {
    ensureProfile: (userId: string) => prisma.profile.findUniqueOrThrow({ where: { userId } }),
  },
  { next: randomUUID },
);
const guard = new ResumeOwnerGuard(resumes);
let owner: Awaited<ReturnType<typeof createUser>>;
let stranger: Awaited<ReturnType<typeof createUser>>;
let resumeId: string;

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Owner');
  stranger = await createUser('Stranger');
  const resume = await resumes.create(owner.user.id, 'Backend');
  resumeId = resume.id;
  await resumes.save(owner.user.id, resumeId, {
    summaries: [{ variant: 'default', text: 'First summary.' }],
  });
  await resumes.save(owner.user.id, resumeId, {
    summaries: [{ variant: 'default', text: 'Second summary.' }],
  });
});

after(() => prisma.$disconnect());

test('the owner passes the guard', async () => {
  assert.equal(await guard.canActivate(contextFor(owner.user.id, { id: resumeId })), true);
});

test("someone else's resume is a 404, not a 403", async () => {
  await assert.rejects(guard.canActivate(contextFor(stranger.user.id, { id: resumeId })), isNotFound);
});

test('an unknown id is a 404', async () => {
  await assert.rejects(guard.canActivate(contextFor(owner.user.id, { id: 'no-such-id' })), isNotFound);
});

test('routes without an id are left to the controller', async () => {
  assert.equal(await guard.canActivate(contextFor(stranger.user.id, {})), true);
});

test('entry history never crosses into another resume', async () => {
  const [summary] = await prisma.summaryVariant.findMany({ where: { resumeId, supersededInSnapshot: null } });
  const lineageId = summary.lineageId;

  assert.equal((await resumes.history(owner.user.id, resumeId, 'summaryVariant', lineageId)).length, 2);

  const other = await resumes.create(stranger.user.id, 'Other');
  assert.deepEqual(await resumes.history(stranger.user.id, other.id, 'summaryVariant', lineageId), []);
});

function isNotFound(error: unknown): boolean {
  assert.ok(error instanceof ResumeError);
  let status: number | undefined;
  let body: unknown;
  const response = {
    status: (value: number) => {
      status = value;
      return response;
    },
    json: (value: unknown) => {
      body = value;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new ResumeErrorFilter().catch(error, host);
  assert.equal(status, 404);
  assert.deepEqual(body, { statusCode: 404, message: 'No such resume.', error: 'Not Found' });
  return true;
}
