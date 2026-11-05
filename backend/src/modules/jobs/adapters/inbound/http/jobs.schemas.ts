/**
 * What the jobs routes accept. Every body is parsed here, at the edge, so the
 * services work with clean, typed values only.
 */
import { JOB_STATUSES } from '../../../domain/job';
import { z } from 'zod';
import { optionalText } from '../../../../../shared/http/text.schema';
import { CAPTURE_LIMITS } from '../../../domain/capture-limits';
import { SALARY_PERIODS } from '../../../domain/job';

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
  /** The company's logo the extension found on the page: a web address only. */
  companyLogo: z
    .string()
    .max(2_000)
    .refine((value) => /^https?:\/\//i.test(value), 'The logo must be a web address.')
    .optional(),
  /**
   * The extension's job form: what the person checked or typed before saving.
   * Every value given counts as edited, so a later page read keeps it.
   */
  details: z
    .object({
      title: z.string().trim().min(1, 'Please enter a position title.').max(500),
      company: z.string().trim().min(1, 'Please enter a company.').max(300),
      location: z.string().trim().min(1, 'Please enter a location.').max(300),
      salaryMin: z.number().int().min(0).max(100_000_000).nullable().optional(),
      salaryMax: z.number().int().min(0).max(100_000_000).nullable().optional(),
      salaryCurrency: z.string().trim().max(10).nullable().optional(),
      salaryPeriod: z.enum(SALARY_PERIODS).nullable().optional(),
      employmentType: z.string().trim().max(100).nullable().optional(),
      description: z.string().max(CAPTURE_LIMITS.text).nullable().optional(),
      notes: z.string().max(10_000).nullable().optional(),
      status: z.enum(['saved', 'applied']).optional(),
      url: z
        .string()
        .max(4_000)
        .refine((value) => /^https?:\/\//i.test(value), 'The job link must be a web address.')
        .optional(),
    })
    .strict()
    .optional(),
  /** Title, company and location seen on the page, or typed in the extension's form (confirmed). */
  hints: z
    .object({
      title: z.string().max(500).optional(),
      company: z.string().max(300).optional(),
      location: z.string().max(300).optional(),
      confirmed: z.boolean().optional(),
    })
    .strict()
    .optional(),
});
export type CaptureInput = z.infer<typeof captureSchema>;

/** What the extension used on a saved job's form: the CV it uploaded and the answers. */
export const recordApplicationSchema = z
  .object({
    resumeId: z.string().min(1).max(100).optional(),
    answers: z
      .array(z.object({ question: z.string().max(500), answer: z.string().max(5_000) }).strict())
      .max(200)
      .optional(),
  })
  .strict();
export type RecordApplicationInput = z.infer<typeof recordApplicationSchema>;

/** The extension's check: is this page's job already saved? */
export const lookupQuerySchema = z.object({ url: z.string().min(1).max(4_000) });

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
  notes: optionalText(10_000, 'Notes'),
  remote: z.boolean('remote must be true, false or null.').nullable().optional(),
  status: status.optional(),
  interview: z
    .object({
      date: z.string().max(10),
      time: z.string().max(5).nullable().default(null),
      timeZone: z.string().trim().min(1).max(100),
    })
    .strict()
    .nullable()
    .optional(),
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
