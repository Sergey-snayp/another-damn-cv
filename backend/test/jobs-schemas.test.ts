import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { ZodValidationPipe } from '../src/shared/http/zod-validation.pipe';
import {
  captureSchema,
  jobEditSchema,
  manualJobSchema,
} from '../src/modules/jobs/adapters/inbound/http/jobs.schemas';

function rejection(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    assert.ok(err instanceof BadRequestException);
    return String((err.getResponse() as { message: string }).message);
  }
  throw new Error('expected a BadRequestException');
}

test('an edit: blank text clears a field, absent fields stay absent, status keeps its public spelling', () => {
  const edit = new ZodValidationPipe(jobEditSchema).transform({
    title: '  ',
    company: ' Acme ',
    status: 'interview',
  });
  assert.deepEqual(edit, { title: null, company: 'Acme', status: 'interview' });
  assert.ok(!('salary' in edit));
});

test('wrong input is refused with a readable message', () => {
  assert.equal(
    rejection(() => new ZodValidationPipe(jobEditSchema).transform({ status: 'hired' })),
    `status must be one of: ${Object.values(JobStatus)
      .map((s) => s.toLowerCase())
      .join(', ')}.`,
  );
  assert.equal(
    rejection(() => new ZodValidationPipe(jobEditSchema).transform({ remote: 'yes' })),
    'remote must be true, false or null.',
  );
  assert.equal(
    rejection(() => new ZodValidationPipe(manualJobSchema).transform({ description: '   ' })),
    'Paste the job description.',
  );
  assert.equal(
    rejection(() => new ZodValidationPipe(captureSchema).transform({})),
    'The page address is missing.',
  );
});

test('a capture over the size limits is refused before it reaches the database', () => {
  assert.equal(
    rejection(() =>
      new ZodValidationPipe(captureSchema).transform({ url: 'https://x', html: 'x'.repeat(1_500_001) }),
    ),
    'That page is too large to save.',
  );
});
