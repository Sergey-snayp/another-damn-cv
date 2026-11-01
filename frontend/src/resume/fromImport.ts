import type { RenderedResume } from '../resumeApi';

/** What POST /api/import/cv returns. */
export interface ImportProposal {
  id: string;
  charsRead: number;
  notFound: string[];
  proposed: {
    firstName?: string; lastName?: string; fullName?: string;
    email?: string; phone?: string; location?: string;
    linkedin?: string; github?: string; website?: string;
    summary?: string;
    skills?: string[];
    experience?: {
      company: string; title: string; from: string; to?: string;
      current?: boolean; description?: string; bullets?: string[];
    }[];
    education?: {
      institution: string; degree: string; field?: string; from: string; to?: string;
    }[];
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
      email: p.email ?? '',
      phone: p.phone ?? '',
      location: p.location ?? '',
      linkedin: p.linkedin ?? '',
      github: p.github ?? '',
      website: p.website ?? '',
    },

    experiences: (p.experience ?? []).map((role, index) => {
      const lineageId = newId();

      return {
        lineageId,
        company: role.company,
        title: role.title,
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

    skills: (p.skills ?? []).map((name) => ({
      lineageId: newId(),
      name,
      category: '',
      verified: false,
    })),

    summaries: p.summary ? { default: p.summary } : {},
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
