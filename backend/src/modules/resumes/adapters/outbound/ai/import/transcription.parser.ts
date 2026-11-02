import { CvImportError } from '../../../../application/cv-import-error';
import type { ImportedProfile } from '../../../../domain/import-proposal';

/** Retain the legacy parser and its three distinct user-facing errors. */
export function parseTranscription(text: string): ImportedProfile {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = body.indexOf('{');
  if (start === -1) throw new CvImportError('Could not read that CV — no structured data came back.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const char = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, i + 1)) as ImportedProfile;
      } catch {
        throw new CvImportError('Could not read that CV — the parsed data was malformed.');
      }
    }
  }
  throw new CvImportError('Could not read that CV — the parsed data was incomplete.');
}
