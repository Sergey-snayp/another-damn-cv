import { z } from 'zod';
import { IMPORT_CONTACT_KEYS } from '../domain/career-profile';
const text = z.string().trim().max(2000);
const date = z.string().trim().max(80);
export const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('profile') }).strict(),
  z.object({ kind: z.literal('file'), name: z.string().trim().min(1).max(250) }).strict(),
  z
    .object({
      kind: z.literal('resume'),
      id: z.string().min(1).max(100),
      snapshot: z.number().int().positive(),
    })
    .strict(),
]);
const sectionsSchema = z
  .object({
    summary: z.string().trim().max(10000).optional(),
    experiences: z
      .array(
        z
          .object({
            company: text.min(1),
            title: text.min(1),
            client: text,
            location: text,
            from: date,
            to: date,
            current: z.boolean(),
            description: z.string().max(12000),
            bullets: z.array(z.string().trim().min(1).max(4000)).max(100),
            techStack: z.string().trim().max(2000).optional(),
            notes: z
              .array(z.object({ text: z.string().trim().min(1).max(20000), at: z.string().max(40) }).strict())
              .max(50)
              .optional(),
            starred: z.array(z.string().max(4000)).max(100).optional(),
            removed: z
              .array(z.object({ text: z.string().trim().min(1).max(4000), at: z.string().max(40) }).strict())
              .max(50)
              .optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    educations: z
      .array(z.object({ institution: text.min(1), degree: text, field: text, from: date, to: date }).strict())
      .max(50)
      .optional(),
    skills: z.array(z.string().trim().min(1).max(200)).max(400).optional(),
  })
  .strict();
const contactSchema = z
  .object(
    Object.fromEntries(IMPORT_CONTACT_KEYS.map((key) => [key, text.optional()])) as Record<
      (typeof IMPORT_CONTACT_KEYS)[number],
      z.ZodOptional<z.ZodString>
    >,
  )
  .strict();
const expectedContactSchema = z
  .object(
    Object.fromEntries(IMPORT_CONTACT_KEYS.map((key) => [key, z.string().max(2000).optional()])) as Record<
      (typeof IMPORT_CONTACT_KEYS)[number],
      z.ZodOptional<z.ZodString>
    >,
  )
  .strict();
export const careerImportSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    contact: contactSchema,
    expectedContact: expectedContactSchema,
    sections: sectionsSchema,
    source: sourceSchema,
  })
  .strict()
  .refine((input) => JSON.stringify(input).length <= 250000, 'Choose fewer entries for one import.');
export const careerUpdateSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    sections: sectionsSchema.refine(
      (sections) => Object.keys(sections).length > 0,
      'Choose a section to save.',
    ),
  })
  .strict()
  .refine((input) => JSON.stringify(input).length <= 250000, 'Save fewer entries at once.');
export const careerDataSchema = z
  .object({
    summary: z.object({ value: z.string(), source: sourceSchema, importedAt: z.string() }).optional(),
    experiences: z
      .object({
        value: sectionsSchema.shape.experiences.unwrap(),
        source: sourceSchema,
        importedAt: z.string(),
      })
      .optional(),
    educations: z
      .object({
        value: sectionsSchema.shape.educations.unwrap(),
        source: sourceSchema,
        importedAt: z.string(),
      })
      .optional(),
    skills: z
      .object({ value: sectionsSchema.shape.skills.unwrap(), source: sourceSchema, importedAt: z.string() })
      .optional(),
  })
  .strict();

/** "Turn into bullets" on one Profile job: the job as saved and the notes to write from. */
export const achievementDraftSchema = z
  .object({
    title: text,
    company: text,
    client: text.default(''),
    description: z.string().max(12000).default(''),
    bullets: z.array(z.string().max(4000)).max(100).default([]),
    techStack: z.string().max(2000).default(''),
    notes: z.string().trim().min(1, 'Write a few words about the job first.').max(60000),
  })
  .strict();
