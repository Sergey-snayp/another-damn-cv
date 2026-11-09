import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AssessJobFit } from '../src/modules/resumes/application/use-cases/assess-job-fit';
import { ClaudeJobAssessor } from '../src/modules/resumes/adapters/outbound/ai/claude-job.assessor';
import {
  assessmentEvidence,
  mentions,
  scoreForVerdict,
  technologiesFor,
  type JobAssessmentDraft,
  type JobAssessmentInput,
} from '../src/modules/resumes/domain/job-assessment';
import { PublicAssessmentProfileReader } from '../src/modules/resumes/adapters/outbound/modules/assessment-profile.reader';

const JOB = {
  id: 'job-1',
  title: 'Backend Engineer',
  company: 'Acme',
  pageTitle: null,
  extraction: 'structured',
  description:
    'Required: Build Node.js services and operate PostgreSQL in production. Preferred: Kubernetes experience.',
};
const answer = (): JobAssessmentDraft => ({
  verdict: 'apply',
  score: 8,
  summary:
    'I would apply. Your production backend work matches the central responsibilities; clarify the infrastructure expectations.',
  strengths: [
    {
      point: 'Your backend work is relevant to the core role.',
      jobQuote: 'Build Node.js services',
      profileQuote: 'Built Node.js services on PostgreSQL.',
    },
  ],
  gaps: [
    {
      point: 'Kubernetes is not shown in your Profile; it is preferred, not a reason to rule the role out.',
      jobQuote: 'Preferred: Kubernetes experience.',
      importance: 'preferred',
    },
  ],
  questions: ['How much hands-on Kubernetes ownership does the role require?'],
  technologies: ['Node.js', 'PostgreSQL', 'Kubernetes'],
});
const profile = () => ({
  revision: 1,
  career: {
    summary: 'Backend engineer.',
    experiences: [
      {
        company: 'Payments Co',
        title: 'Engineer',
        from: '2020',
        to: '',
        current: true,
        client: 'Retail Client',
        location: 'Remote',
        description: 'Full profile-only role description.',
        bullets: ['Built Node.js services on PostgreSQL.', 'Mentored the payments team.'],
      },
    ],
    skills: ['Node.js'],
    educations: [{ institution: 'Training Co', degree: '', field: 'Backend systems' }],
  },
});

test('assessment uses full Profile descriptions, bullets, education and skills without changing it', async () => {
  const history = profile(),
    original = structuredClone(history);
  let input: JobAssessmentInput | undefined;
  const service = new AssessJobFit(
    { read: () => Promise.resolve(history) },
    { getForTailoring: () => Promise.resolve(JOB) },
    {
      assess: (value) => {
        input = value;
        return Promise.resolve(answer());
      },
    },
  );
  const result = await service.execute('owner', JOB.id);
  assert.equal(result.verdict, 'apply');
  assert.equal(result.score, 8);
  assert.deepEqual(result.technologies, [
    { name: 'Node.js', inProfile: true },
    { name: 'PostgreSQL', inProfile: true },
    { name: 'Kubernetes', inProfile: false },
  ]);
  assert.deepEqual(result.basis, { source: 'profile', profileRevision: 1, jobId: JOB.id });
  for (const detail of [
    'Payments Co',
    'Retail Client',
    'Full profile-only role description.',
    'Mentored the payments team.',
    'Training Co',
    'Backend systems',
    'Node.js',
  ])
    assert.ok(input!.evidence.includes(detail));
  assert.deepEqual(history, original);
});

test('concurrent opens share work, while Profile edits, job edits, users and expiry invalidate the cache', async () => {
  const history = profile(),
    job = { ...JOB };
  let calls = 0,
    clock = Date.UTC(2026, 10, 6);
  const service = new AssessJobFit(
    { read: () => Promise.resolve(history) },
    { getForTailoring: () => Promise.resolve(job) },
    {
      assess: () => {
        calls++;
        return Promise.resolve(answer());
      },
    },
    () => clock,
  );
  const [first, second] = await Promise.all([
    service.execute('owner', job.id),
    service.execute('owner', job.id),
  ]);
  assert.equal(calls, 1);
  first.summary = 'A caller cannot change the cached assessment.';
  assert.notEqual(first.summary, second.summary);
  await service.execute('owner', job.id);
  assert.equal(calls, 1);
  history.revision++;
  await service.execute('owner', job.id);
  assert.equal(calls, 2);
  job.description += ' Work with the payments team.';
  await service.execute('owner', job.id);
  assert.equal(calls, 3);
  await service.execute('other', job.id);
  assert.equal(calls, 4);
  clock += 5 * 60_000 + 1;
  await service.execute('owner', job.id);
  assert.equal(calls, 5);
});

test('job ownership and current Profile reads precede even cached assessments', async () => {
  let profileAllowed = true,
    jobAllowed = true,
    calls = 0;
  const service = new AssessJobFit(
    {
      read: () => {
        if (!profileAllowed) throw new Error('Profile unavailable');
        return Promise.resolve(profile());
      },
    },
    {
      getForTailoring: () => {
        if (!jobAllowed) throw new Error('Job not owned');
        return Promise.resolve(JOB);
      },
    },
    {
      assess: () => {
        calls++;
        return Promise.resolve(answer());
      },
    },
  );
  await service.execute('owner', JOB.id);
  profileAllowed = false;
  await assert.rejects(service.execute('owner', JOB.id), /Profile unavailable/);
  profileAllowed = true;
  jobAllowed = false;
  await assert.rejects(service.execute('owner', JOB.id), /Job not owned/);
  assert.equal(calls, 1);
});

test('failed or unsupported assessments are not cached and can be retried', async () => {
  let valid = false,
    calls = 0;
  const service = new AssessJobFit(
    { read: () => Promise.resolve(profile()) },
    { getForTailoring: () => Promise.resolve(JOB) },
    {
      assess: () => {
        calls++;
        const result = answer();
        if (!valid) result.strengths[0].profileQuote = 'Led a team of 100 engineers.';
        return Promise.resolve(result);
      },
    },
  );
  await assert.rejects(service.execute('owner', JOB.id), /could not be checked/);
  valid = true;
  assert.equal((await service.execute('owner', JOB.id)).verdict, 'apply');
  assert.equal(calls, 2);
});

test('missing Profile evidence and missing descriptions do not generate invented advice', async () => {
  let calls = 0;
  const blank = { revision: 0, career: { summary: '', experiences: [], educations: [], skills: [] } };
  const assessor = {
    assess: () => {
      calls++;
      return Promise.resolve(answer());
    },
  };
  const service = new AssessJobFit(
    { read: () => Promise.resolve(blank) },
    { getForTailoring: () => Promise.resolve(JOB) },
    assessor,
  );
  assert.equal((await service.execute('owner', JOB.id)).verdict, 'unclear');
  const missing = new AssessJobFit(
    { read: () => Promise.resolve(profile()) },
    { getForTailoring: () => Promise.resolve({ ...JOB, description: null }) },
    assessor,
  );
  await assert.rejects(missing.execute('owner', JOB.id), /Add a job description/);
  assert.equal(calls, 0);
});

test('model output is checked and retried once without accepting invented Profile or job quotes', async () => {
  const input = { evidence: assessmentEvidence(profile().career), job: JOB, asOf: '2026-11-06' };
  const calls: Array<{ prompt: string; system: string }> = [];
  const model = new ClaudeJobAssessor({
    complete: (prompt, system) => {
      calls.push({ prompt, system });
      return Promise.resolve(calls.length === 1 ? '{"verdict":"apply"}' : JSON.stringify(answer()));
    },
  });
  assert.equal((await model.assess(input)).verdict, 'apply');
  assert.equal(calls.length, 2);
  assert.match(calls[0].system, /not just keyword overlap/);
  assert.match(calls[0].system, /not shown in your Profile/);
  assert.match(calls[0].system, /protected traits/);
  let attempts = 0;
  const unsupported = new ClaudeJobAssessor({
    complete: () => {
      attempts++;
      const raw = answer();
      raw.gaps[0].jobQuote = 'A mandatory PhD is required.';
      return Promise.resolve(JSON.stringify(raw));
    },
  });
  await assert.rejects(unsupported.assess(input), /supported job assessment/);
  assert.equal(attempts, 2);
});

test('assessment prose has no sentence dashes while exact supporting quotes remain untouched', async () => {
  const raw = answer();
  raw.summary = 'Apply — your experience matches - clarify the scope.';
  raw.strengths[0] = {
    point: 'Relevant work — clearly supported.',
    jobQuote: 'Build Node.js services — in production.',
    profileQuote: 'Built Node.js services — on PostgreSQL.',
  };
  raw.gaps[0].point = 'Kubernetes - not shown.';
  raw.questions = ['Team scope — how broad?'];
  const input = {
    job: { ...JOB, description: `${raw.strengths[0].jobQuote} Preferred: Kubernetes experience.` },
    evidence: raw.strengths[0].profileQuote,
    asOf: '2026-11-09',
  };
  const result = await new ClaudeJobAssessor({ complete: () => Promise.resolve(JSON.stringify(raw)) }).assess(
    input,
  );
  assert.equal(result.summary, 'Apply, your experience matches, clarify the scope.');
  assert.equal(result.strengths[0].point, 'Relevant work, clearly supported.');
  assert.equal(result.gaps[0].point, 'Kubernetes, not shown.');
  assert.equal(result.questions[0], 'Team scope, how broad?');
  assert.equal(result.strengths[0].jobQuote, raw.strengths[0].jobQuote);
  assert.equal(result.strengths[0].profileQuote, raw.strengths[0].profileQuote);
});

test('the Profile adapter reads only saved sections, including intentionally empty sections', async () => {
  const calls: string[] = [];
  const reader = new PublicAssessmentProfileReader({
    read: (userId) => {
      calls.push(userId);
      return Promise.resolve({
        revision: 4,
        data: { experiences: { value: [], source: { kind: 'profile' }, importedAt: '2026-11-06' } },
      });
    },
  });
  assert.deepEqual(await reader.read('owner'), {
    revision: 4,
    career: { summary: '', experiences: [], educations: [], skills: [] },
  });
  assert.deepEqual(calls, ['owner']);
});

test('the score always agrees with the verdict, and an unclear verdict has none', () => {
  assert.equal(scoreForVerdict('apply', 9), 9);
  assert.equal(scoreForVerdict('apply', 4), 7);
  assert.equal(scoreForVerdict('stretch', 8.6), 6);
  assert.equal(scoreForVerdict('stretch', 4.4), 4);
  assert.equal(scoreForVerdict('skip', 5), 3);
  assert.equal(scoreForVerdict('skip', null), 2);
  assert.equal(scoreForVerdict('apply', null), 9);
  assert.equal(scoreForVerdict('unclear', 6), null);
});

test('technologies are whole terms from the posting, marked by whether the Profile shows them', () => {
  assert.ok(mentions('Built Node.js services', 'node.js'));
  assert.ok(!mentions('Wrote JavaScript daily', 'Java'));
  assert.ok(mentions('Uses C++ and C#.', 'C#'));
  const input = {
    job: { title: 'Engineer', company: null, description: 'Java, Kafka and AWS Lambda; C# is a plus.' },
    evidence: 'Built JavaScript services on AWS Lambda.\nStreamed events through kafka.',
    asOf: '2026-11-06',
  };
  assert.deepEqual(technologiesFor(['Java', 'Kafka', 'aws lambda', 'Kafka', 'Rust', '', 'C#'], input), [
    { name: 'Java', inProfile: false },
    { name: 'Kafka', inProfile: true },
    { name: 'aws lambda', inProfile: true },
    { name: 'C#', inProfile: false },
  ]);
});

test('a missing or out-of-range score from the AI does not fail the assessment', async () => {
  const input = { evidence: assessmentEvidence(profile().career), job: JOB, asOf: '2026-11-06' };
  const model = new ClaudeJobAssessor({
    complete: () => Promise.resolve(JSON.stringify({ ...answer(), score: 42, technologies: 'none' })),
  });
  const draft = await model.assess(input);
  assert.equal(draft.score, null);
  assert.deepEqual(draft.technologies, []);
});
