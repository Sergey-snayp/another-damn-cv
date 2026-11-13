import type { AchievementWriter } from '../ports/achievement-writer';
import { AchievementError } from '../../domain/achievements';

export interface SkillGroupProposal {
  name: string;
  skills: string[];
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * "Sort into groups" for the Profile's skills: the groups of a CV's skills
 * section ("Core: TypeScript, Node.js"), proposed by the AI and checked here.
 * Every skill is placed once, spelled as the person wrote it; a name the AI
 * made up is dropped, and a skill it left out goes to "Other". Nothing is saved.
 */
export class GroupSkills {
  constructor(private readonly writer: Pick<AchievementWriter, 'groupSkills'>) {}

  async execute(skills: string[]): Promise<{ groups: SkillGroupProposal[] }> {
    const given = new Map<string, string>();
    for (const skill of skills) if (skill.trim() && !given.has(key(skill))) given.set(key(skill), skill.trim());
    if (!given.size) return { groups: [] };
    const placed = new Set<string>();
    const groups: SkillGroupProposal[] = [];
    for (const group of await this.writer.groupSkills([...given.values()])) {
      const name = group.name.replace(/\s+/g, ' ').replace(/:$/, '').trim().slice(0, 40);
      if (!name || key(name) === 'other') continue;
      const names = group.skills
        .map((skill) => given.get(key(skill)))
        .filter((skill): skill is string => !!skill && !placed.has(key(skill)));
      names.forEach((skill) => placed.add(key(skill)));
      if (!names.length) continue;
      const same = groups.find((item) => key(item.name) === key(name));
      if (same) same.skills.push(...names);
      else groups.push({ name, skills: names });
    }
    if (!groups.length) throw new AchievementError('The AI could not sort these skills into groups. Try again.');
    const rest = [...given.values()].filter((skill) => !placed.has(key(skill)));
    if (rest.length) groups.push({ name: 'Other', skills: rest });
    return { groups };
  }
}
