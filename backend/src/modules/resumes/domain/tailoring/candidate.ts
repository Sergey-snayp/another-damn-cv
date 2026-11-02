export interface CandidateBullet {
  lineageId: string;
  experienceLineageId: string;
  text: string;
  keep: boolean;
  reason: string | null;
}
export interface CandidateRole {
  lineageId: string;
  bullets: CandidateBullet[];
}
export interface TailoringCandidate {
  summary: string;
  roles: CandidateRole[];
  skills: string[];
  cannotClaim: string[];
}
export interface RetryCandidate {
  id: string;
  text: string;
}
