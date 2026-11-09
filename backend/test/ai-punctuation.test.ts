import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeLineRewriter } from '../src/modules/resumes/adapters/outbound/ai/claude-line.rewriter';
import { ClaudeAchievementWriter } from '../src/modules/profiles/adapters/outbound/ai/claude-achievement.writer';
import { ClaudeCoverLetterWriter } from '../src/modules/resumes/adapters/outbound/ai/claude-cover-letter.writer';
import { ClaudeCliAnswerDrafter } from '../src/modules/answers/adapters/outbound/ai/claude-cli-answer.drafter';
import { ClaudeTechnologyDescriber } from '../src/modules/resumes/adapters/outbound/ai/claude-technology.describer';
import { ClaudeResumeChat } from '../src/modules/resumes/adapters/outbound/ai/claude-resume-chat';
import { checkedSuggestions } from '../src/modules/resumes/domain/resume-assistant';
import { readCandidate, readRetry } from '../src/modules/resumes/adapters/outbound/ai/tailoring/answer';
import type { RenderedResume } from '../src/modules/resumes/contracts';

const prose = 'Built React Native screens — with Expo Router - for mobile users.';
const clean = 'Built React Native screens, with Expo Router, for mobile users.';
const runner = (value: unknown) => ({ complete: () => Promise.resolve(JSON.stringify(value)) });

test('every CV line rewrite kind cleans model output, plain-text responses and fallback originals', async () => {
  for (const kind of ['bullet', 'summary', 'blurb', 'headline', 'techStack'] as const) {
    const result = await new ClaudeLineRewriter(
      runner({ suggestion: prose, cannotDo: ['Missing facts - please add them.'] }),
    ).rewrite({ text: 'Existing text.', instruction: 'Rewrite.', kind });
    assert.equal(result.suggestion, clean);
    assert.equal(result.cannotDo[0], 'Missing facts, please add them.');
  }
  const raw = await new ClaudeLineRewriter({ complete: () => Promise.resolve(prose) }).rewrite({
    text: 'Existing text.',
    instruction: 'Rewrite.',
  });
  assert.equal(raw.suggestion, clean);
  const fallback = await new ClaudeLineRewriter(runner({ suggestion: '' })).rewrite({
    text: prose,
    instruction: 'Rewrite.',
  });
  assert.equal(fallback.suggestion, clean);
  assert.equal(fallback.original, prose);
});

test('Profile drafting and follow-up rewrites clean bullets, descriptions and questions', async () => {
  const source = {
    title: 'Engineer',
    company: 'Ciklum',
    client: 'SymphonyAI',
    description: '',
    bullets: [],
    techStack: 'React Native, Expo Router',
    notes: prose,
  };
  const writer = new ClaudeAchievementWriter(
    runner({
      achievements: [{ text: prose, asks: ['Which screens - and when?'] }],
      description: 'Mobile platform — for customers.',
      techStack: [],
    }),
  );
  const result = await writer.draft(source);
  assert.equal(result.achievements[0].text, clean);
  assert.equal(result.achievements[0].asks[0], 'Which screens, and when?');
  assert.equal(result.description, 'Mobile platform, for customers.');
  const deeper = await new ClaudeAchievementWriter(
    runner({ text: prose, asks: ['Which screens - and when?'] }),
  ).deepen({ source, text: prose, answers: [] });
  assert.equal(deeper.text, clean);
  assert.equal(deeper.asks[0], 'Which screens, and when?');
});

test('cover letters and technology descriptions enforce the same punctuation preference', async () => {
  const letter = await new ClaudeCoverLetterWriter(
    runner({ letter: prose, cannotClaim: ['Missing experience - not shown.'] }),
  ).write({ job: 'Mobile role.', experience: prose, candidate: 'Sam' });
  assert.equal(letter.letter, clean);
  assert.equal(letter.cannotClaim[0], 'Missing experience, not shown.');
  const description = await new ClaudeTechnologyDescriber({
    complete: () => Promise.resolve('Node-RED — a tool - for flows.'),
  }).describe({ name: 'Node-RED', mentions: [] });
  assert.equal(description, 'Node-RED, a tool, for flows.');
});

test('application text is cleaned while exact dropdown labels and numeric values stay unchanged', async () => {
  const drafter = new ClaudeCliAnswerDrafter(
    runner({ answer: prose, needsInput: ['Which screens - and when?'] }),
  );
  const base = {
    question: 'Describe your work.',
    job: {},
    cv: { summary: '', roles: [], skills: [], education: [] },
  };
  assert.equal((await drafter.draft({ ...base, kind: 'textarea' })).answer, clean);
  const label = 'Canada — authorized';
  const choice = await new ClaudeCliAnswerDrafter(runner({ answer: label, needsInput: [] })).draft({
    ...base,
    kind: 'select',
    options: [label],
  });
  assert.equal(choice.answer, label);
  const number = await new ClaudeCliAnswerDrafter(runner({ answer: '-5', needsInput: [] })).draft({
    ...base,
    kind: 'number',
  });
  assert.equal(number.answer, '-5');
});

test('assistant replies, suggested text and full-tailoring retries are cleaned without mutating source text', async () => {
  const resume: RenderedResume = {
    snapshot: 1,
    contact: null,
    experiences: [],
    skills: [],
    educations: [],
    summaries: { default: prose },
  };
  const result = await new ClaudeResumeChat(
    runner({
      reply: prose,
      suggestions: [{ target: 'summary', after: prose, reason: 'More specific - for the job.' }],
    }),
  ).answer({ resume, job: null, settings: '', messages: [{ role: 'user', text: 'Rewrite.' }] });
  assert.equal(result.reply, clean);
  const [suggestion] = checkedSuggestions(resume, result.suggestions);
  assert.equal(suggestion.after, clean);
  assert.equal(suggestion.reason, 'More specific, for the job.');
  assert.equal(suggestion.before, prose);
  const ids = {
    roles: new Map([['r1', 'role']]),
    bullets: new Map([['b1', { lineageId: 'bullet', experienceLineageId: 'role' }]]),
    skills: new Map<string, string>(),
  };
  const full = readCandidate(
    JSON.stringify({ summary: prose, roles: [{ id: 'r1', bullets: [{ id: 'b1', text: prose }] }] }),
    ids,
  )!;
  assert.equal(full.summary, clean);
  assert.equal(full.roles[0].bullets[0].text, clean);
  assert.equal(readRetry(JSON.stringify({ lines: [{ id: 'b1', text: prose }] }))[0].text, clean);
});
