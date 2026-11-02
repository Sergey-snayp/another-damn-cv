import { z } from 'zod';

const short = z.string().trim().min(1).max(500);
export const practiceContentSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            question: short,
            why: short,
            answerKind: z.enum(['personal', 'conceptual']),
            answer: z.string().trim().min(1).max(2200),
            talkingPoints: z.array(short).min(1).max(4),
            followUps: z.array(short).max(2),
            evidenceIds: z.array(z.string().min(1).max(100)).max(12),
            needsInput: z.array(short).max(4),
          })
          .strict(),
      )
      .length(6),
  })
  .strict();
