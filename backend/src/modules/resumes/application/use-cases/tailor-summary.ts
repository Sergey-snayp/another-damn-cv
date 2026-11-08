import {
  repairSummary,
  runSummaryChecks,
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
  /** The previous answer back, with the checks it failed, for a corrected one. */
  fix(input: SummaryInput & { previous: SummaryDraft; failed: CheckResult[] }): Promise<SummaryDraft>;
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
    try {
      current = checked(await writer.fix({ ...input, previous: current.draft, failed: current.failed }));
    } catch {
      // A fix that never came back as valid JSON ends the loop; the best so far stands.
      break;
    }
    if (current.failed.length <= best.failed.length) best = current;
  }
  return { ...best.draft, failedChecks: best.failed, attempts };
}
