import type {
  Achievement as ResumeAchievement,
  RenderedExperience as ResumeExperience,
  RenderedResume as ResumeDocument,
} from '../resume';

/** A small view of the canonical resume types for prompts and claim checks. */
export type Achievement = Pick<
  ResumeAchievement,
  'lineageId' | 'experienceLineageId' | 'bullet' | 'problem' | 'action' | 'result' | 'position'
>;
export type RenderedExperience = Pick<
  ResumeExperience,
  'lineageId' | 'company' | 'client' | 'title' | 'location' | 'from' | 'to' | 'blurb'
> & { techStack?: string | null; achievements: Achievement[] };
export type RenderedResume = Pick<ResumeDocument, 'snapshot' | 'summaries'> & {
  contact: Pick<NonNullable<ResumeDocument['contact']>, 'firstName' | 'lastName' | 'location'> | null;
  experiences: RenderedExperience[];
  skills: Array<Pick<ResumeDocument['skills'][number], 'lineageId' | 'name' | 'aliases'>>;
  educations: Array<
    Pick<
      ResumeDocument['educations'][number],
      'institution' | 'fullName' | 'degree' | 'field' | 'from' | 'to'
    >
  >;
};
