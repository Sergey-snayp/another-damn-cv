/* eslint-disable @typescript-eslint/require-await -- In-memory port fakes intentionally resolve synchronously. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  GeneratePractice,
  GetPractice,
} from '../src/modules/interviews/application/use-cases/manage-practice';
import type {
  PracticeContext,
  PracticeContent,
  PracticeRecord,
} from '../src/modules/interviews/domain/practice';
import { PracticeError } from '../src/modules/interviews/domain/practice';
import { ClaudeCliPracticeGenerator } from '../src/modules/interviews/adapters/outbound/ai/claude-cli-practice.generator';
import {
  PRACTICE_SYSTEM,
  practicePrompt,
} from '../src/modules/interviews/adapters/outbound/ai/practice-prompts';
import { PublicPracticeContextReader } from '../src/modules/interviews/adapters/outbound/modules/practice-context.reader';
import { Sha256PracticeFingerprint } from '../src/modules/interviews/adapters/outbound/ai/sha256-practice.fingerprint';
import { JobNotFoundError } from '../src/modules/jobs/contracts';
import { ResumeError } from '../src/modules/resumes/contracts';
import { PreparationNotFoundError, emptyPreparation } from '../src/modules/interviews/domain/preparation';
import { contact, role, bullet, skill } from './fixtures/resume';

const context: PracticeContext = {
  job: {
    title: 'Lead Engineer',
    company: 'Example',
    description: 'Lead payment API delivery with Node.js and SQL.',
    salary: 'CAD 120000–140000',
  },
  cv: { id: 'cv-one', snapshot: 3 },
  interviewType: 'recruiter_screen',
  evidence: [
    {
      id: 'cv-bullet-0-0',
      source: 'cv',
      label: 'Company A · Engineer',
      text: 'Built idempotent payment retries.',
    },
  ],
};
function content(technical = false): PracticeContent {
  return {
    questions: Array.from({ length: 6 }, (_, i) => ({
      question: `Question ${i + 1}`,
      why: 'Payment reliability is required.',
      answerKind: technical && i > 1 ? 'conceptual' : 'personal',
      answer:
        technical && i > 1
          ? 'Use an idempotency key and persist the result atomically.'
          : 'I built payment retries. [add the result]',
      talkingPoints: ['Explain the trade-off.'],
      followUps: ['How did you test it?'],
      evidenceIds: technical && i > 1 ? [] : ['cv-bullet-0-0'],
      needsInput: technical && i > 1 ? [] : ['What was the measured result?'],
    })),
  };
}
function fixture() {
  let current = structuredClone(context),
    calls = 0;
  const rows: PracticeRecord[] = [];
  const reader = { read: async () => structuredClone(current) };
  const generator = {
    identity: { provider: 'fake', model: 'test' },
    generate: async () => {
      calls++;
      return content();
    },
  };
  const repository = {
    list: async () => structuredClone(rows),
    save: async (_user: string, row: PracticeRecord) => {
      const i = rows.findIndex((item) => item.kind === row.kind);
      if (i < 0) rows.push(row);
      else rows[i] = row;
      return structuredClone(row);
    },
  };
  const generation = new GeneratePractice(reader, repository, generator, new Sha256PracticeFingerprint());
  return {
    generation,
    read: new GetPractice(reader, repository, generation),
    generator,
    rows,
    calls: () => calls,
    setContext: (value: PracticeContext) => {
      current = value;
    },
  };
}

test('reads never generate; repeated requests reuse saved output and HR/technical stay separate', async () => {
  const f = fixture();
  assert.deepEqual((await f.read.execute('owner', 'job')).results, []);
  assert.equal(f.calls(), 0);
  const first = await f.generation.execute('owner', 'job', 'hr');
  assert.deepEqual(await f.generation.execute('owner', 'job', 'hr'), first);
  assert.equal(f.calls(), 1);
  await f.generation.execute('owner', 'job', 'technical');
  assert.equal(f.rows.length, 2);
  await f.generation.execute('owner', 'job', 'hr', true);
  assert.equal(f.calls(), 3);
});

test('source changes mark saved results stale; failed regeneration preserves both results', async () => {
  const f = fixture();
  await f.generation.execute('owner', 'job', 'hr');
  await f.generation.execute('owner', 'job', 'technical');
  const before = structuredClone(f.rows);
  f.setContext({
    ...context,
    evidence: [
      ...context.evidence,
      { id: 'note', source: 'preparation', label: 'Notes', text: 'I owned the retry policy.' },
    ],
  });
  assert.ok((await f.read.execute('owner', 'job')).results.every((row) => row.stale));
  f.generator.generate = async () => {
    throw new PracticeError('unavailable', 'Synthetic outage');
  };
  await assert.rejects(f.generation.execute('owner', 'job', 'hr', true), /Synthetic outage/);
  assert.deepEqual(f.rows, before);
  assert.deepEqual(f.generation.running('owner', 'job'), []);
});

test('missing CV, missing description and oversized context stop before spending a model call', async () => {
  for (const input of [
    { ...context, cv: null },
    { ...context, job: { ...context.job, description: ' ' } },
    { ...context, evidence: [{ ...context.evidence[0], text: 'x'.repeat(60001) }] },
  ]) {
    const f = fixture();
    f.setContext(input);
    await assert.rejects(
      f.generation.execute('owner', 'job', 'hr'),
      (error: unknown) => error instanceof PracticeError && error.code === 'invalid',
    );
    assert.equal(f.calls(), 0);
  }
});

test('unknown source references and unsupported personal answers never replace saved answers', async () => {
  const f = fixture();
  await f.generation.execute('owner', 'job', 'hr');
  const before = structuredClone(f.rows);
  for (const fields of [{ evidenceIds: ['invented-source'] }, { evidenceIds: [], needsInput: [] }]) {
    f.generator.generate = async () => ({
      questions: content().questions.map((row) => ({ ...row, ...fields })),
    });
    await assert.rejects(
      f.generation.execute('owner', 'job', 'hr', true),
      (error: unknown) => error instanceof PracticeError && error.code === 'invalid-output',
    );
    assert.deepEqual(f.rows, before);
  }
});

test('parallel identical clicks share a call; changes during generation are reported stale', async () => {
  const f = fixture();
  let finish!: (value: PracticeContent) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  f.generator.generate = () => {
    calls++;
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = f.generation.execute('owner', 'job', 'hr');
  await started;
  const second = f.generation.execute('owner', 'job', 'hr', true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(f.generation.running('owner', 'job'), ['hr']);
  assert.deepEqual(f.generation.running('another', 'job'), []);
  f.setContext({ ...context, job: { ...context.job, description: 'Changed description.' } });
  await assert.rejects(f.generation.execute('owner', 'job', 'hr'), /already generating/);
  finish(content());
  assert.equal((await first).stale, true);
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test('CLI adapter applies restricted mode, distinct prompts, and validates the full response without repair calls', async () => {
  let calls = 0;
  const generator = new ClaudeCliPracticeGenerator({
    complete: async (prompt, system, options) => {
      calls++;
      assert.equal(options?.maxOutputChars, 64000);
      assert.equal(system, PRACTICE_SYSTEM);
      assert.ok(prompt.includes(JSON.stringify(context)));
      return `\x60\x60\x60json\n${JSON.stringify(content(prompt.includes('ranked by relevance')))}\n\x60\x60\x60`;
    },
  });
  assert.equal((await generator.generate('hr', context)).questions.length, 6);
  assert.ok(
    (await generator.generate('technical', context)).questions.some((row) => row.answerKind === 'conceptual'),
  );
  assert.equal(calls, 2);
  assert.match(practicePrompt('hr', context), /STAR/);
  assert.match(practicePrompt('technical', context), /failure modes/);
  assert.match(PRACTICE_SYSTEM, /untrusted source data/);
  const broken = new ClaudeCliPracticeGenerator({ complete: async () => '{"questions":[]}' });
  await assert.rejects(broken.generate('hr', context), /incomplete question set/);
});

test('provider errors give safe instructions without exposing raw private process output', async () => {
  for (const [message, expected] of [
    ['The Claude CLI is not signed in.', /claude auth login/],
    ['timeout', /too long/],
    ['raw secret /private/candidate', /could not complete/],
  ] as const) {
    const generator = new ClaudeCliPracticeGenerator({
      complete: async () => {
        throw new ServiceUnavailableException(message);
      },
    });
    await assert.rejects(
      generator.generate('hr', context),
      (error: unknown) =>
        error instanceof PracticeError &&
        expected.test(error.message) &&
        !error.message.includes('/private/candidate'),
    );
  }
});

test('context reads the exact owned CV snapshot and excludes contact details from model input', async () => {
  const reader = new PublicPracticeContextReader(
    {
      getForPreparation: async (user, id) => {
        assert.equal(user, 'owner');
        assert.equal(id, 'job');
        return {
          id,
          title: 'Lead',
          pageTitle: null,
          company: 'Example',
          description: 'Node.js',
          extraction: 'manual',
          salary: null,
          applicationResumeId: 'cv',
          applicationSnapshot: 3,
        };
      },
    },
    {
      atSnapshot: async (user, id, version) => {
        assert.deepEqual([user, id, version], ['owner', 'cv', 3]);
        return {
          snapshot: 3,
          contact: contact({ email: 'private@example.com', phone: '1234567' }),
          summaries: { default: 'Engineer.' },
          experiences: [
            role('r', { company: 'Employer A', title: 'Developer' }, [bullet('b', 'Built payment retries.')]),
          ],
          educations: [],
          skills: [skill('s', 'Node.js')],
        };
      },
    },
    {
      read: async () => ({ ...emptyPreparation('job'), notes: 'A saved example.' }),
      save: async () => {
        throw new Error('Not used');
      },
    },
  );
  const data = await reader.read('owner', 'job');
  assert.deepEqual(data.cv, { id: 'cv', snapshot: 3 });
  assert.match(JSON.stringify(data), /Employer A/);
  assert.match(JSON.stringify(data), /A saved example/);
  assert.ok(!JSON.stringify(data).includes('private@example.com'));
  assert.ok(!JSON.stringify(data).includes('1234567'));
});

test('foreign jobs fail before CV reads; deleted CV gives a recoverable blocker', async () => {
  const preparations = { read: async () => null, save: async () => emptyPreparation('job') };
  const resumes = {
    atSnapshot: async () => {
      throw new Error('Must not be called');
    },
  };
  await assert.rejects(
    new PublicPracticeContextReader(
      {
        getForPreparation: async () => {
          throw new JobNotFoundError();
        },
      },
      resumes,
      preparations,
    ).read('foreign', 'job'),
    PreparationNotFoundError,
  );
  const reader = new PublicPracticeContextReader(
    {
      getForPreparation: async () => ({
        id: 'job',
        title: null,
        pageTitle: null,
        company: null,
        description: 'Description',
        extraction: 'manual',
        salary: null,
        applicationResumeId: 'deleted',
        applicationSnapshot: 1,
      }),
    },
    {
      atSnapshot: async () => {
        throw new ResumeError('not-found', 'Gone');
      },
    },
    preparations,
  );
  assert.equal((await reader.read('owner', 'job')).cv, null);
});
