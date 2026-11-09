import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import type { TechnologyDescriber } from '../../../application/use-cases/describe-technology';
import { DASH_PUNCTUATION_RULE, withoutDashPunctuation } from '../../../domain/cv-writing-guide';

const SYSTEM = `You explain technologies named on CVs, for a recruiter who is not an engineer.
${DASH_PUNCTUATION_RULE}

RULES:
- Say what the technology is and what it is used for, in one plain sentence of at most
  25 words. No marketing words, no history, no versions.
- Describe the technology only. Say nothing about the candidate.
- When the CV lines show which of several things with that name is meant (Hive the
  blockchain or Apache Hive), describe that one.
- If the name is not a technology, tool, method or standard, describe it briefly as
  the CV uses it.
- Plain text only: no quotes, no markdown, no lists.`;

export class ClaudeTechnologyDescriber implements TechnologyDescriber {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}

  async describe(input: { name: string; mentions: string[] }): Promise<string> {
    const prompt = `<technology>${input.name}</technology>
${input.mentions.length ? `\n<cv_lines_that_name_it>\n${input.mentions.join('\n')}\n</cv_lines_that_name_it>\n` : ''}
What is ${input.name}? Answer with the sentence only.`;
    return withoutDashPunctuation(
      await this.llm.complete(prompt, SYSTEM, { timeoutMs: 60_000, maxOutputChars: 2_000, effort: 'low' }),
    );
  }
}
