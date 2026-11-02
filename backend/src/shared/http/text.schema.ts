import { z } from 'zod';

/**
 * Optional free text: trimmed, and blank means "no value" (null).
 *
 * Absent and null are kept apart on purpose: in an edit, an absent field is
 * left alone and null clears it.
 */
export function optionalText(maxLength: number, label: string) {
  return z
    .string(`${label} must be text.`)
    .trim()
    .max(maxLength, `${label} is too long.`)
    .transform((value) => value || null)
    .nullable()
    .optional();
}
