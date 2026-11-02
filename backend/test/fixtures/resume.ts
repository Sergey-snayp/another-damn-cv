/**
 * Resume rows for tests: name only the columns a test cares about, the
 * bookkeeping is filled in.
 */
import type {
  Achievement,
  Contact as ContactInformation,
  Experience as ExperienceEntry,
  Skill as SkillEntry,
  RenderedExperience,
} from '../../src/modules/resumes/domain/resume';

const versionColumns = (lineageId: string) => ({
  id: `row-${lineageId}`,
  lineageId,
  resumeId: 'resume-1',
  createdInSnapshot: 1,
  supersededInSnapshot: null,
});

export function contact(fields: Partial<ContactInformation> = {}): ContactInformation {
  return {
    ...versionColumns('contact'),
    firstName: 'Sam',
    lastName: 'Lee',
    email: 'sam@example.com',
    phone: null,
    location: null,
    linkedin: null,
    github: null,
    website: null,
    ...fields,
  };
}

export function bullet(lineageId: string, text: string, fields: Partial<Achievement> = {}): Achievement {
  return {
    ...versionColumns(lineageId),
    experienceLineageId: 'role',
    problem: null,
    action: null,
    result: null,
    bullet: text,
    verified: false,
    evidence: null,
    weight: 3,
    authoredBy: 'generator',
    position: 0,
    ...fields,
  };
}

export function role(
  lineageId: string,
  fields: Partial<ExperienceEntry>,
  achievements: Achievement[],
): RenderedExperience {
  return {
    ...versionColumns(lineageId),
    company: 'Company',
    client: null,
    title: 'Engineer',
    location: null,
    from: '2020-01',
    to: null,
    current: false,
    blurb: null,
    position: 0,
    ...fields,
    achievements: achievements.map((achievement, position) => ({
      ...achievement,
      experienceLineageId: lineageId,
      position,
    })),
  };
}

export function skill(lineageId: string, name: string): SkillEntry {
  return {
    ...versionColumns(lineageId),
    name,
    category: '',
    level: null,
    years: null,
    verified: false,
    evidence: null,
    weight: 3,
    aliases: [],
    position: 0,
  };
}
