import type { RenderedExperience, RenderedResume } from './resume';
import { resumeText, roleText, techTerms, unsupportedClaims } from './claims';
import { byPosition, summaryVariantOf } from './ordering';
import { blockedNote, sameWords } from './text';
import type { BulletSuggestion, JobForTailoring, SummarySuggestion, TailoringDraft } from './types';
import type { CandidateBullet, CandidateRole, TailoringCandidate } from './candidate';

export function planTailoring(
  candidate: TailoringCandidate,
  resume: RenderedResume,
  job: JobForTailoring,
): TailoringDraft {
  const jobTerms = techTerms(job.description);
  const variant = summaryVariantOf(resume);
  const answeredByRole = groupByRole(candidate.roles);
  return {
    basedOnSnapshot: resume.snapshot,
    summaryVariant: variant,
    summary: checkSummary(resume.summaries[variant] ?? '', candidate.summary, resume, jobTerms),
    bullets: resume.experiences.flatMap((role) =>
      suggestForRole(role, answeredByRole.get(role.lineageId) ?? [], jobTerms),
    ),
    skills: rankSkills(resume, candidate.skills),
    cannotClaim: candidate.cannotClaim,
  };
}

/** The summary may draw on the whole resume. */
function checkSummary(
  before: string,
  wanted: string,
  resume: RenderedResume,
  jobTerms: ReadonlySet<string>,
): SummarySuggestion {
  const problems = wanted ? unsupportedClaims(wanted, resumeText(resume), jobTerms) : [];
  const accepted = wanted && problems.length === 0 && !sameWords(wanted, before);
  return {
    before,
    after: accepted ? wanted : before,
    blocked: problems.length ? blockedNote(problems, 'the resume') : null,
    rejected: problems.length ? wanted : null,
    problems,
  };
}

function groupByRole(roles: CandidateRole[]) {
  const byRole = new Map<string, CandidateBullet[]>();
  for (const role of roles) {
    const lineage = role.lineageId;
    if (lineage) byRole.set(lineage, [...(byRole.get(lineage) ?? []), ...role.bullets]);
  }
  return byRole;
}

/**
 * One role's bullets in the suggested order. A bullet may use only facts from
 * its own role; one the model answered under another role stays where it was.
 */
function suggestForRole(
  role: RenderedExperience,
  answered: CandidateBullet[],
  jobTerms: ReadonlySet<string>,
): BulletSuggestion[] {
  const originals = byPosition(role.achievements);
  const indexOf = new Map(originals.map((achievement, index) => [achievement.lineageId, index]));
  const source = roleText(role);
  const suggestions: BulletSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of answered) {
    const ref = item;
    if (!ref || ref.experienceLineageId !== role.lineageId || seen.has(ref.lineageId)) continue;
    const from = indexOf.get(ref.lineageId);
    if (from === undefined) continue;
    seen.add(ref.lineageId);

    const before = originals[from].bullet;
    const problems = item.text ? unsupportedClaims(item.text, source, jobTerms) : [];
    suggestions.push({
      lineageId: ref.lineageId,
      experienceLineageId: role.lineageId,
      before,
      after: item.text && problems.length === 0 && !sameWords(item.text, before) ? item.text : before,
      keep: item.keep,
      reason: item.keep ? null : (item.reason ?? 'Less relevant to this job.'),
      blocked: problems.length ? blockedNote(problems, 'this role') : null,
      rejected: problems.length ? item.text : null,
      problems,
      from,
      to: 0,
    });
  }

  originals.forEach((achievement, from) => {
    if (seen.has(achievement.lineageId)) return;
    suggestions.push(unchanged(achievement.lineageId, role.lineageId, achievement.bullet, from));
  });

  // Never leave a role with nothing under it.
  if (suggestions.length > 0 && suggestions.every((s) => !s.keep)) {
    suggestions[0].keep = true;
    suggestions[0].reason = null;
  }

  return suggestions.map((suggestion, to) => ({ ...suggestion, to }));
}

function unchanged(lineageId: string, roleLineageId: string, bullet: string, from: number): BulletSuggestion {
  return {
    lineageId,
    experienceLineageId: roleLineageId,
    before: bullet,
    after: bullet,
    keep: true,
    reason: null,
    blocked: null,
    from,
    to: 0,
  };
}

/** The chosen skills first, the rest in their old order. */
function rankSkills(resume: RenderedResume, chosenIds: string[]): string[] {
  const chosen = [...new Set(chosenIds)];
  const rest = resume.skills.map((skill) => skill.lineageId).filter((lineage) => !chosen.includes(lineage));
  return [...chosen, ...rest];
}
