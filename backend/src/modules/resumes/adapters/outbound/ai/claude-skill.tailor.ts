import { z } from 'zod';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import type { SkillTailor } from '../../../application/use-cases/resume-assistant';
import { SKILLS_RULES } from '../../../domain/cv-writing-guide';

/**
 * Skills to add to each line for one job. Lines are never reordered or cut:
 * the model only names skills to add, and the server checks every name against
 * the CV (checkedSkillGroups).
 */
const SYSTEM = `You suggest skills to add to the skills section of someone's CV for one job.

ABSOLUTE RULES:
- Suggest a skill only if the CV text names it. Never add a skill the CV does not
  show, even if the job asks for it.
- Never suggest a skill that is already in any line.
- Do not reorder, rename or remove anything: you only name skills to add.
- Put a skill only in a line where it belongs. Keep each skill's spelling as the CV has it.

What to do: for each line, name the skills the CV shows elsewhere (in jobs, projects
or other text) that this job asks for or would value and that fit that line. Most
lines will have nothing to add: return an empty list for them.

${SKILLS_RULES}`;

export class ClaudeSkillTailor implements SkillTailor {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}

  async tailor(input: Parameters<SkillTailor['tailor']>[0]) {
    const prompt = `<job title="${input.job.title.replace(/"/g, "'")}">
${input.job.description.slice(0, 10_000)}
</job>

<cv>
${input.evidence.slice(0, 10_000)}
</cv>

<skills_lines>
${input.groups.map((group, index) => `l${index + 1} | ${group.category || '(no label)'}: ${group.skills.join(', ')}`).join('\n')}
</skills_lines>
${input.elsewhere.length ? `\n<other_lines_not_to_repeat>\n${input.elsewhere.join(', ')}\n</other_lines_not_to_repeat>\n` : ''}
<settings>
${input.settings}
</settings>

Return ONLY JSON, no prose and no code fences:

{
  "groups": [ { "line": "the line's id, such as l1", "add": ["skills to add, or none"] } ],
  "cannotDo": ["skills the job asks for that the CV does not show, so they were not added"]
}

Return every line given, in the same order.`;
    return readAnswer(
      await this.llm.complete(prompt, SYSTEM, { timeoutMs: 120_000, effort: 'low' }),
      input.groups,
    );
  }
}

const answerSchema = z.object({
  groups: z
    .array(
      z.object({
        line: z.string().catch(''),
        category: z.string().catch(''),
        add: z.array(z.string()).catch([]),
      }),
    )
    .catch([]),
  cannotDo: z.array(z.string()).catch([]),
});

/**
 * Each answer back to its line by the line's id ("l2"). Models sometimes echo the
 * whole line ("Core: TypeScript, Node.js") where a category was asked for, so a
 * category is matched only by its own name, before any ":".
 */
function readAnswer(raw: string, lines: Array<{ category: string }>) {
  const json = firstJsonObject(raw);
  if (!json) return { groups: [], cannotDo: [] };
  const answer = answerSchema.parse(json);
  const lineOf = (group: { line: string; category: string }) => {
    const byId = /^l?(\d+)$/i.exec(group.line.trim());
    if (byId && lines[Number(byId[1]) - 1]) return lines[Number(byId[1]) - 1];
    const name = group.category.split(':')[0].trim().toLowerCase();
    // "(no label)" is how a line without a category was shown to the model.
    return lines.find((line) => (line.category || '(no label)').toLowerCase() === name);
  };
  return {
    groups: answer.groups.flatMap((group) => {
      const line = lineOf(group);
      return line ? [{ category: line.category, add: group.add }] : [];
    }),
    cannotDo: answer.cannotDo,
  };
}
