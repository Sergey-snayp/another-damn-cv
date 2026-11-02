import { z } from 'zod';
import { JOB_STATUSES } from '../../../domain/job';

const optionalText = z.string().trim().max(2_000).nullable().optional();
const date = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
export const applicationSchema = z.object({
  title: z.string().trim().min(1, 'Position title is required.').max(2_000),
  company: z.string().trim().min(1, 'Company is required.').max(2_000),
  location: optionalText,
  employmentType: optionalText,
  status: z.enum(JOB_STATUSES).optional(),
  resumeId: z.string().trim().min(1).max(200).optional(),
  resumeSnapshot: z.number().int().positive().optional(),
  url: optionalText,
  salary: optionalText,
  description: z.string().trim().max(120_000).nullable().optional(),
  addedAt: date.optional(),
  appliedAt: date.optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export const applicationImportSchema = z.object({ rows: z.array(applicationSchema).min(1).max(500) });
export const applicationPreferencesSchema = z
  .object({
    ids: z.array(z.string().min(1).max(200)).min(1).max(1000),
    favorite: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (input) => input.favorite !== undefined || input.archived !== undefined,
    'Choose a favorite or archive change.',
  );
export type ApplicationBody = z.infer<typeof applicationSchema>;
export type ApplicationImportBody = z.infer<typeof applicationImportSchema>;
export type ApplicationPreferencesBody = z.infer<typeof applicationPreferencesSchema>;
export const applicationResumeSchema = z.object({ resumeId: z.string().min(1).max(200).nullable() });
export type ApplicationResumeBody = z.infer<typeof applicationResumeSchema>;
