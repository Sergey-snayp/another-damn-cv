import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType, core } from 'zod';

/**
 * `@Body(new ZodValidationPipe(schema))`: the body is parsed by the schema
 * before the handler runs, and the handler receives the parsed, typed value.
 *
 * Schemas give user-facing messages as full sentences ("Paste the job
 * description."); those are shown as they are. Zod's own messages are not
 * sentences, so they get the field name in front.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException(result.error.issues.map(describeIssue).join(' '));
  }
}

function describeIssue(issue: core.$ZodIssue): string {
  if (issue.message.endsWith('.')) return issue.message;
  const field = issue.path.join('.');
  return field ? `${field}: ${issue.message}.` : `${issue.message}.`;
}
