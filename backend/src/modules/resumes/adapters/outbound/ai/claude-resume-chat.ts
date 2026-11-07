import { z } from 'zod';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import type { ResumeChatModel } from '../../../application/use-cases/resume-assistant';
import type { RenderedResume } from '../../../domain/resume';
import { BULLET_RULES, SUMMARY_RULES, WRITING_RULES } from '../../../domain/cv-writing-guide';

/**
 * The editor's chat about one CV.
 *
 * Same rule as the line rewriter: it may reword and reorder what is on the
 * CV, never add a fact that is not. Suggested changes come back as data the
 * person applies one by one; the server checks each one points at real text.
 */
const SYSTEM = `You help someone improve their CV, in a chat beside the CV editor.

ABSOLUTE RULES:
- Use ONLY facts on the CV. Never invent a technology, metric, employer, title,
  date, scale or outcome. If they ask for something the CV cannot support, say
  so and ask what they actually did.
- Never inflate. "Helped build" does not become "led".
- Be brief and concrete. Answer the question asked.

You may propose changes as suggestions. Each one replaces the summary, the
headline or one bullet (by its id), or adds a skill the CV's text already shows.
Propose only changes that answer the question, at most 6. A summary follows the summary
rules and a bullet the bullet rules below.

${WRITING_RULES}

${SUMMARY_RULES}

${BULLET_RULES}`;

function cvForPrompt(resume: RenderedResume): string {
  const lines: string[] = [];
  const contact = resume.contact;
  if (contact?.headline) lines.push(`Headline: ${contact.headline}`);
  if (resume.summaries.default) lines.push(`Summary: ${resume.summaries.default}`);
  for (const role of resume.experiences) {
    lines.push(
      `\nRole: ${role.title} at ${role.company} (${role.from} – ${role.current ? 'present' : (role.to ?? '')})`,
    );
    for (const bullet of role.achievements) lines.push(`  [bullet ${bullet.lineageId}] ${bullet.bullet}`);
  }
  for (const project of resume.projects ?? [])
    lines.push(
      `\nProject: ${project.name}${project.role ? ` (${project.role})` : ''}`,
      ...project.bullets.map((b) => `  - ${b}`),
    );
  for (const row of resume.educations)
    lines.push(`Education: ${row.degree} ${row.field ?? ''}, ${row.institution}`);
  for (const item of resume.certifications ?? [])
    lines.push(`Certification: ${item.name}${item.issuer ? `, ${item.issuer}` : ''}`);
  lines.push(`Skills: ${resume.skills.map((skill) => skill.name).join(', ')}`);
  for (const section of resume.customSections ?? [])
    lines.push(`\n${section.title}: ${section.text ?? ''}`, ...section.bullets.map((b) => `  - ${b}`));
  return lines.join('\n');
}

export class ClaudeResumeChat implements ResumeChatModel {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}

  async answer(input: Parameters<ResumeChatModel['answer']>[0]) {
    const history = input.messages
      .slice(-12)
      .map((message) => `<${message.role}>\n${message.text}\n</${message.role}>`)
      .join('\n');
    const prompt = `<cv>
${cvForPrompt(input.resume)}
</cv>
${input.job ? `\n<job title="${input.job.title.replace(/"/g, "'")}">\n${input.job.description.slice(0, 12_000)}\n</job>\n` : ''}
<settings>
${input.settings}
</settings>

<chat>
${history}
</chat>

Answer the last user message. Return ONLY JSON, no prose and no code fences:

{
  "reply": "your answer, plain text",
  "suggestions": [
    { "target": "bullet", "lineageId": "the id in [bullet …]", "after": "the new bullet", "reason": "why, briefly" },
    { "target": "summary", "after": "the new summary", "reason": "…" },
    { "target": "headline", "after": "the new headline", "reason": "…" },
    { "target": "add-skill", "after": "Skill name", "reason": "where the CV shows it" }
  ]
}

"suggestions" may be empty.`;
    return readAnswer(await this.llm.complete(prompt, SYSTEM, { timeoutMs: 120_000, effort: 'medium' }));
  }
}

const answerSchema = z.object({
  reply: z.string().catch(''),
  suggestions: z
    .array(
      z.object({
        target: z.string().optional(),
        lineageId: z.string().optional(),
        after: z.string().optional(),
        reason: z.string().optional(),
      }),
    )
    .catch([]),
});

/** Prose without JSON still answered: it is the reply, with nothing to apply. */
function readAnswer(raw: string) {
  const json = firstJsonObject(raw);
  if (!json) return { reply: raw.trim(), suggestions: [] };
  const answer = answerSchema.parse(json);
  return {
    reply: answer.reply.trim() || 'I could not answer that. Try asking another way.',
    suggestions: answer.suggestions,
  };
}
