import {
  keepsOtherSentences,
  repairSummary,
  runSummaryChecks,
  sentencesToFix,
  wordsOf,
  type CheckResult,
  type ExperienceRecord,
} from '../../domain/summary-checks';

/** One line of the writer's mapping: a posting item and the summary's answer to it. */
export interface SummaryMapping {
  item: string;
  type: 'required' | 'preferred';
  /** The clause in the summary, or "NO EVIDENCE". */
  evidence: string;
  employer: string | null;
}

/** What the writer returns: its JSON, already validated. */
export interface SummaryDraft {
  summary: string;
  wordCount: number;
  mapping: SummaryMapping[];
  gaps: string[];
  decidingGap: string | null;
}

export interface SummaryInput {
  job: string;
  experience: string;
  /** What the person typed in the card, such as "stress payments". */
  request?: string;
}

/** Writes a summary from the instructions; throws when it cannot return valid JSON. */
export interface SummaryWriter {
  write(input: SummaryInput): Promise<SummaryDraft>;
  /**
   * The previous answer back, with the checks it failed, for a corrected summary.
   * `change`: the sentences to rewrite (0-based), the rest copied as they are;
   * null when any may change. `quick`: a fast, smaller model does the fix.
   * The mapping and gaps of the previous answer are kept.
   */
  fix(input: SummaryFixInput): Promise<SummaryDraft>;
}

export interface SummaryFixInput extends SummaryInput {
  previous: SummaryDraft;
  failed: CheckResult[];
  change: number[] | null;
  quick: boolean;
}

export interface CheckedSummary extends SummaryDraft {
  /** Empty when every check passed. */
  failedChecks: CheckResult[];
  attempts: number;
}

/** First answer plus at most 2 fixes. */
export const MAX_SUMMARY_ATTEMPTS = 3;

/**
 * Write, check in code, and send failures back for a fix, at most 3 times.
 * Fixes go to the quick model first; the last try goes to the main one. A fix
 * that rewrites sentences it was told to keep is thrown away.
 * Returns the version that failed the fewest checks, with its failures listed.
 */
export async function writeCheckedSummary(
  writer: SummaryWriter,
  input: SummaryInput,
  record: ExperienceRecord,
): Promise<CheckedSummary> {
  const checked = (raw: SummaryDraft) => {
    // Mechanical slips are put right in code first; only what needs rewording goes back to the AI.
    const draft = { ...raw, summary: repairSummary(raw.summary, record) };
    return {
      // The count is the code's, not the model's.
      draft: { ...draft, wordCount: wordsOf(draft.summary).length },
      failed: runSummaryChecks(draft.summary, record).filter((check) => !check.ok),
    };
  };
  let current = checked(await writer.write(input));
  let best = current;
  let attempts = 1;
  while (current.failed.length && attempts < MAX_SUMMARY_ATTEMPTS) {
    attempts++;
    const quick = attempts < MAX_SUMMARY_ATTEMPTS;
    const change = sentencesToFix(current.draft.summary, current.failed, record);
    let next: typeof current;
    try {
      next = checked(
        await writer.fix({ ...input, previous: current.draft, failed: current.failed, change, quick }),
      );
    } catch {
      // A quick fix that never came back as valid JSON leaves the last try to the main model;
      // after that the best so far stands.
      if (quick) continue;
      break;
    }
    // Sentences that passed were to be copied: a fix that rewrote them may have added claims.
    if (change && !keepsOtherSentences(current.draft.summary, next.draft.summary, change)) continue;
    current = next;
    if (current.failed.length <= best.failed.length) best = current;
  }
  return { ...best.draft, failedChecks: best.failed, attempts };
}
