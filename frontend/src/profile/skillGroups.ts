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

/**
 * A CV's skills, all on one line, put under the Profile's groups: each skill
 * gets the group its name has on the Profile, groups in the Profile's order,
 * skills in the Profile's order inside a group, the rest last. Null when the
 * CV already has groups or the Profile has none that fit.
 */
export function groupLikeProfile<T extends { name: string; category?: string | null; position?: number }>(
  skills: T[],
  profileSkills: string[],
  types: Record<string, string>,
): T[] | null {
  if (!skills.length || skills.some((skill) => (skill.category ?? '').trim())) return null;
  const typeOf = new Map(Object.entries(types).map(([name, type]) => [name.trim().toLowerCase(), type.trim()]));
  const placed = skills.map((skill) => ({ ...skill, category: typeOf.get(skill.name.trim().toLowerCase()) ?? '' }));
  if (!placed.some((skill) => skill.category)) return null;
  const order = groupSkills(profileSkills, types).map((group) => group.name).filter(Boolean);
  const rank = (category: string) => (category ? (order.findIndex((name) => same(name, category)) + 1 || order.length + 1) : order.length + 2);
  const place = (name: string) => {
    const at = profileSkills.findIndex((skill) => same(skill, name));
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return placed
    .map((skill, at) => ({ skill, at }))
    .sort((a, b) => rank(a.skill.category) - rank(b.skill.category) || place(a.skill.name) - place(b.skill.name) || a.at - b.at)
    .map(({ skill }, position) => ({ ...skill, position }));
}
