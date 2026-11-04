import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matchAnswers,
  questionKey,
  similarity,
  type FormQuestion,
  type SavedAnswer,
} from '../src/modules/answers/domain/answers';
import {
  ForgetAnswer,
  MatchAnswers,
  SaveAnswers,
} from '../src/modules/answers/application/use-cases/manage-answers';
import type { AnswerRepository, NewAnswer } from '../src/modules/answers/application/ports/answers';

const saved = (
  question: string,
  answer: string,
  company: string | null = null,
  id = question,
): SavedAnswer => ({
  id,
  question,
  answer,
  company,
  usedCount: 0,
  lastUsedAt: null,
  updatedAt: new Date('2026-11-01T00:00:00Z'),
});
const ask = (
  id: string,
  question: string,
  kind: FormQuestion['kind'] = 'text',
  options?: string[],
): FormQuestion => ({
  id,
  question,
  kind,
  ...(options && { options }),
});

test('the same question shares one key regardless of case, punctuation and Required markers', () => {
  assert.equal(questionKey('Telegram account * Required'), 'telegram account');
  assert.equal(questionKey('Telegram account:'), questionKey('telegram  ACCOUNT'));
  assert.equal(questionKey('Referral (optional)'), 'referral');
});

test('similar wording is compared by meaningful words with simple plurals', () => {
  assert.equal(similarity('Telegram account', 'Your Telegram'), 1);
  assert.equal(
    similarity(
      'What are your monthly salary expectations? (USD, gross)',
      'What is your monthly salary expectation (USD, Gross)?',
    ),
    1,
  );
  assert.ok(
    similarity(
      'Do you have commercial experience in iGaming?',
      'Do you have commercial experience in fintech?',
    ) < 0.8,
  );
  assert.equal(similarity('???', 'Telegram'), 0);
});

test('exact matches fill as is, similar ones are marked, unrelated questions stay empty', () => {
  const answers = [saved('Telegram account', '@ada'), saved('Referral', 'No')];
  const { matches, skipped } = matchAnswers(
    [ask('1', 'Telegram account *'), ask('2', 'Your Telegram'), ask('3', 'Fintech Experience')],
    answers,
  );
  assert.deepEqual(
    matches.map((m) => [m.id, m.value, m.match]),
    [
      ['1', '@ada', 'exact'],
      ['2', '@ada', 'similar'],
    ],
  );
  assert.deepEqual(skipped, []);
});

test('an answer naming the company it was written for is not reused for another company', () => {
  const why = saved('Why do you want to work here?', 'I admire how Zexter ships iGaming products.', 'Zexter');
  const neutral = saved('Telegram account', '@ada', 'Zexter');
  const elsewhere = matchAnswers(
    [ask('1', 'Why do you want to work here?'), ask('2', 'Telegram account')],
    [why, neutral],
    'Acme',
  );
  assert.deepEqual(
    elsewhere.matches.map((m) => m.id),
    ['2'],
    'a neutral answer is still reused',
  );
  assert.deepEqual(elsewhere.skipped, [
    { id: '1', savedQuestion: why.question, reason: 'names-another-company' },
  ]);
  assert.equal(
    matchAnswers([ask('1', 'Why do you want to work here?')], [why], 'Zexter Ltd').matches.length,
    1,
  );
});

test('choice questions fill only with one of the form options, using its exact text', () => {
  const answers = [saved('Are you willing to relocate?', 'yes')];
  const radio = matchAnswers([ask('1', 'Are you willing to relocate?', 'radio', ['Yes', 'No'])], answers);
  assert.equal(radio.matches[0].value, 'Yes');
  const none = matchAnswers(
    [ask('1', 'Are you willing to relocate?', 'select', ['Within Europe', 'Remote only'])],
    answers,
  );
  assert.deepEqual(
    none.skipped.map((s) => s.reason),
    ['no-matching-option'],
  );
});

class MemoryAnswers implements AnswerRepository {
  rows: SavedAnswer[] = [];
  used: string[] = [];
  list() {
    return Promise.resolve(this.rows);
  }
  upsertMany(_userId: string, answers: NewAnswer[]) {
    for (const item of answers) {
      this.rows = this.rows.filter((row) => questionKey(row.question) !== item.questionKey);
      this.rows.push(saved(item.question, item.answer, item.company, `id-${this.rows.length}`));
    }
    return Promise.resolve(this.rows);
  }
  update() {
    return Promise.resolve(null);
  }
  remove() {
    return Promise.resolve(false);
  }
  removeByKey(_userId: string, key: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => questionKey(row.question) !== key);
    return Promise.resolve(this.rows.length < before);
  }
  markUsed(_userId: string, ids: string[]) {
    this.used.push(...ids);
    return Promise.resolve();
  }
}

test('saving keeps one answer per question, drops blanks, and matching records use', async () => {
  const repository = new MemoryAnswers();
  await new SaveAnswers(repository).execute('user', {
    company: ' Zexter ',
    answers: [
      { question: 'Telegram account *', answer: '@old' },
      { question: 'telegram account', answer: ' @ada ' },
      { question: 'Referral', answer: '   ' },
    ],
  });
  assert.deepEqual(
    repository.rows.map((row) => [row.question, row.answer, row.company]),
    [['telegram account', '@ada', 'Zexter']],
  );
  const result = await new MatchAnswers(repository).execute('user', {
    questions: [ask('7', 'Telegram account')],
  });
  assert.equal(result.matches[0].value, '@ada');
  assert.deepEqual(repository.used, [repository.rows[0].id]);
});

test('forgetting a question removes its answer whatever the punctuation', async () => {
  const repository = new MemoryAnswers();
  await new SaveAnswers(repository).execute('user', {
    answers: [{ question: 'How did you hear about us?', answer: 'LinkedIn' }],
  });
  assert.deepEqual(await new ForgetAnswer(repository).execute('user', 'how did you hear about us *'), {
    forgotten: true,
  });
  assert.deepEqual(await new ForgetAnswer(repository).execute('user', 'How did you hear about us?'), {
    forgotten: false,
  });
  assert.deepEqual(await new ForgetAnswer(repository).execute('user', '???'), { forgotten: false });
});
