import type { Achievement, RenderedResume } from './resume';
export function summaryVariantOf(resume: RenderedResume): string {
  return 'default' in resume.summaries ? 'default' : (Object.keys(resume.summaries)[0] ?? 'default');
}
export function byPosition(achievements: Achievement[]): Achievement[] {
  return [...achievements].sort((a, b) => a.position - b.position);
}
