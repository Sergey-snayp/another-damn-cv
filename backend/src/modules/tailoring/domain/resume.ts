/** Only the resume facts this feature needs; storage/version rows stay in resumes. */
export interface Achievement {
  lineageId: string;
  experienceLineageId: string;
  bullet: string;
  problem: string | null;
  action: string | null;
  result: string | null;
  position: number;
}
export interface RenderedExperience {
  lineageId: string;
  company: string;
  client: string | null;
  title: string;
  location: string | null;
  from: string;
  to: string | null;
  blurb: string | null;
  achievements: Achievement[];
}
export interface RenderedResume {
  snapshot: number;
  contact: { firstName: string; lastName: string; location: string | null } | null;
  experiences: RenderedExperience[];
  skills: Array<{ lineageId: string; name: string; aliases: string[] }>;
  educations: Array<{
    institution: string;
    fullName: string | null;
    degree: string;
    field: string | null;
    from: string;
    to: string | null;
  }>;
  summaries: Record<string, string>;
}
