import type { RenderedResume } from './resume';
import { resumeText, roleText, techTerms, unsupportedClaims } from './claims';
import { sameWords } from './text';
import type { JobForTailoring, Tailoring } from './types';
import type { RetryCandidate } from './candidate';

export interface BlockedLine {
  id: string;
  original: string;
  rejected: string;
  problems: string[];
}

const SUMMARY_ID = 'summary';
const bulletId = (index: number) => `l${index}`;

/** The lines whose rewrite was thrown away. Bullets suggested for hiding are not retried. */
export function blockedLines(tailoring: Pick<Tailoring, 'summary' | 'bullets'>): BlockedLine[] {
  const lines: BlockedLine[] = [];
  const { summary } = tailoring;
  if (summary.rejected) {
    lines.push({
      id: SUMMARY_ID,
      original: summary.before,
      rejected: summary.rejected,
      problems: summary.problems ?? [],
    });
  }
  tailoring.bullets.forEach((bullet, index) => {
    if (bullet.rejected && bullet.keep) {
      lines.push({
        id: bulletId(index),
        original: bullet.before,
        rejected: bullet.rejected,
        problems: bullet.problems ?? [],
      });
    }
  });
  return lines;
}

/** The tailoring with every line the second try fixed. The input is not changed. */
export function applyRetry(
  lines: RetryCandidate[],
  tailoring: Tailoring,
  resume: RenderedResume,
  job: JobForTailoring,
): Tailoring {
  const texts = new Map(lines.filter((line) => line.text).map((line) => [line.id, line.text]));
  const jobTerms = techTerms(job.description);
  const next = structuredClone(tailoring);

  const summaryText = texts.get(SUMMARY_ID);
  if (
    summaryText &&
    next.summary.rejected &&
    passes(summaryText, next.summary.before, resumeText(resume), jobTerms)
  ) {
    next.summary = {
      before: next.summary.before,
      after: summaryText,
      blocked: null,
      rejected: null,
      problems: [],
    };
  }

  const roles = new Map(resume.experiences.map((role) => [role.lineageId, role]));
  next.bullets.forEach((bullet, index) => {
    const text = texts.get(bulletId(index));
    const role = roles.get(bullet.experienceLineageId);
    if (text && bullet.rejected && role && passes(text, bullet.before, roleText(role), jobTerms)) {
      Object.assign(bullet, { after: text, blocked: null, rejected: null, problems: [] });
    }
  });

  return next;
}

function passes(text: string, before: string, source: string, jobTerms: ReadonlySet<string>): boolean {
  return unsupportedClaims(text, source, jobTerms).length === 0 && !sameWords(text, before);
}
