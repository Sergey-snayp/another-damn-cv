import { z } from 'zod';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import type {
  SummaryDraft,
  SummaryFixInput,
  SummaryInput,
  SummaryWriter,
} from '../../../application/use-cases/tailor-summary';
import { sentencesOf } from '../../../domain/summary-checks';
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
/** A fix sends back the summary alone; the mapping and gaps stay from the draft it fixes. */
const fixSchema = z.object({ summary: z.string().trim().min(1) });

type Parsed = { ok: true; draft: SummaryDraft } | { ok: false; problem: string };

/**
 * The CV summary writer: the summary instructions as the system prompt, the
 * posting and the experience record in tags, a JSON answer checked against
 * its schema (one retry when it is not valid). A fix returns only the
 * corrected summary, and a quick fix runs on the smaller, faster model.
 * The draft is written at low effort: at medium, Sonnet 5 thought for about
 * 3,300 tokens and took 38 seconds; Sonnet 5.5 at low takes about 12 and
 * passed the checks as often.
 */
export class ClaudeSummaryWriter implements SummaryWriter {
  constructor(
    private readonly llm: Pick<ClaudeProcessRunner, 'complete'>,
    private readonly models: { draft?: string; quick?: string } = {},
  ) {}

  write(input: SummaryInput): Promise<SummaryDraft> {
    return this.ask(inputs(input), parse, 'Return only the JSON object described under Output.', {
      timeoutMs: 150_000,
      effort: 'low',
      model: this.models.draft,
    });
  }

  fix(input: SummaryFixInput): Promise<SummaryDraft> {
    const sentences = sentencesOf(input.previous.summary);
    const which = input.change
      ? `Rewrite only sentence${input.change.length > 1 ? 's' : ''} ${input.change.map((index) => index + 1).join(', ')}. Copy every other sentence exactly as it is, word for word.`
      : 'Change as little as the failed checks need; keep the sentences that are fine as they are.';
    const shape =
      'Return only this JSON object: {"summary": "<the corrected summary>"}. No mapping, gaps or anything else.';
    const prompt = `${inputs(input)}

<previous_summary>
${sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join('\n')}
</previous_summary>

The summary above (its sentences numbered here only to name them) failed these checks, run in code:
${input.failed.map((check) => `- ${check.name}: ${check.detail ?? 'failed'}`).join('\n')}

You are fixing this summary, not writing a new one: skip Steps 1, 2 and 4. Fix every failed check while keeping all the other rules. ${which} Any words you add must come from the experience record: never a number, tool, title or claim it does not hold. Keep the **bold** marks, and leave out the 1., 2. labels shown above.

${shape}`;
    const parseFix = (raw: string): Parsed => {
      const json = firstJsonObject(raw);
      if (!json) return { ok: false, problem: 'no JSON object found' };
      const result = fixSchema.safeParse(json);
      if (!result.success) return { ok: false, problem: 'summary: missing' };
      // Mapping and gaps carry over from the draft being fixed.
      return { ok: true, draft: { ...input.previous, summary: result.data.summary } };
    };
    return this.ask(
      prompt,
      parseFix,
      shape,
      input.quick && this.models.quick
        ? { timeoutMs: 60_000, effort: 'low', model: this.models.quick }
        : { timeoutMs: 150_000, effort: 'medium', model: this.models.draft },
    );
  }

  private async ask(
    prompt: string,
    parseReply: (raw: string) => Parsed,
    shape: string,
    options: { timeoutMs: number; effort: 'low' | 'medium'; model?: string },
  ): Promise<SummaryDraft> {
    const first = await this.llm.complete(prompt, SUMMARY_INSTRUCTIONS, options);
    const parsed = parseReply(first);
    if (parsed.ok) return parsed.draft;
    // One retry, telling the model what was wrong with the shape.
    const second = await this.llm.complete(
      `${prompt}

<your_previous_reply>
${first.slice(0, 6_000)}
</your_previous_reply>

That reply was not valid JSON in the required shape (${parsed.problem}). ${shape}`,
      SUMMARY_INSTRUCTIONS,
      options,
    );
    const retried = parseReply(second);
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

function parse(raw: string): Parsed {
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
