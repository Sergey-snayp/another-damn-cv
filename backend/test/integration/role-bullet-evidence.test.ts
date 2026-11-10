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
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';

let app: INestApplication, base: string;
const prompts: string[] = [];
before(async () => {
  migrateTestDatabase();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    .overrideProvider(ClaudeProcessRunner)
    .useValue({
      complete: (prompt: string) => {
        prompts.push(prompt);
        const id = prompt.match(
          /<achievement id="([^"]+)"[^>]*>Built React Native screens with Expo Router\./,
        )?.[1];
        assert.ok(id, 'the model receives the Profile note as role evidence');
        return Promise.resolve(
          JSON.stringify({
            chosen: [{ id, text: 'Built React Native screens — with Expo Router.' }],
            alternates: [],
          }),
        );
      },
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: req.headers['x-test-user'] ? { userId: req.headers['x-test-user'] } : {} });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

function call(path: string, user?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(user ? { 'x-test-user': user } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const identity = {
  company: 'Ciklum',
  client: 'SymphonyAI',
  title: 'Senior Software Engineer',
  from: '2023-11',
};
async function cv(user: string, bullets: string[], client = 'SymphonyAI') {
  const response = await call('/resumes', user, { name: 'Role evidence CV' });
  assert.equal(response.status, 201);
  const { id } = (await response.json()) as { id: string };
  const lineageId = randomUUID();
  const saved = await call(`/resumes/${id}/save`, user, {
    experiences: [{ ...identity, client, lineageId, current: false }],
    achievements: bullets.map((bullet) => ({
      lineageId: randomUUID(),
      experienceLineageId: lineageId,
      bullet,
    })),
  });
  assert.equal(saved.status, 201);
  return id;
}

test('SymphonyAI bullets use the Profile description, tech stack and other owned CVs, without writes or another client’s facts', async () => {
  const owner = await createUser('Role evidence owner'),
    other = await createUser('Role evidence other');
  const selected = await cv(owner.user.id, ['Developed application features.']);
  await cv(owner.user.id, ['Implemented AsyncStorage persistence for offline sessions.']);
  await cv(owner.user.id, ['Paymorrow-only Kafka payment reconciliation.'], 'Paymorrow');
  const foreign = await cv(other.user.id, ['Private AWS infrastructure at SymphonyAI.']);
  const role = (client: string) => ({
    ...identity,
    client,
    location: '',
    to: '',
    current: false,
    description: `${client} project work.`,
    bullets: [] as string[],
  });
  const profile = await call(
    '/profile/career',
    owner.user.id,
    {
      expectedRevision: 0,
      sections: {
        experiences: [
          { ...role('Paymorrow'), techStack: 'Kafka', bullets: ['Paymorrow-only backend migration.'] },
          {
            ...role('SymphonyAI'),
            techStack: 'React Native | Expo SDK | Expo Router',
            description: 'Built React Native screens with Expo Router.',
          },
        ],
      },
    },
    'PUT',
  );
  assert.equal(profile.status, 200);
  const job = await call('/jobs', owner.user.id, {
    title: 'React Native Engineer',
    description: 'Build mobile applications using React Native and Expo.',
  });
  const { id: jobId } = (await job.json()) as { id: string };
  const readSource = () => prisma.resume.findUniqueOrThrow({ where: { id: selected } });
  const original = await readSource(),
    profileBefore = await prisma.profile.findUniqueOrThrow({ where: { id: owner.profile.id } });
  const count = await prisma.resume.count({ where: { profileId: owner.profile.id } });
  const versions = await prisma.snapshot.count({ where: { resumeId: selected } });
  const pdfs = await prisma.resumePdf.count({ where: { resumeId: selected } });
  const input = { role: { ...identity, bullets: ['Developed application features.'] }, job: { jobId } };
  const response = await call(`/resumes/${selected}/tailor-role`, owner.user.id, input);
  assert.equal(response.status, 200);
  const result = (await response.json()) as {
    matched: boolean;
    chosen: Array<{ text: string; source: string }>;
  };
  assert.equal(result.matched, true);
  assert.equal(result.chosen.length, 1);
  assert.equal(result.chosen[0].source, 'profile');
  assert.match(result.chosen[0].text, /React Native/);
  assert.equal(result.chosen[0].text, 'Built React Native screens, with Expo Router.');
  assert.ok(prompts[0].includes('React Native | Expo SDK | Expo Router'));
  assert.ok(prompts[0].includes('Implemented AsyncStorage persistence for offline sessions.'));
  assert.doesNotMatch(prompts[0], /Paymorrow-only|Private AWS/);
  assert.equal((await call(`/resumes/${selected}/tailor-role`, undefined, input)).status, 401);
  assert.equal((await call(`/resumes/${selected}/tailor-role`, other.user.id, input)).status, 404);
  assert.equal(
    (await call(`/resumes/${foreign}/tailor-role`, other.user.id, input)).status,
    404,
    'the job is owned too',
  );
  assert.equal(prompts.length, 1, 'unauthorized calls never ask the model');
  assert.deepEqual(await readSource(), original);
  assert.deepEqual(
    await prisma.profile.findUniqueOrThrow({ where: { id: owner.profile.id } }),
    profileBefore,
  );
  assert.equal(await prisma.resume.count({ where: { profileId: owner.profile.id } }), count);
  assert.equal(await prisma.snapshot.count({ where: { resumeId: selected } }), versions);
  assert.equal(await prisma.resumePdf.count({ where: { resumeId: selected } }), pdfs);
});
