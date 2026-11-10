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

type Parsed = { ok: true; draft: SummaryDraft } | { ok: false; problem: string };
type AskOptions = {
  timeoutMs: number;
  effort: 'low' | 'medium';
  model?: string;
  onText?: (soFar: string) => void;
};

/**
 * The CV summary writer: the summary instructions as the system prompt, the
 * posting and the experience record in tags. The answer is the summary first,
 * then the gaps, each in its own tag, so the summary can be shown while the
 * rest is still being written (one retry when the tags are missing). A fix
 * returns only the corrected summary, and a quick fix runs on the smaller,
 * faster model. The draft is written at low effort: at medium, Sonnet 5
 * thought for about 3,300 tokens and took 38 seconds.
 */
export class ClaudeSummaryWriter implements SummaryWriter {
  constructor(
    private readonly llm: Pick<ClaudeProcessRunner, 'complete'>,
    private readonly models: { draft?: string; quick?: string } = {},
  ) {}

  write(input: SummaryInput, onSummary?: (soFar: string) => void): Promise<SummaryDraft> {
    let shown = '';
    return this.ask(
      inputs(input),
      parse,
      'Return only the <summary>, <gaps> and <deciding_gap> tags described under Output.',
      {
        timeoutMs: 150_000,
        effort: 'low',
        model: this.models.draft,
        ...(onSummary
          ? {
              onText: (soFar: string) => {
                const summary = summarySoFar(soFar);
                if (summary && summary !== shown) onSummary((shown = summary));
              },
            }
          : {}),
      },
    );
  }

  fix(input: SummaryFixInput): Promise<SummaryDraft> {
    const sentences = sentencesOf(input.previous.summary);
    const which = input.change
      ? `Rewrite only sentence${input.change.length > 1 ? 's' : ''} ${input.change.map((index) => index + 1).join(', ')}. Copy every other sentence exactly as it is, word for word.`
      : 'Change as little as the failed checks need; keep the sentences that are fine as they are.';
    const shape = 'Return only the corrected summary in <summary></summary> tags: no gaps, nothing else.';
    const prompt = `${inputs(input)}

<previous_summary>
${sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join('\n')}
</previous_summary>

The summary above (its sentences numbered here only to name them) failed these checks, run in code:
${input.failed.map((check) => `- ${check.name}: ${check.detail ?? 'failed'}`).join('\n')}

You are fixing this summary, not writing a new one: skip Steps 1, 2 and 4. Fix every failed check while keeping all the other rules. ${which} Any words you add must come from the experience record: never a number, tool, title or claim it does not hold. Keep the **bold** marks, and leave out the 1., 2. labels shown above.

${shape}`;
    const parseFix = (raw: string): Parsed => {
      const summary = tag(raw, 'summary');
      if (!summary) return { ok: false, problem: 'no <summary> tag' };
      // The gaps carry over from the draft being fixed.
      return { ok: true, draft: { ...input.previous, summary } };
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
    options: AskOptions,
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

That reply was not in the required shape (${parsed.problem}). ${shape}`,
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

/** What one tag holds, or null when the answer has no such tag. */
function tag(raw: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(raw);
  const text = match?.[1].trim();
  return text || null;
}

/** The summary written so far: after <summary>, without a closing tag that is half written. */
export function summarySoFar(soFar: string): string {
  const start = soFar.indexOf('<summary>');
  if (start < 0) return '';
  const rest = soFar.slice(start + '<summary>'.length);
  const end = rest.indexOf('</summary>');
  return (end >= 0 ? rest.slice(0, end) : rest.replace(/<\/?[a-z_]*$/i, '')).trim();
}

function parse(raw: string): Parsed {
  const summary = tag(raw, 'summary');
  if (!summary) return { ok: false, problem: 'no <summary> tag' };
  const gaps = (tag(raw, 'gaps') ?? '')
    .split('\n')
    .map((line) => withoutDashPunctuation(line.replace(/^\s*[-*•]\s*/, '').trim()))
    .filter((line) => line && !/^none\.?$/i.test(line));
  const deciding = withoutDashPunctuation(tag(raw, 'deciding_gap') ?? '');
  return {
    ok: true,
    draft: {
      summary,
      wordCount: 0,
      gaps,
      decidingGap: deciding && !/^none\.?$/i.test(deciding) ? deciding : null,
    },
  };
}
