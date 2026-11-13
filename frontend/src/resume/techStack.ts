import type { RenderedResume } from '../resumeApi';

/** A bullet that is really the job's tools: "Tech stack: Node.js, TypeScript, PostgreSQL". */
const STACK_LINE = /^\s*(?:tech(?:nology|nical)?\s+stack|technologies(?:\s+used)?|stack|tools(?:\s+used)?)\s*:\s*(.+?)\s*\.?\s*$/i;

/**
 * How a CV writes a job's tech stack: "TypeScript | Node.js | AWS Lambda". Whatever
 * it came in as (commas, semicolons, new lines), a CV built from it uses this.
 * One place, so the separator can become a design option later.
 */
export const STACK_SEPARATOR = ' | ';
export function stackLine(text: string | null | undefined, separator = STACK_SEPARATOR): string {
  const tools: string[] = [];
  let depth = 0;
  let tool = '';
  // A separator inside brackets belongs to the tool: "AWS (Lambda, S3)" stays one.
  for (const char of text ?? '') {
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    if (!depth && ',|;\n'.includes(char)) {
      tools.push(tool);
      tool = '';
    } else tool += char;
  }
  tools.push(tool);
  const seen = new Set<string>();
  return tools
    .map((name) => name.trim().replace(/\.$/, '').trim())
    .filter((name) => name && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))
    .join(separator);
}

/**
 * Moves a "Tech stack: …" bullet into its job's own tech stack, once, when the
 * job has none yet. CVs written before the field existed kept the stack as a
 * bullet, so the AI rewrote it as an achievement. A stack written with commas
 * is rewritten in the CV's style.
 */
export function withTechStacks<T extends RenderedResume>(resume: T): T {
  for (const role of resume.experiences ?? []) {
    if ((role.techStack ?? '').trim()) {
      role.techStack = stackLine(role.techStack);
      continue;
    }
    const at = role.achievements.findIndex((item) => STACK_LINE.test(item.bullet.replace(/\*\*/g, '')));
    if (at < 0) continue;
    role.techStack = stackLine(STACK_LINE.exec(role.achievements[at]!.bullet.replace(/\*\*/g, ''))![1]!);
    role.achievements.splice(at, 1);
  }
  return resume;
}

/** The same for a Profile job: its "Tech stack: …" bullet becomes its tech stack, when it has none. */
export function splitStackBullet(bullets: string[], techStack = ''): { bullets: string[]; techStack: string } {
  if (techStack.trim()) return { bullets, techStack };
  const at = bullets.findIndex((bullet) => STACK_LINE.test(bullet.replace(/\*\*/g, '')));
  if (at < 0) return { bullets, techStack: '' };
  return {
    bullets: bullets.filter((_, index) => index !== at),
    techStack: STACK_LINE.exec(bullets[at]!.replace(/\*\*/g, ''))![1]!,
  };
}

/** A job's own lines, for tailoring its tech stack: the only place a tool may come from. */
export function roleLines(role: RenderedResume['experiences'][number]): string {
  return [`${role.title} at ${role.company}`, role.blurb ?? '', ...role.achievements.map((item) => item.bullet)]
    .filter((line) => line.trim())
    .join('\n')
    .slice(0, 8_000);
}
