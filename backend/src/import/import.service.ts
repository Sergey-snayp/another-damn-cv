import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ExtractService } from './extract.service';
import { LlmService } from '../llm/llm.service';

const SYSTEM = `You convert a CV into structured fields.

This is TRANSCRIPTION, not writing. Whatever you produce will be shown to the
person whose CV it is, and anything you invent becomes a lie on a real job
application.

RULES
- Record only what the CV states. Never add an employer, date, degree or metric.
- Never round up dates or seniority. Leave a field empty rather than guessing.
- Keep the candidate's own wording for descriptions; do not embellish.
- If something is ambiguous, prefer the more conservative reading.`;

/** What the import found, before anything is saved. */
/** One role as the CV stated it, with its points kept separate. */
export interface ImportedExperience {
  company: string;
  title: string;
  from: string;
  to?: string;
  current?: boolean;
  description?: string;
  bullets?: string[];
}

/** Everything a CV can yield. Flat fields plus the structure of a career. */
export interface ImportedProfile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
  currentCompany?: string;
  currentTitle?: string;
  yearsExperience?: string;
  summary?: string;
  skills?: string[];
  experience?: ImportedExperience[];
  education?: ImportedEducation[];
}

export interface ImportedEducation {
  institution: string;
  degree: string;
  field?: string;
  from: string;
  to?: string;
}

export interface ImportProposal {
  id: string;
  /** Field-by-field, so the UI can show each one for confirmation. */
  proposed: ImportedProfile;
  /** Characters of text the parser had to work with. */
  charsRead: number;
  /** Fields the CV did not mention, named rather than silently blank. */
  notFound: string[];
}

/**
 * Reads a CV and PROPOSES field values.
 *
 * Nothing is written. The proposal goes back to the browser, the person checks
 * it, and only then is it saved — the same rule the repository scanner follows.
 * A parser that writes straight into the profile is a plausible-lie generator.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly extract: ExtractService,
    private readonly llm: LlmService,
  ) {}

  async fromFile(buffer: Buffer, filename: string): Promise<ImportProposal> {
    const text = await this.extract.fromFile(buffer, filename);
    const proposed = await this.structure(text);

    return {
      id: randomUUID(),
      proposed,
      charsRead: text.length,
      notFound: this.missingFields(proposed),
    };
  }

  private async structure(text: string): Promise<ImportedProfile> {
    const prompt = `<cv>
${text.slice(0, 24000)}
</cv>

Return ONLY JSON, no prose and no code fences:

{
  "firstName": "", "lastName": "", "fullName": "", "preferredName": "",
  "email": "", "phone": "",
  "location": "", "city": "", "state": "", "country": "", "postalCode": "",
  "linkedin": "", "github": "", "portfolio": "", "website": "",
  "currentCompany": "", "currentTitle": "", "yearsExperience": "",
  "summary": "the professional summary, in their own words, condensed if long",
  "skills": ["every technology, language, framework and tool named anywhere in the CV"],
  "experience": [
    { "company": "", "title": "", "from": "YYYY-MM", "to": "YYYY-MM or empty if current",
      "current": false,
      "description": "one line framing the role, their wording",
      "bullets": ["each achievement or responsibility as its own line, their wording"] }
  ],
  "education": [
    { "institution": "", "degree": "", "field": "", "from": "YYYY", "to": "YYYY" }
  ]
}

Use "" or [] for anything the CV does not state. Order experience newest first.

For "bullets", keep each point as a separate string exactly as the CV phrases it.
Do not merge, summarise or improve them — they are the candidate's own claims,
and a reworded claim is no longer something they said.

For "skills", list only what the CV actually names. A skill you infer is a skill
they never wrote down.`;

    const raw = await this.llm.complete(prompt, SYSTEM);
    const parsed = this.parseJson(raw);

    return parsed;
  }

  /** Models wrap JSON in prose or fences; take the first balanced object. */
  private parseJson(text: string): ImportedProfile {
    const body = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
    const start = body.indexOf('{');

    if (start === -1) {
      throw new BadRequestException('Could not read that CV — no structured data came back.');
    }

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
          throw new BadRequestException('Could not read that CV — the parsed data was malformed.');
        }
      }
    }

    throw new BadRequestException('Could not read that CV — the parsed data was incomplete.');
  }

  /** Named explicitly, so a blank field reads as "not in your CV" rather than "lost". */
  private missingFields(proposed: ImportedProfile): string[] {
    const wanted = ['email', 'phone', 'location', 'linkedin', 'github'] as const;
    return wanted.filter((key) => !proposed[key]);
  }
}
