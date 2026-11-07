import type { AssessmentCareer } from '../../domain/job-assessment';

export interface AssessmentProfileReader {
  read(userId: string): Promise<{ revision: number; career: AssessmentCareer }>;
}
