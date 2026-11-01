import type { BulletSuggestion, RenderedResume, Tailoring } from '../resumeApi';

export type Accepted = Record<string, boolean>;

/** A bullet is worth a decision when its text changed or it is suggested for hiding. */
export function hasSuggestion(b: BulletSuggestion): boolean {
  return b.after !== b.before || !b.keep;
}

/**
 * The resume with the accepted suggestions applied.
 *
 * Positions are written explicitly: the rows carry their old position, and the
 * save would otherwise keep it.
 */
export function applyTailoring(
  resume: RenderedResume, t: Tailoring, accepted: Accepted, reorder: boolean,
): RenderedResume {
  const next: RenderedResume = structuredClone(resume);
  const byLineage = new Map(t.bullets.map((b) => [b.lineageId, b]));

  if (accepted.summary && t.summary.after !== t.summary.before) {
    next.summaries = { ...next.summaries, [t.summaryVariant]: t.summary.after };
  }

  for (const role of next.experiences) {
    const rows = role.achievements.map((a, index) => ({ a, s: byLineage.get(a.lineageId ?? ''), index }));
    const kept = rows.filter(({ s }) => !(s && accepted[s.lineageId] && !s.keep));
    if (reorder) kept.sort((x, y) => (x.s?.to ?? 1000 + x.index) - (y.s?.to ?? 1000 + y.index));

    role.achievements = kept.map(({ a, s }, position) => {
      const reworded = s && accepted[s.lineageId] && s.after !== s.before;
      return reworded
        ? { ...a, bullet: s.after, authoredBy: 'tailor', position } as typeof a
        : { ...a, position };
    });
  }

  if (reorder) {
    const rank = new Map(t.skills.map((lineage, index) => [lineage, index]));
    next.skills = [...next.skills].sort((x, y) =>
      (rank.get(x.lineageId ?? '') ?? Infinity) - (rank.get(y.lineageId ?? '') ?? Infinity));
  }
  next.skills = next.skills.map((skill, position) => ({ ...skill, position }));

  return next;
}
