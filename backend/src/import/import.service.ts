import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ExtractService } from './extract.service';
import { LlmService } from './llm.service';
import type { CandidateProfile } from '../profile/profile.types';

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
export interface ImportProposal {
  id: string;
  /** Field-by-field, so the UI can show each one for confirmation. */
  proposed: Partial<CandidateProfile>;
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

  private async structure(text: string): Promise<Partial<CandidateProfile>> {
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
  "experience": [
    { "company": "", "title": "", "from": "YYYY-MM", "to": "YYYY-MM or empty if current",
      "current": false, "description": "one or two sentences, their wording" }
  ],
  "education": [
    { "institution": "", "degree": "", "field": "", "from": "YYYY", "to": "YYYY" }
  ]
}

Use "" for anything the CV does not state. Order experience newest first.`;

    const raw = await this.llm.complete(prompt, SYSTEM);
    const parsed = this.parseJson(raw);

    // Ids are ours, not the model's — it would invent duplicates.
    parsed.experience = (parsed.experience ?? []).map((row) => ({ ...row, id: randomUUID() }));
    parsed.education = (parsed.education ?? []).map((row) => ({ ...row, id: randomUUID() }));

    return parsed;
  }

  /** Models wrap JSON in prose or fences; take the first balanced object. */
  private parseJson(text: string): Partial<CandidateProfile> {
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

      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1)) as Partial<CandidateProfile>;
        } catch {
          throw new BadRequestException('Could not read that CV — the parsed data was malformed.');
        }
      }
    }

    throw new BadRequestException('Could not read that CV — the parsed data was incomplete.');
  }

  /** Named explicitly, so a blank field reads as "not in your CV" rather than "lost". */
  private missingFields(proposed: Partial<CandidateProfile>): string[] {
    const wanted: (keyof CandidateProfile)[] = [
      'email', 'phone', 'location', 'linkedin', 'github', 'currentCompany', 'currentTitle',
    ];

    return wanted.filter((key) => !proposed[key]);
  }
}
