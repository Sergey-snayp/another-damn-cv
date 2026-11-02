import { z } from 'zod';
import { firstJsonObject } from '../../../../../shared/ai/json';
import { tidyLine } from '../../../domain/text';
import type { TailoringCandidate, RetryCandidate } from '../../../domain/candidate';
import type { PromptIds } from './prompt-ids';
const answerBulletSchema = z.object({
  id: z.coerce.string(),
  text: z.string().transform(tidyLine).catch(''),
  keep: z.unknown().transform((keep) => keep !== false),
  reason: z
    .string()
    .transform((reason) => reason.trim() || null)
    .catch(null),
});
const answerSchema = z.object({
  summary: z.string().transform(tidyLine).catch(''),
  roles: z
    .array(
      z
        .object({ id: z.coerce.string(), bullets: z.array(answerBulletSchema).catch([]) })
        .catch({ id: '', bullets: [] }),
    )
    .catch([]),
  skills: z.array(z.coerce.string()).catch([]),
  cannotClaim: z
    .array(z.unknown())
    .transform((items) =>
      items
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 20),
    )
    .catch([]),
});
export function readCandidate(answer: string, ids: PromptIds): TailoringCandidate | null {
  const json = firstJsonObject(answer);
  if (!json || typeof json !== 'object') return null;
  const parsed = answerSchema.parse(json);
  return {
    summary: parsed.summary,
    cannotClaim: parsed.cannotClaim,
    roles: parsed.roles.flatMap((role) => {
      const lineageId = ids.roles.get(role.id);
      return lineageId
        ? [
            {
              lineageId,
              bullets: role.bullets.flatMap((bullet) => {
                const ref = ids.bullets.get(bullet.id);
                return ref ? [{ ...ref, text: bullet.text, keep: bullet.keep, reason: bullet.reason }] : [];
              }),
            },
          ]
        : [];
    }),
    skills: parsed.skills.flatMap((id) => {
      const lineageId = ids.skills.get(id);
      return lineageId ? [lineageId] : [];
    }),
  };
}
const retryAnswerSchema = z.object({
  lines: z
    .array(
      z.object({ id: z.coerce.string(), text: z.string().transform(tidyLine) }).catch({ id: '', text: '' }),
    )
    .catch([]),
});
export function readRetry(answer: string): RetryCandidate[] {
  return retryAnswerSchema.parse(firstJsonObject(answer) ?? {}).lines;
}
