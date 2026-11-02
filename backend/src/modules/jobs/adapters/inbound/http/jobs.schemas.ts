/**
 * What the jobs routes accept. Every body is parsed here, at the edge, so the
 * services work with clean, typed values only.
 */
import { JOB_STATUSES } from '../../../domain/job';
import { z } from 'zod';
import { optionalText } from '../../../../../shared/http/text.schema';
import { CAPTURE_LIMITS } from '../../../domain/capture-limits';

/** Statuses as the API spells them: lowercase. */
export const STATUS_NAMES = JOB_STATUSES;
export type StatusName = (typeof STATUS_NAMES)[number];

const status = z.enum(STATUS_NAMES, `status must be one of: ${STATUS_NAMES.join(', ')}.`);

const FIELD_MAX = 2_000;

/** The extension's "Send this job to the app". */
export const captureSchema = z.object({
  url: z.string('The page address is missing.').min(1, 'The page address is missing.'),
  pageTitle: z
    .string()
    .transform((title) => title.slice(0, 500))
    .optional(),
  html: z.string().max(CAPTURE_LIMITS.html, 'That page is too large to save.').optional(),
  text: z.string().max(CAPTURE_LIMITS.text, 'That page has too much text to save.').optional(),
  jsonLd: z
    .array(z.unknown())
    .refine(
      (blocks) => JSON.stringify(blocks).length <= CAPTURE_LIMITS.jsonLd,
      'That page carries too much structured data to save.',
    )
    .optional(),
});
export type CaptureInput = z.infer<typeof captureSchema>;

/** A posting pasted into the web app. */
export const manualJobSchema = z.object({
  description: z
    .string('Paste the job description.')
    .trim()
    .min(1, 'Paste the job description.')
    .max(CAPTURE_LIMITS.text, 'That description is too long.'),
  title: optionalText(FIELD_MAX, 'Title'),
  company: optionalText(FIELD_MAX, 'Company'),
  location: optionalText(FIELD_MAX, 'Location'),
  url: optionalText(FIELD_MAX, 'Link'),
});
export type ManualJobInput = z.infer<typeof manualJobSchema>;

/** An edit from the job page or a move on the board. Absent fields are left alone. */
export const jobEditSchema = z.object({
  title: optionalText(FIELD_MAX, 'Title'),
  company: optionalText(FIELD_MAX, 'Company'),
  location: optionalText(FIELD_MAX, 'Location'),
  employmentType: optionalText(FIELD_MAX, 'Employment type'),
  salary: optionalText(FIELD_MAX, 'Salary'),
  description: optionalText(CAPTURE_LIMITS.text, 'Description'),
  remote: z.boolean('remote must be true, false or null.').nullable().optional(),
  status: status.optional(),
});
export type JobEditInput = z.infer<typeof jobEditSchema>;

export const undoStatusSchema = z.object({
  eventId: z.string('Say which move to undo.').min(1, 'Say which move to undo.'),
});
export type UndoStatusInput = z.infer<typeof undoStatusSchema>;

export const tailorSchema = z.object({
  sourceResumeId: z.string().min(1).optional(),
});
export type TailorInput = z.infer<typeof tailorSchema>;

export const listQuerySchema = z.object({ status: status.optional() });
export type ListQuery = z.infer<typeof listQuerySchema>;
