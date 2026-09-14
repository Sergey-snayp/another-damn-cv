import { writeFileSync, copyFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ROOT } from '../config.js';
import { getLlm } from '../llm/index.js';
import { extractResume } from './extract.js';

const MASTER = join(ROOT, 'profile/master.yaml');

/** Filenames land in a YAML comment, so strip anything that could break out of one. */
const safeName = (s: string): string =>
  s.replace(/[\r\n]+/g, ' ').replace(/[^\w. ()+-]/g, '_').trim().slice(0, 120);

/**
 * Provenance lives in comments rather than a YAML key on purpose: `parse()` drops
 * comments, so the filename never reaches the tailorer's allowed vocabulary and
 * cannot be mistaken for profile content.
 */
const header = (filename: string, when: Date): string =>
  `# Single source of truth for resume generation.
# HARD RULE: the tailorer may reorder, select, and rephrase ONLY what appears here.
# It may never invent a company, date, title, technology, or metric.
#
# Source: ${safeName(filename)}
# Imported: ${when.toISOString()}
#
# Generated from an uploaded resume. Edit freely — this file wins over the upload.
`;

const SYSTEM = `You convert a resume into a structured YAML profile.

This is TRANSCRIPTION, not writing. The output is the single source of truth that a
downstream tailorer is forbidden to exceed, so anything you invent here becomes a lie
on a real job application.

RULES:
- Record ONLY what the resume states. Never add a technology, metric, date or employer.
- Never round up dates or seniority. If a date is absent, use null.
- Keep the candidate's own wording for achievements; do not embellish.
- If something is ambiguous, prefer the more conservative reading.
- Extract every technology mentioned — the tailorer can only use words that appear here,
  so an omission silently removes it from every future resume.`;

export interface IngestResult {
  yaml: string;
  backup: string | null;
  summary: {
    name: string; headline: string; roles: number; skills: number;
    chars: number; sourceFile: string;
  };
  /** Skills the previous profile had that this import does not. */
  lostSkills: string[];
}

const flatSkills = (doc: Record<string, unknown>): string[] =>
  Object.values((doc.skills ?? {}) as Record<string, unknown[]>)
    .flat().filter((v): v is string => typeof v === 'string');

/** Shape check: a malformed profile silently degrades every future resume. */
function validate(yamlText: string): Record<string, unknown> {
  let doc: unknown;
  try {
    doc = parse(yamlText);
  } catch (e) {
    throw new Error(`The model returned invalid YAML: ${(e as Error).message}`);
  }
  if (!doc || typeof doc !== 'object') throw new Error('Parsed profile is not a mapping.');
  const d = doc as Record<string, unknown>;
  for (const key of ['identity', 'summary', 'skills', 'experience']) {
    if (!(key in d)) throw new Error(`Profile is missing required section "${key}".`);
  }
  const id = d.identity as Record<string, unknown> | undefined;
  if (!id?.name) throw new Error('Could not find a name in that resume.');
  if (!Array.isArray(d.experience) || d.experience.length === 0) {
    throw new Error('Could not find any work experience in that resume.');
  }
  return d;
}

/**
 * Turn an uploaded resume into profile/master.yaml, keeping a timestamped backup
 * of whatever it replaces so a bad upload is never destructive.
 */
export async function ingestResume(buf: Buffer, filename: string): Promise<IngestResult> {
  const { text } = await extractResume(buf, filename);

  const prompt = `<resume>
${text.slice(0, 24000)}
</resume>

Convert this resume into YAML with EXACTLY these top-level keys:

identity:   { name, headline, email, location, github, linkedin, website }
summary:    a 3-5 sentence professional summary (use the resume's own, condensed if needed)
skills:     grouped mapping, e.g. languages / frontend_mobile / backend / data /
            cloud_devops / architecture / auth_testing_observability / ai — each a list.
            Use only groups that apply; put every technology somewhere.
experience: list of { company, title, start: YYYY-MM, end: YYYY-MM or null if current,
            location, context (optional one-line framing), highlights: [ ... ] }
projects:   list of { name, description, tech: [...] }   (omit the key if none)
education:  list of { school, degree, start: YYYY, end: YYYY }  (omit the key if none)
training:   list of strings                                     (omit the key if none)
languages:  list of { name, level }                             (omit the key if none)

Use unquoted strings where safe. Return ONLY the YAML — no markdown fences, no commentary.`;

  const raw = await getLlm().complete(prompt, { system: SYSTEM, maxTokens: 8000 });
  const yamlText = raw.replace(/^```(?:ya?ml)?\n?/i, '').replace(/```\s*$/, '').trim();

  const doc = validate(yamlText);

  const now = new Date();

  // Extraction is not deterministic: re-importing the same file can quietly drop
  // skills, and a skill absent here can never appear in any future CV.
  let previousSkills: string[] = [];
  if (existsSync(MASTER)) {
    try {
      previousSkills = flatSkills(parse(readFileSync(MASTER, 'utf8')) as Record<string, unknown>);
    } catch { previousSkills = []; }
  }

  let backup: string | null = null;
  if (existsSync(MASTER)) {
    backup = MASTER.replace(/\.yaml$/, `.${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.bak.yaml`);
    copyFileSync(MASTER, backup);
  }
  const body = `${header(filename, now)}${yamlText}\n`;
  writeFileSync(MASTER, body, 'utf8');

  const identity = doc.identity as Record<string, string>;
  const skills = doc.skills as Record<string, unknown[]>;
  const nowSet = new Set(flatSkills(doc).map((x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '')));
  const lostSkills = previousSkills.filter(
    (x) => !nowSet.has(x.toLowerCase().replace(/[^a-z0-9]+/g, '')));

  return {
    yaml: body,
    backup,
    lostSkills,
    summary: {
      name: identity.name ?? '?',
      headline: identity.headline ?? '',
      roles: (doc.experience as unknown[]).length,
      skills: Object.values(skills ?? {}).reduce((n, g) => n + (Array.isArray(g) ? g.length : 0), 0),
      chars: text.length,
      sourceFile: safeName(filename),
    },
  };
}

export interface MasterSummary {
  name: string; headline: string; roles: number; skills: number;
  updatedAt: string; backups: string[];
  /** null when the profile was hand-written rather than imported. */
  sourceFile: string | null;
  importedAt: string | null;
}

/** Describe the profile currently in force, for `/profile`. */
export function masterSummary(): MasterSummary {
  const raw = readFileSync(MASTER, 'utf8');
  const d = parse(raw) as Record<string, unknown>;
  const identity = (d.identity ?? {}) as Record<string, string>;
  const skills = (d.skills ?? {}) as Record<string, unknown[]>;
  const backups = readdirSync(join(ROOT, 'profile'))
    .filter((f) => f.endsWith('.bak.yaml')).sort().reverse();
  const imported = raw.match(/^# Imported:\s*(.+)$/m)?.[1]?.trim() ?? null;
  return {
    name: identity.name ?? '?',
    headline: identity.headline ?? '',
    roles: Array.isArray(d.experience) ? d.experience.length : 0,
    skills: Object.values(skills).reduce((n, g) => n + (Array.isArray(g) ? g.length : 0), 0),
    updatedAt: statSync(MASTER).mtime.toLocaleString('en-CA'),
    backups,
    sourceFile: raw.match(/^# Source:\s*(.+)$/m)?.[1]?.trim() ?? null,
    importedAt: imported ? new Date(imported).toLocaleString('en-CA') : null,
  };
}
