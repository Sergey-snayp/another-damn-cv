import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultResumeId } from '../src/modules/resumes/domain/default-resume';

const row = (id: string, day: number, extra: { isPrimary?: boolean; jobId?: string } = {}) => ({
  id, isPrimary: extra.isPrimary ?? false, jobId: extra.jobId ?? null, createdAt: new Date(2026, 10, day),
});

test('the default CV: the one marked; else the first original made; else the first copy', () => {
  assert.equal(defaultResumeId([row('new', 9), row('master', 2), row('copy', 1, { jobId: 'j' })]), 'master', 'a tailored copy is not a master');
  assert.equal(defaultResumeId([row('a', 1), row('b', 5, { isPrimary: true })]), 'b');
  assert.equal(defaultResumeId([row('late', 9, { isPrimary: true }), row('early', 3, { isPrimary: true })]), 'early', 'several marked: the first');
  assert.equal(defaultResumeId([row('copy2', 4, { jobId: 'j' }), row('copy1', 2, { jobId: 'k' })]), 'copy1');
  assert.equal(defaultResumeId([]), null);
});
