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
import { toChanges } from '../../src/modules/resumes/domain/document';
import type { QuickTailoringDraft, RenderedResume } from '../../src/modules/resumes/contracts';
import { SaveQuickTailoring } from '../../src/modules/resumes/application/use-cases/quick-tailoring';
import { SaveResume } from '../../src/modules/resumes/application/use-cases/save-resume';
import { PrismaResumeRepository } from '../../src/modules/resumes/adapters/outbound/persistence/prisma-resume.repository';

let app: INestApplication, base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let sourceId: string, jobId: string;
let printed = 0;
const theme = {
  template: 'professional',
  accent: '#000000',
  fontFamily: 'Roboto, Arial, sans-serif',
  fontSize: 10,
  lineHeight: 1.3,
  sectionGap: 12,
};

function call(path: string, user = owner.user.id, method = 'GET', body?: unknown) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: { 'x-test-user': user, ...(body !== undefined && { 'content-type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function counts() {
  const where = { profile: { userId: owner.user.id } };
  return {
    resumes: await prisma.resume.count({ where }),
    snapshots: await prisma.snapshot.count({ where: { resume: where } }),
    pdfs: await prisma.resumePdf.count({ where: { resume: where } }),
  };
}

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Draft Owner');
  other = await createUser('Draft Other');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue() {} })
    .overrideProvider(PDF_RENDERER)
    .useValue({
      render: () => {
        printed++;
        return Promise.resolve(Buffer.from('%PDF-1.4 test'));
      },
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _response: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: req.headers['x-test-user'] } });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const source = (await (await call('/resumes', owner.user.id, 'POST', { name: 'Master CV' })).json()) as {
    id: string;
  };
  sourceId = source.id;
  const role = randomUUID();
  await call(`/resumes/${sourceId}/save`, owner.user.id, 'POST', {
    contact: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
    experiences: [
      { lineageId: role, company: 'Original employer', title: 'Engineer', from: '2020', current: true },
    ],
    achievements: [
      {
        lineageId: randomUUID(),
        experienceLineageId: role,
        bullet: 'Built Node.js APIs.',
        authoredBy: 'human',
        evidence: 'repo/commit',
      },
    ],
    summaries: [{ variant: 'default', text: 'Original summary.' }],
  });
  const job = (await (
    await call('/jobs', owner.user.id, 'POST', {
      title: 'Payments Engineer',
      company: 'Acme',
      description: 'Build Node.js payment services.',
    })
  ).json()) as { id: string };
  jobId = job.id;
});

after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

test('opening Quick Tailor creates no document, snapshot or PDF; only Save persists the edited copy', async () => {
  const before = await counts();
  const original = (await (await call(`/resumes/${sourceId}`)).json()) as RenderedResume;
  const url = `/jobs/${jobId}/quick-tailor?sourceResumeId=${sourceId}`;
  const response = await call(url);
  assert.equal(response.status, 200);
  const preview = (await response.json()) as QuickTailoringDraft;
  assert.equal(preview.resumeId, null);
  assert.equal(preview.name, 'Sam_Lee_CV_Acme_Payments_Engineer');
  assert.deepEqual(preview.document, original);
  await call(url); // Reopening an abandoned draft also writes nothing.
  assert.deepEqual(await counts(), before);
  assert.equal(printed, 0);
  assert.equal((await call(url, other.user.id)).status, 404);

  const changes = toChanges(preview.document);
  changes.summaries = [{ variant: 'default', text: 'Edited for Acme.' }];
  const input = { resumeId: null, sourceResumeId: sourceId, changes, theme };
  assert.equal(
    (
      await call(`/jobs/${jobId}/quick-tailor`, owner.user.id, 'POST', {
        ...input,
        changes: { contact: { firstName: 123 } },
      })
    ).status,
    400,
  );
  assert.deepEqual(await counts(), before, 'a failed save leaves no empty CV behind');
  const savedResponse = await call(`/jobs/${jobId}/quick-tailor`, owner.user.id, 'POST', input);
  assert.equal(savedResponse.status, 200);
  const saved = (await savedResponse.json()) as QuickTailoringDraft;
  assert.ok(saved.resumeId);
  assert.equal(saved.document.snapshot, 1, 'the first version contains the actual edited draft');
  assert.equal(saved.document.summaries.default, 'Edited for Acme.');
  assert.deepEqual(await counts(), {
    resumes: before.resumes + 1,
    snapshots: before.snapshots + 1,
    pdfs: before.pdfs,
  });
  assert.equal(printed, 0, 'saving the CV still precedes the separate PDF action');
  assert.deepEqual(await (await call(`/resumes/${sourceId}`)).json(), original);
  const role = saved.document.experiences[0];
  assert.notEqual(role.lineageId, original.experiences[0].lineageId);
  assert.equal(role.achievements[0].experienceLineageId, role.lineageId);
  assert.equal(role.achievements[0].authoredBy, 'human');
  assert.equal((await call(`/resumes/${saved.resumeId}/pdf`)).status, 409);
  const pdf = await call(`/resumes/${saved.resumeId}/pdf`, owner.user.id, 'POST');
  assert.equal(pdf.status, 200);
  assert.equal(
    ((await pdf.json()) as { fileName: string }).fileName,
    'Sam_Lee_CV_Acme_Payments_Engineer.pdf',
  );
  assert.equal(printed, 1);

  const afterSave = await counts();
  const reopened = (await (await call(url)).json()) as QuickTailoringDraft;
  assert.equal(reopened.resumeId, saved.resumeId);
  assert.deepEqual(await counts(), afterSave, 'reopening an existing copy adds no records');
  const again = await call(`/jobs/${jobId}/quick-tailor`, owner.user.id, 'POST', {
    ...input,
    resumeId: saved.resumeId,
    changes: toChanges(saved.document),
  });
  assert.equal(again.status, 200);
  assert.deepEqual(await counts(), afterSave, 'saving again reuses the CV and unchanged version');
});

test('a failure while saving rolls back the new CV record as well as its content', async () => {
  const before = await counts();
  const repository = new PrismaResumeRepository(prisma);
  const save = new SaveResume(repository, { next: randomUUID });
  save.saveInTransaction = () => Promise.reject(new Error('synthetic content write failure'));
  const quick = new SaveQuickTailoring(
    repository,
    { ensureProfile: () => Promise.resolve({ id: owner.profile.id }) },
    { next: randomUUID },
    save,
  );
  const job = { id: randomUUID(), title: 'Role', company: 'Other employer', pageTitle: null };
  // A real owned job is needed for the new CV's foreign key.
  await prisma.job.create({
    data: {
      id: job.id,
      userId: owner.user.id,
      source: 'MANUAL',
      extraction: 'MANUAL',
      title: job.title,
      company: job.company,
      editedFields: [],
    },
  });
  await assert.rejects(
    quick.execute(owner.user.id, job, {
      resumeId: null,
      sourceResumeId: sourceId,
      theme,
      changes: { contact: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' } },
    }),
    /synthetic content write failure/,
  );
  assert.deepEqual(await counts(), before);
});

test('Quick Tailor previews compact names without writing, upgrades automatic names on Save, and keeps custom names', async () => {
  const title = 'Software Engineer III, Content Creation (Remote) | Careers';
  const company = 'ACME / R&D';
  const created = await call('/jobs', owner.user.id, 'POST', {
    title,
    company,
    description: 'Build content creation services with Node.js and TypeScript.',
  });
  assert.equal(created.status, 201);
  const job = (await created.json()) as { id: string };
  const path = `/jobs/${job.id}/quick-tailor`;
  const url = `${path}?sourceResumeId=${sourceId}`;
  const before = await counts();
  const response = await call(url);
  assert.equal(response.status, 200);
  const preview = (await response.json()) as QuickTailoringDraft;
  assert.equal(preview.name, 'Sam_Lee_CV_ACME_R_D_Software_Engineer_III');
  assert.deepEqual(await counts(), before, 'generating the compact name is still read-only');

  const input = { resumeId: null, sourceResumeId: sourceId, changes: toChanges(preview.document), theme };
  const savedResponse = await call(path, owner.user.id, 'POST', input);
  assert.equal(savedResponse.status, 200);
  const saved = (await savedResponse.json()) as QuickTailoringDraft;
  assert.ok(saved.resumeId);
  assert.equal(saved.name, preview.name);
  const previousName = ['Sam Lee', 'CV', company, title].map((part) => part.replace(/\s+/g, '_')).join('_');
  await prisma.resume.update({ where: { id: saved.resumeId }, data: { name: previousName } });
  const reopened = (await (await call(url)).json()) as QuickTailoringDraft;
  assert.equal(reopened.name, preview.name);
  assert.equal(
    (await prisma.resume.findUniqueOrThrow({ where: { id: saved.resumeId } })).name,
    previousName,
    'previewing the new name does not rename an existing document',
  );

  const changes = toChanges(reopened.document);
  changes.contact!.firstName = 'Alex';
  const upgraded = (await (
    await call(path, owner.user.id, 'POST', { ...input, resumeId: saved.resumeId, changes })
  ).json()) as QuickTailoringDraft;
  assert.equal(upgraded.name, 'Alex_Lee_CV_ACME_R_D_Software_Engineer_III');
  assert.equal(
    (await prisma.resume.findUniqueOrThrow({ where: { id: saved.resumeId } })).name,
    upgraded.name,
  );

  const custom = 'My reviewed application CV';
  await prisma.resume.update({ where: { id: saved.resumeId }, data: { name: custom } });
  assert.equal(((await (await call(url)).json()) as QuickTailoringDraft).name, custom);
  const preserved = (await (
    await call(path, owner.user.id, 'POST', {
      ...input,
      resumeId: saved.resumeId,
      changes: toChanges(upgraded.document),
    })
  ).json()) as QuickTailoringDraft;
  assert.equal(preserved.name, custom);
  assert.equal(
    (await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).title,
    title,
    'the full job title remains available for tailoring',
  );
});

test('Quick Tailor includes the profile full name when the source CV has no contact', async () => {
  const person = await createUser('Sergey Proniuk');
  await prisma.profile.update({
    where: { id: person.profile.id },
    data: { firstName: 'Sergey', lastName: 'Proniuk' },
  });
  const source = (await (await call('/resumes', person.user.id, 'POST', { name: 'Empty CV' })).json()) as {
    id: string;
  };
  const job = (await (
    await call('/jobs', person.user.id, 'POST', {
      title: 'Software Engineer III, Content Creation',
      company: 'Box',
      description: 'Build content creation services.',
    })
  ).json()) as { id: string };
  const path = `/jobs/${job.id}/quick-tailor`;
  const previewResponse = await call(`${path}?sourceResumeId=${source.id}`, person.user.id);
  assert.equal(previewResponse.status, 200);
  const preview = (await previewResponse.json()) as QuickTailoringDraft;
  assert.equal(preview.name, 'Sergey_Proniuk_CV_Box_Software_Engineer_III');
  const savedResponse = await call(path, person.user.id, 'POST', {
    resumeId: null,
    sourceResumeId: source.id,
    changes: toChanges(preview.document),
    theme,
  });
  assert.equal(savedResponse.status, 200);
  const saved = (await savedResponse.json()) as QuickTailoringDraft;
  assert.equal(saved.name, preview.name);
});
