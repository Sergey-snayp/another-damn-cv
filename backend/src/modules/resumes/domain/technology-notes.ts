import type { RenderedResume } from './resume';
import { shownIn } from './resume-assistant';

/** How a technology is looked up: "Node.js" and " node.js " are the same note. */
export function technologyKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Lines of the CV that name the technology, with where they come from, so the
 * AI can tell which "Hive" or "Spark" is meant. At most `limit` lines.
 */
export function linesMentioning(resume: RenderedResume, name: string, limit = 4): string[] {
  const lines: string[] = [];
  const add = (where: string, text: string | null | undefined) => {
    if (lines.length < limit && text && shownIn(text, name))
      lines.push(`${where}: ${text.trim().slice(0, 300)}`);
  };
  for (const role of resume.experiences) {
    const where = [role.title, role.company].filter(Boolean).join(' at ');
    add(where, role.blurb);
    add(where, role.techStack ? `Tech stack: ${role.techStack}` : null);
    for (const achievement of role.achievements) add(where, achievement.bullet);
  }
  for (const project of resume.projects ?? [])
    for (const bullet of project.bullets) add(project.name, bullet);
  return lines;
}

/** The model's answer as one plain sentence or two, or null when there is nothing usable. */
export function cleanDescription(raw: string): string | null {
  const text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“']|["”']$/g, '');
  if (!text) return null;
  if (text.length <= 280) return text;
  const cut = text.slice(0, 280);
  const end = cut.lastIndexOf('. ');
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
