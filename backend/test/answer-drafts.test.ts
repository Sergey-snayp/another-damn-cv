import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DraftError,
  fitDraft,
  type CvEvidence,
  type DraftContext,
} from '../src/modules/answers/domain/drafts';
import { DraftAnswer } from '../src/modules/answers/application/use-cases/manage-answers';
import { ClaudeCliAnswerDrafter } from '../src/modules/answers/adapters/outbound/ai/claude-cli-answer.drafter';
import { DRAFT_SYSTEM, draftPrompt } from '../src/modules/answers/adapters/outbound/ai/draft-prompt';
import { PublicCvEvidenceReader } from '../src/modules/answers/adapters/outbound/modules/cv-evidence.reader';
import { ResumeError, type RenderedResume } from '../src/modules/resumes/contracts';

const cv: CvEvidence = {
  summary: 'Backend engineer.',
  roles: [
    {
      company: 'Acme',
      title: 'Senior Engineer',
      from: '2021-01',
      to: null,
      bullets: ['Built payment retries'],
    },
  ],
  skills: ['Node.js'],
  education: [],
};

test('drafts are fitted to the field: options, numbers, checkboxes and length limits', () => {
  assert.deepEqual(fitDraft({ answer: 'yes', needsInput: [] }, { kind: 'radio', options: ['Yes', 'No'] }), {
    answer: 'Yes',
    needsInput: [],
  });
  assert.equal(
    fitDraft({ answer: 'Maybe', needsInput: [] }, { kind: 'select', options: ['Yes', 'No'] }).answer,
    '',
  );
  assert.equal(fitDraft({ answer: 'About 6,000 USD', needsInput: [] }, { kind: 'number' }).answer, '6000');
  assert.equal(fitDraft({ answer: 'Sure', needsInput: [] }, { kind: 'checkbox' }).answer, '');
  const long =
    'I built payment retries at Acme. They cut failed charges. I also mentored two engineers on the team.';
  assert.equal(
    fitDraft({ answer: long, needsInput: [] }, { kind: 'textarea', maxLength: 60 }).answer,
    'I built payment retries at Acme. They cut failed charges.',
  );
  assert.deepEqual(
    fitDraft({ answer: '  ', needsInput: [' What is your notice period? ', ''] }, { kind: 'text' }),
    {
      answer: '',
      needsInput: ['What is your notice period?'],
    },
  );
});

test('a draft reads the chosen CV, sends no resume id to the model and fits the result', async () => {
  let seen: DraftContext | undefined;
  const useCase = new DraftAnswer(
    { read: (userId, id) => (assert.deepEqual([userId, id], ['user', 'cv-1']), Promise.resolve(cv)) },
    { draft: (context) => ((seen = context), Promise.resolve({ answer: 'x'.repeat(50), needsInput: [] })) },
  );
  const result = await useCase.execute('user', {
    question: 'Fintech Experience',
    kind: 'text',
    maxLength: 20,
    job: { title: 'Backend Developer', company: 'Zexter' },
    resumeId: 'cv-1',
  });
  assert.equal(result.answer.length, 20);
  assert.equal(seen?.cv, cv);
  assert.equal('resumeId' in (seen ?? {}), false);
});

test('the CV reader leaves out contact details and refuses CVs the user does not own', async () => {
  const resume = {
    snapshot: 2,
    contact: { firstName: 'Private', lastName: 'Person', email: 'private@example.com', phone: '+1 555 0100' },
    summaries: { default: 'Backend engineer.' },
    experiences: [
      {
        company: 'Acme',
        client: 'Bank',
        title: 'Engineer',
        from: '2020',
        to: '2022',
        current: false,
        blurb: null,
        achievements: [{ bullet: 'Built retries' }],
      },
    ],
    skills: [{ name: 'Node.js' }],
    educations: [{ degree: 'BSc', field: 'CS', institution: 'KPI' }],
  } as unknown as RenderedResume;
  const evidence = await new PublicCvEvidenceReader({ current: () => Promise.resolve(resume) }).read(
    'u',
    'cv',
  );
  assert.doesNotMatch(JSON.stringify(evidence), /Private|private@example\.com|555/);
  assert.equal(evidence.roles[0].company, 'Acme (client: Bank)');
  await assert.rejects(
    new PublicCvEvidenceReader({
      current: () => Promise.reject(new ResumeError('not-found', 'No such resume.')),
    }).read('u', 'x'),
    (error: unknown) => error instanceof DraftError && error.code === 'cv-not-found',
  );
});

test('the drafter sends the truth rules and source data, and rejects unusable replies', async () => {
  const context: DraftContext = { question: 'Why Zexter?', kind: 'textarea', job: { company: 'Zexter' }, cv };
  assert.match(DRAFT_SYSTEM, /Never invent experience/);
  assert.match(DRAFT_SYSTEM, /untrusted source data/);
  assert.match(draftPrompt(context), /"question":"Why Zexter\?"/);
  let options: unknown;
  const ok = new ClaudeCliAnswerDrafter({
    complete: (_prompt, _system, launch) => (
      (options = launch),
      Promise.resolve('Here: {"answer":"I build payment APIs. [add your reason]","needsInput":[]}')
    ),
  });
  assert.equal((await ok.draft(context)).answer, 'I build payment APIs. [add your reason]');
  assert.equal((options as { promptOnly: boolean }).promptOnly, true);
  const bad = new ClaudeCliAnswerDrafter({ complete: () => Promise.resolve('{"text":"wrong shape"}') });
  await assert.rejects(
    bad.draft(context),
    (error: unknown) => error instanceof DraftError && error.code === 'invalid-output',
  );
  const signedOut = new ClaudeCliAnswerDrafter({
    complete: () => Promise.reject(new Error('Not logged in')),
  });
  await assert.rejects(signedOut.draft(context), /claude auth login/);
});
