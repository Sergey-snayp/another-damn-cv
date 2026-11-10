import type { CareerExperience } from './career-profile';

/** Whole years since the first job started ("2019-08" → 7 in 2026), or null without dates. */
export function yearsOfExperience(roles: CareerExperience[], today = new Date()): number | null {
  const starts = roles
    .map((role) => /^(\d{4})(?:-(\d{2}))?/.exec(role.from.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => Number(match[1]) * 12 + (match[2] ? Number(match[2]) - 1 : 0));
  if (!starts.length) return null;
  const months = today.getFullYear() * 12 + today.getMonth() - Math.min(...starts);
  return months >= 12 ? Math.floor(months / 12) : null;
}

/**
 * Everything the Profile says, as one text for the AI and the checks: each job
 * (title, employer, client, dates, description, tools, the bullets used in CVs),
 * the skills, and the years of experience counted from the dates.
 */
export function profileFacts(roles: CareerExperience[], skills: string[], today = new Date()): string {
  const years = yearsOfExperience(roles, today);
  const jobs = roles.map((role) =>
    [
      `${role.title} at ${role.company}${role.client ? ` (for ${role.client})` : ''}, ${role.from || '?'} to ${role.current ? 'present' : role.to || '?'}`,
      role.description && `Description: ${role.description}`,
      role.techStack && `Tech stack: ${role.techStack}`,
      ...role.bullets
        .filter((bullet) => !(role.excluded ?? []).includes(bullet))
        .map((bullet) => `- ${bullet}`),
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return [
    years ? `Years of experience: ${years} (${years}+ years)` : '',
    ...jobs,
    skills.length ? `Skills: ${skills.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
