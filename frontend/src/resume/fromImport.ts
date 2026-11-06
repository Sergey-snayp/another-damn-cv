import type { RenderedResume } from '../resumeApi';

/** What POST /api/import/cv returns. */
export interface ImportProposal {
  id: string;
  charsRead: number;
  notFound: string[];
  proposed: {
    firstName?: string; lastName?: string; fullName?: string;
    headline?: string; openToRelocation?: boolean;
    email?: string; phone?: string; location?: string;
    linkedin?: string; github?: string; website?: string; portfolio?: string;
    summary?: string;
    skills?: string[];
    /** The CV's own skills section, grouped as written: "Languages: JavaScript, Node.js". */
    skillGroups?: { category: string; skills: string[] }[];
    experience?: {
      company: string; title: string; client?: string; location?: string;
      from: string; to?: string;
      current?: boolean; description?: string; bullets?: string[];
    }[];
    education?: {
      institution: string; degree: string; field?: string; from: string; to?: string;
    }[];
    projects?: { name: string; role?: string; link?: string; from?: string; to?: string; bullets?: string[] }[];
    certifications?: { name: string; issuer?: string; date?: string; link?: string }[];
    otherSections?: { title: string; text?: string; bullets?: string[] }[];
  };
}

const newId = () => crypto.randomUUID();

/**
 * Turns a parsed CV into an unsaved draft.
 *
 * lineageIds are generated here so the document can address entries before any
 * of them exist on the server. The first Save turns the whole draft into
 * version 1 — the resume's history starts with what the file actually said.
 */
export function draftFromImport(proposal: ImportProposal): RenderedResume {
  const p = proposal.proposed;

  const [derivedFirst = '', ...derivedRest] = (p.fullName ?? '').split(' ');

  return {
    snapshot: 0,
    contact: {
      firstName: p.firstName || derivedFirst,
      lastName: p.lastName || derivedRest.join(' '),
      headline: p.headline ?? '',
      openToRelocation: Boolean(p.openToRelocation),
      email: p.email ?? '',
      phone: p.phone ?? '',
      location: p.location ?? '',
      linkedin: p.linkedin ?? '',
      github: p.github ?? '',
      website: p.website || p.portfolio || '',
    },

    experiences: (p.experience ?? []).map((role, index) => {
      const lineageId = newId();

      return {
        lineageId,
        company: role.company,
        title: role.title,
        client: role.client || null,
        location: role.location || null,
        from: role.from,
        to: role.to ?? '',
        current: role.current ?? !role.to,
        blurb: role.description ?? '',
        position: index,
        // Each point stays its own achievement: they are edited, reworded and
        // evidenced separately, which is the whole reason they have a table.
        achievements: (role.bullets ?? []).map((bullet, order) => ({
          lineageId: newId(),
          experienceLineageId: lineageId,
          bullet,
          // Imported text is the candidate's claim, not evidence. Nothing from a
          // file is verified until a person says where the proof is.
          verified: false,
          position: order,
        })),
      };
    }),

    educations: (p.education ?? []).map((row, index) => ({
      lineageId: newId(),
      institution: row.institution,
      degree: row.degree,
      field: row.field ?? '',
      from: row.from,
      to: row.to ?? '',
      position: index,
    })),

    // The CV's own skills section, in its categories and order; without one,
    // every skill the CV names, in one list.
    skills: (p.skillGroups?.some((group) => group.skills?.length)
      ? p.skillGroups.flatMap((group) => (group.skills ?? []).map((name) => ({ name, category: (group.category ?? '').trim() })))
      : (p.skills ?? []).map((name) => ({ name, category: '' })))
      .filter((skill, index, all) => skill.name.trim() && all.findIndex((s) => s.name.toLowerCase() === skill.name.toLowerCase()) === index)
      .map((skill, position) => ({ lineageId: newId(), name: skill.name.trim(), category: skill.category, verified: false, position })),

    summaries: p.summary ? { default: p.summary } : {},

    projects: (p.projects ?? []).filter((project) => project.name?.trim()).map((project, position) => ({
      lineageId: newId(),
      name: project.name,
      role: project.role || null,
      link: project.link || null,
      from: project.from || null,
      to: project.to || null,
      current: !project.to && Boolean(project.from),
      bullets: project.bullets ?? [],
      position,
    })),
    certifications: (p.certifications ?? []).filter((item) => item.name?.trim()).map((item, position) => ({
      lineageId: newId(),
      name: item.name,
      issuer: item.issuer || null,
      date: item.date || null,
      link: item.link || null,
      position,
    })),
    customSections: (p.otherSections ?? [])
      .filter((section) => section.title?.trim() && (section.text?.trim() || section.bullets?.some((b) => b.trim())))
      .map((section, position) => ({
        lineageId: newId(),
        title: section.title,
        text: section.text || null,
        bullets: section.bullets ?? [],
        position,
      })),
  };
}

export async function importCv(file: File): Promise<ImportProposal> {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch('/api/import/cv', {
    method: 'POST', credentials: 'include', body,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message ?? `${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<ImportProposal>;
}
