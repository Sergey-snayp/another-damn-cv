import type { AchievementWriter } from '../ports/achievement-writer';
import {
  casedAs,
  checkProposal,
  tooLong,
  toolsToCover,
  uncoveredTools,
  type AchievementDraft,
  type AchievementProposal,
  type AchievementSource,
} from '../../domain/achievements';
import { SplitAchievement } from './split-achievement';

/**
 * "Turn into bullets" on a Profile job: the AI's proposal, checked. Nothing is
 * saved here; the person keeps, edits or drops each line, then Profile saves.
 * A line longer than the standard size comes back as 2 to 4 that fit it, and
 * every technology of the job ends up in some line, or is named as not placed.
 */
export class DraftAchievements {
  private readonly splitter: SplitAchievement;
  constructor(private readonly writer: AchievementWriter) {
    this.splitter = new SplitAchievement(writer);
  }

  async execute(source: AchievementSource): Promise<AchievementProposal> {
    const draft = await this.writer.draft(source);
    const proposal = await this.checked(source, draft);
    const tools = toolsToCover(source, [...(draft.technologies ?? []), ...draft.techStack]);
    const lines = () => [
      ...source.bullets,
      ...proposal.achievements.filter((item) => !item.duplicateOf).map((item) => item.text),
    ];
    const missing = uncoveredTools(tools, lines());
    if (missing.length) {
      try {
        const cover = await this.writer.cover({
          source,
          missing,
          written: proposal.achievements.map((item) => item.text),
        });
        for (const item of cover.achievements) {
          const parts = (
            await this.checked(source, {
              achievements: [{ text: item.text, asks: [] }],
              techStack: [],
              description: '',
            })
          ).achievements;
          if (!parts.length) continue;
          // A fuller version takes its line's place and keeps its questions; a new one is added.
          const at = proposal.achievements.findIndex((kept) => kept.text === item.replaces);
          if (at >= 0) {
            parts[0] = { ...parts[0], asks: proposal.achievements[at].asks };
            proposal.achievements.splice(at, 1, ...parts);
          } else {
            const fresh = parts.filter(
              (part) => !proposal.achievements.some((kept) => kept.text === part.text),
            );
            proposal.achievements.push(...fresh);
          }
        }
      } catch {
        // Placing the rest is a second pass: without it, the first proposal still stands.
      }
    }
    const written = lines();
    return {
      ...proposal,
      techStack: [...new Set(proposal.techStack.map((tool) => casedAs(tool, written)))],
      uncovered: uncoveredTools(tools, written),
    };
  }

  /** Long lines split, then every line checked against the person's facts. */
  private async checked(source: AchievementSource, draft: AchievementDraft): Promise<AchievementProposal> {
    const achievements = await Promise.all(
      draft.achievements.map(async (item) => {
        if (!tooLong(item.text)) return [item];
        const { parts } = await this.splitter.execute({ source, text: item.text });
        // Its questions stay with the first part, which names the work.
        return parts.map((text, index) => ({ text, asks: index === 0 ? item.asks : [] }));
      }),
    );
    return checkProposal({ ...draft, achievements: achievements.flat() }, source);
  }
}
