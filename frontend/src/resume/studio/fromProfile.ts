import type { ContactFields } from '../../api';
import type { CareerData } from '../../profile/careerApi';
import { jobPlace } from '../../profile/workPlace';
import type { RenderedResume } from '../../resumeApi';

const newId = () => crypto.randomUUID();

/**
 * The CV filled from the app's Profile: contact details, and each career
 * section the Profile has. A section the Profile does not have is kept.
 */
export function resumeFromProfile(current: RenderedResume, profile: ContactFields, career: CareerData): RenderedResume {
  const next = structuredClone(current);
  next.contact = {
    ...(current.contact ?? {}),
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedin: profile.linkedin,
    github: profile.github,
    website: profile.website || profile.portfolio,
  };
  if (career.summary) next.summaries = { ...next.summaries, default: career.summary.value };
  if (career.experiences) {
    next.experiences = career.experiences.value.map((role, position) => {
      const lineageId = newId();
      return {
        lineageId,
        company: role.company,
        client: role.client || null,
        title: role.title,
        location: jobPlace(role) || null,
        from: role.from,
        to: role.current ? '' : role.to,
        current: role.current,
        blurb: role.description || null,
        techStack: role.techStack?.trim() || null,
        position,
        // Unticked on the Profile page: left out of CVs.
        achievements: role.bullets.filter((bullet) => bullet.trim() && !(role.excluded ?? []).includes(bullet)).map((bullet, order) => ({
          lineageId: newId(), experienceLineageId: lineageId, bullet, verified: false, position: order,
        })),
      };
    });
  }
  if (career.educations) {
    next.educations = career.educations.value.map((row, position) => ({
      lineageId: newId(), institution: row.institution, degree: row.degree, field: row.field, from: row.from, to: row.to, position,
    }));
  }
  if (career.skills) {
    next.skills = career.skills.value.filter((name) => name.trim()).map((name, position) => ({
      lineageId: newId(), name, category: '', position,
    }));
  }
  return next;
}
