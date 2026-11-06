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
${input.groups.map((group) => `${group.category || '(no label)'}: ${group.skills.join(', ')}`).join('\n')}
</skills_lines>
${input.elsewhere.length ? `\n<other_lines_not_to_repeat>\n${input.elsewhere.join(', ')}\n</other_lines_not_to_repeat>\n` : ''}
<settings>
${input.settings}
</settings>

Return ONLY JSON, no prose and no code fences:

{
  "groups": [ { "category": "the line's category, exactly as given", "add": ["skills to add, or none"] } ],
  "cannotDo": ["skills the job asks for that the CV does not show, so they were not added"]
}

Return every line given, in the same order.`;
    return readAnswer(await this.llm.complete(prompt, SYSTEM, { timeoutMs: 120_000 }));
  }
}

const answerSchema = z.object({
  groups: z.array(z.object({ category: z.string().catch(''), add: z.array(z.string()).catch([]) })).catch([]),
  cannotDo: z.array(z.string()).catch([]),
});

function readAnswer(raw: string) {
  const json = firstJsonObject(raw);
  if (!json) return { groups: [], cannotDo: [] };
  // "(no label)" is how a line without a category was shown to the model.
  const answer = answerSchema.parse(json);
  return {
    groups: answer.groups.map((group) => ({
      ...group,
      category: group.category === '(no label)' ? '' : group.category,
    })),
    cannotDo: answer.cannotDo,
  };
}
