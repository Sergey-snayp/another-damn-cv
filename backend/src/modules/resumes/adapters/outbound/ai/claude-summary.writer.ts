import { z } from 'zod';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import type {
  SummaryDraft,
  SummaryInput,
  SummaryWriter,
} from '../../../application/use-cases/tailor-summary';
import type { CheckResult } from '../../../domain/summary-checks';
import { TailoringError } from '../../../application/tailoring-error';
import { SUMMARY_INSTRUCTIONS } from './summary-instructions';
import { withoutDashPunctuation } from '../../../domain/cv-writing-guide';

const answerSchema = z.object({
  summary: z.string().trim().min(1),
  word_count: z.coerce.number().int().nonnegative(),
  mapping: z.array(
    z.object({
      item: z.string(),
      type: z.enum(['required', 'preferred']),
      evidence: z.string(),
      employer: z.string().nullable(),
    }),
  ),
  gaps: z.array(z.string()),
  deciding_gap: z.string().nullable(),
});

/**
 * The CV summary writer: the summary instructions as the system prompt, the
 * posting and the experience record in tags, a JSON answer checked against
 * its schema (one retry when it is not valid).
 */
export class ClaudeSummaryWriter implements SummaryWriter {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}

  write(input: SummaryInput): Promise<SummaryDraft> {
    return this.ask(inputs(input));
  }

  fix(input: SummaryInput & { previous: SummaryDraft; failed: CheckResult[] }): Promise<SummaryDraft> {
    return this.ask(`${inputs(input)}

<previous_answer>
${JSON.stringify(answerOf(input.previous), null, 2)}
</previous_answer>

The summary in your previous answer failed these checks, run in code:
${input.failed.map((check) => `- ${check.name}: ${check.detail ?? 'failed'}`).join('\n')}

Fix every failed check while keeping all the other rules, and return the full JSON again.`);
  }

  private async ask(prompt: string): Promise<SummaryDraft> {
    const first = await this.llm.complete(prompt, SUMMARY_INSTRUCTIONS, {
      timeoutMs: 150_000,
      effort: 'medium',
    });
    const parsed = parse(first);
    if (parsed.ok) return parsed.draft;
    // One retry, telling the model what was wrong with the shape.
    const second = await this.llm.complete(
      `${prompt}

<your_previous_reply>
${first.slice(0, 6_000)}
</your_previous_reply>

That reply was not valid JSON in the required shape (${parsed.problem}). Return only the JSON object described under Output.`,
      SUMMARY_INSTRUCTIONS,
      { timeoutMs: 150_000, effort: 'medium' },
    );
    const retried = parse(second);
    if (retried.ok) return retried.draft;
    throw new TailoringError(
      'unavailable',
      `The AI did not return a valid summary (${retried.problem}). Try again.`,
    );
  }
}

function inputs(input: SummaryInput): string {
  return `<job_description>
${input.job}
</job_description>

<experience>
${input.experience}
</experience>${
    input.request?.trim()
      ? `\n\n<candidate_request>\n${input.request.trim()}\n</candidate_request>\nFollow the candidate's request only within the rules above.`
      : ''
  }`;
}

function parse(raw: string): { ok: true; draft: SummaryDraft } | { ok: false; problem: string } {
  const json = firstJsonObject(raw);
  if (!json) return { ok: false, problem: 'no JSON object found' };
  const result = answerSchema.safeParse(json);
  if (!result.success)
    return {
      ok: false,
      problem: result.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join('.') || 'answer'}: ${issue.message}`)
        .join('; '),
    };
  const answer = result.data;
  return {
    ok: true,
    draft: {
      summary: answer.summary,
      wordCount: answer.word_count,
      mapping: answer.mapping.map((line) => ({ ...line, employer: line.employer?.trim() || null })),
      gaps: answer.gaps.map((gap) => withoutDashPunctuation(gap.trim())).filter(Boolean),
      decidingGap: withoutDashPunctuation(answer.deciding_gap?.trim() || '') || null,
    },
  };
}

/** A draft in the JSON shape the instructions ask for, to send back for a fix. */
function answerOf(draft: SummaryDraft) {
  return {
    summary: draft.summary,
    word_count: draft.wordCount,
    mapping: draft.mapping,
    gaps: draft.gaps,
    deciding_gap: draft.decidingGap,
  };
}
