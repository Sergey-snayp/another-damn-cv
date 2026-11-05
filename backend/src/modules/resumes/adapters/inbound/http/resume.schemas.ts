/**
 * What the resume routes accept, parsed at the edge.
 *
 * Each entry schema lists every column its table has: zod drops anything it
 * does not know, and a column missing here would be reset to its default
 * whenever its row gets a new version. Bookkeeping columns the editor echoes
 * back (id, resumeId, snapshot numbers) are dropped on purpose.
 */
import { z } from 'zod';

const text = z.string();
const nullableText = z.string().nullish();
const position = z.number().int().min(0).optional();

/** Omit it to create an entry; supply it to edit one. An existing entry left out is deleted. */
const versioned = { lineageId: z.string().min(1).optional() };

export const contactInputSchema = z.object({
  ...versioned,
  firstName: text,
  lastName: text,
  email: text,
  headline: nullableText,
  phone: nullableText,
  location: nullableText,
  linkedin: nullableText,
  github: nullableText,
  website: nullableText,
});

export const experienceInputSchema = z.object({
  ...versioned,
  company: text,
  client: nullableText,
  title: text,
  location: nullableText,
  from: text,
  to: nullableText,
  current: z.boolean().optional(),
  blurb: nullableText,
  position,
});

export const achievementInputSchema = z.object({
  ...versioned,
  experienceLineageId: z.string().min(1),
  problem: nullableText,
  action: nullableText,
  result: nullableText,
  bullet: text,
  verified: z.boolean().optional(),
  evidence: nullableText,
  weight: z.number().int().min(1).max(5).optional(),
  authoredBy: z.string().optional(),
  position,
});

export const educationInputSchema = z.object({
  ...versioned,
  institution: text,
  fullName: nullableText,
  degree: text,
  field: nullableText,
  from: text,
  to: nullableText,
  position,
});

export const skillInputSchema = z.object({
  ...versioned,
  name: text,
  category: z.string().optional(),
  level: nullableText,
  years: z.number().int().min(0).nullish(),
  verified: z.boolean().optional(),
  evidence: nullableText,
  weight: z.number().int().min(1).max(5).optional(),
  aliases: z.array(z.string()).optional(),
  position,
});

export const summaryInputSchema = z.object({
  ...versioned,
  variant: z.string().min(1),
  text,
});

const bullets = z.array(z.string().max(2_000)).max(40).optional();

export const projectInputSchema = z.object({
  ...versioned,
  name: text,
  role: nullableText,
  link: nullableText,
  from: nullableText,
  to: nullableText,
  current: z.boolean().optional(),
  bullets,
  position,
});

export const certificationInputSchema = z.object({
  ...versioned,
  name: text,
  issuer: nullableText,
  date: nullableText,
  link: nullableText,
  position,
});

export const customSectionInputSchema = z.object({
  ...versioned,
  title: text,
  text: nullableText,
  bullets,
  position,
});

/** One save. Sections left out are untouched; a section sent is the whole section. */
export const resumeChangesSchema = z.object({
  contact: contactInputSchema.optional(),
  experiences: z.array(experienceInputSchema).optional(),
  achievements: z.array(achievementInputSchema).optional(),
  educations: z.array(educationInputSchema).optional(),
  skills: z.array(skillInputSchema).optional(),
  summaries: z.array(summaryInputSchema).optional(),
  projects: z.array(projectInputSchema).max(50).optional(),
  certifications: z.array(certificationInputSchema).max(50).optional(),
  customSections: z.array(customSectionInputSchema).max(20).optional(),
});
export type ResumeChanges = z.infer<typeof resumeChangesSchema>;

export const saveResumeSchema = resumeChangesSchema.extend({ message: z.string().max(500).optional() });
export type SaveResumeInput = z.infer<typeof saveResumeSchema>;

export const createResumeSchema = z.object({
  name: z.string('Give the resume a name.').trim().min(1, 'Give the resume a name.').max(200),
  targetRole: z
    .string()
    .trim()
    .max(200)
    .transform((role) => role || undefined)
    .optional(),
});
export type CreateResumeInput = z.infer<typeof createResumeSchema>;

export const rewriteSchema = z.object({
  text: z
    .string('There is nothing to rewrite yet.')
    .trim()
    .min(1, 'There is nothing to rewrite yet.')
    .max(5_000),
  instruction: z.string('Say what you want changed.').trim().min(1, 'Say what you want changed.').max(1_000),
  context: z.string().max(5_000).optional(),
  kind: z.enum(['bullet', 'summary', 'blurb']).optional(),
});
export type RewriteInput = z.infer<typeof rewriteSchema>;
