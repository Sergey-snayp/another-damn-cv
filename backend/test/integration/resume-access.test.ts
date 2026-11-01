import { prisma, migrateTestDatabase, createUser } from './setup';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { ResumeOwnerGuard } from '../../src/resume/resume-owner.guard';
import { ResumeService } from '../../src/resume/resume.service';

function contextFor(userId: string, params: Record<string, string>): ExecutionContext {
  const request = { userId, params };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

const guard = new ResumeOwnerGuard(prisma);
const resumes = new ResumeService(prisma);
let owner: Awaited<ReturnType<typeof createUser>>;
let stranger: Awaited<ReturnType<typeof createUser>>;
let resumeId: string;

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Owner');
  stranger = await createUser('Stranger');
  const resume = await resumes.create(owner.profile.id, 'Backend');
  resumeId = resume.id;
  await resumes.save(resumeId, { summaries: [{ variant: 'default', text: 'First summary.' }] });
  await resumes.save(resumeId, { summaries: [{ variant: 'default', text: 'Second summary.' }] });
});

after(() => prisma.$disconnect());

test('the owner passes the guard', async () => {
  assert.equal(await guard.canActivate(contextFor(owner.user.id, { id: resumeId })), true);
});

test("someone else's resume is a 404, not a 403", async () => {
  await assert.rejects(guard.canActivate(contextFor(stranger.user.id, { id: resumeId })), NotFoundException);
});

test('an unknown id is a 404', async () => {
  await assert.rejects(guard.canActivate(contextFor(owner.user.id, { id: 'no-such-id' })), NotFoundException);
});

test('routes without an id are left to the controller', async () => {
  assert.equal(await guard.canActivate(contextFor(stranger.user.id, {})), true);
});

test('entry history never crosses into another resume', async () => {
  const [summary] = await prisma.summaryVariant.findMany({ where: { resumeId, supersededInSnapshot: null } });
  const lineageId = summary!.lineageId;

  assert.equal((await resumes.history(resumeId, 'summaryVariant', lineageId)).length, 2);

  const other = await resumes.create(stranger.profile.id, 'Other');
  assert.deepEqual(await resumes.history(other.id, 'summaryVariant', lineageId), []);
});
