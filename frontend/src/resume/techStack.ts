import type { RenderedResume } from '../resumeApi';

/** A bullet that is really the job's tools: "Tech stack: Node.js, TypeScript, PostgreSQL". */
const STACK_LINE = /^\s*(?:tech(?:nology|nical)?\s+stack|technologies(?:\s+used)?|stack|tools(?:\s+used)?)\s*:\s*(.+?)\s*\.?\s*$/i;

/**
 * Moves a "Tech stack: …" bullet into its job's own tech stack, once, when the
 * job has none yet. CVs written before the field existed kept the stack as a
 * bullet, so the AI rewrote it as an achievement.
 */
export function withTechStacks<T extends RenderedResume>(resume: T): T {
  for (const role of resume.experiences ?? []) {
    if ((role.techStack ?? '').trim()) continue;
    const at = role.achievements.findIndex((item) => STACK_LINE.test(item.bullet.replace(/\*\*/g, '')));
    if (at < 0) continue;
    role.techStack = STACK_LINE.exec(role.achievements[at]!.bullet.replace(/\*\*/g, ''))![1]!;
    role.achievements.splice(at, 1);
  }
  return resume;
}

/** A job's own lines, for tailoring its tech stack: the only place a tool may come from. */
export function roleLines(role: RenderedResume['experiences'][number]): string {
  return [`${role.title} at ${role.company}`, role.blurb ?? '', ...role.achievements.map((item) => item.bullet)]
    .filter((line) => line.trim())
    .join('\n')
    .slice(0, 8_000);
}
