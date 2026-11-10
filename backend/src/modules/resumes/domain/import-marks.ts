import type { ImportedProfile } from './import-proposal';
import { withoutMarks } from './text-marks';

const LINK = /\[[^\]\n]*\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/;

/** A link field: the address of "[LinkedIn](https://…)", or the words as written. */
const linkOrText = (value?: string) =>
  value === undefined ? value : (LINK.exec(value)?.[1] ?? withoutMarks(value));
/** The same object without the keys left undefined: nothing is added that was not there. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

const plain = (value?: string) => (value === undefined ? value : withoutMarks(value).trim());

/**
 * Formatting read from a CV file stays where a person reads it as text: the
 * summary, role descriptions and bullets. Names, titles, dates, skills and
 * contact details are kept as plain words, and a link field keeps its address.
 */
export function marksOnlyInText(profile: ImportedProfile): ImportedProfile {
  return defined({
    ...profile,
    firstName: plain(profile.firstName),
    lastName: plain(profile.lastName),
    fullName: plain(profile.fullName),
    preferredName: plain(profile.preferredName),
    email: plain(profile.email),
    phone: plain(profile.phone),
    location: plain(profile.location),
    city: plain(profile.city),
    state: plain(profile.state),
    country: plain(profile.country),
    postalCode: plain(profile.postalCode),
    linkedin: linkOrText(profile.linkedin),
    github: linkOrText(profile.github),
    portfolio: linkOrText(profile.portfolio),
    website: linkOrText(profile.website),
    headline: plain(profile.headline),
    currentCompany: plain(profile.currentCompany),
    currentTitle: plain(profile.currentTitle),
    yearsExperience: plain(profile.yearsExperience),
    skills: profile.skills?.map((skill) => withoutMarks(skill).trim()),
    skillGroups: profile.skillGroups?.map((group) => ({
      category: withoutMarks(group.category).replace(/:\s*$/, '').trim(),
      skills: group.skills.map((skill) => withoutMarks(skill).trim()),
    })),
    experience: profile.experience?.map((role) =>
      defined({
        ...role,
        company: withoutMarks(role.company).trim(),
        title: withoutMarks(role.title).trim(),
        client: plain(role.client),
        location: plain(role.location),
        from: withoutMarks(role.from).trim(),
        to: plain(role.to),
      }),
    ),
    education: profile.education?.map((row) =>
      defined({
        ...row,
        institution: withoutMarks(row.institution).trim(),
        degree: withoutMarks(row.degree).trim(),
        field: plain(row.field),
        from: withoutMarks(row.from).trim(),
        to: plain(row.to),
      }),
    ),
    projects: profile.projects?.map((project) =>
      defined({
        ...project,
        name: withoutMarks(project.name).trim(),
        role: plain(project.role),
        link: linkOrText(project.link),
      }),
    ),
    certifications: profile.certifications?.map((item) =>
      defined({
        ...item,
        name: withoutMarks(item.name).trim(),
        issuer: plain(item.issuer),
        date: plain(item.date),
        link: linkOrText(item.link),
      }),
    ),
    otherSections: profile.otherSections?.map((section) => ({
      ...section,
      title: withoutMarks(section.title).trim(),
    })),
  });
}
