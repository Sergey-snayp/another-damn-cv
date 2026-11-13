/**
 * Skills in groups, as a CV writes them: "Core: TypeScript, Node.js". The Profile
 * keeps one list of skills and each one's group by name; these helpers turn
 * that into groups and back.
 */
export interface SkillGroup {
  /** "Core", "AI"; empty for skills without a group. */
  name: string;
  skills: string[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The groups in the order their first skill appears; skills without a group last. */
export function groupSkills(skills: string[], types: Record<string, string> = {}): SkillGroup[] {
  const groups: SkillGroup[] = [];
  const loose: string[] = [];
  for (const skill of skills) {
    const name = (types[skill] ?? '').trim();
    if (!name) {
      loose.push(skill);
      continue;
    }
    const group = groups.find((item) => same(item.name, name));
    if (group) group.skills.push(skill);
    else groups.push({ name, skills: [skill] });
  }
  return loose.length ? [...groups, { name: '', skills: loose }] : groups;
}

/** Groups back to the Profile's list and each skill's group. A skill listed twice keeps its first place. */
export function flattenGroups(groups: SkillGroup[]): { skills: string[]; skillTypes: Record<string, string> } {
  const skills: string[] = [];
  const skillTypes: Record<string, string> = {};
  for (const group of groups)
    for (const raw of group.skills) {
      const skill = raw.trim();
      if (!skill || skills.some((other) => same(other, skill))) continue;
      skills.push(skill);
      if (group.name.trim()) skillTypes[skill] = group.name.trim();
    }
  return { skills, skillTypes };
}

/** One line per group, for a text box: "Core: TypeScript, Node.js". */
export function groupLines(groups: SkillGroup[]): string {
  return groups.map((group) => (group.name ? `${group.name}: ${group.skills.join(', ')}` : group.skills.join(', '))).join('\n');
}

/** The text box back to groups: "Core: A, B" is a group; a line without a name is skills without one. */
export function parseGroupLines(text: string): SkillGroup[] {
  const groups: SkillGroup[] = [];
  for (const line of text.split('\n')) {
    const named = /^\s*([^:,|]{1,80}?)\s*:\s*(.*)$/.exec(line);
    const name = named ? named[1]!.trim() : '';
    const skills = (named ? named[2]! : line)
      .split(/[,;|]/)
      .map((skill) => skill.trim())
      .filter(Boolean);
    if (!skills.length) continue;
    const group = groups.find((item) => same(item.name, name));
    if (group) group.skills.push(...skills);
    else groups.push({ name, skills });
  }
  return groups;
}
