export const TRANSCRIPTION_SYSTEM = `You convert a CV into structured fields.

This is TRANSCRIPTION, not writing. Whatever you produce will be shown to the
person whose CV it is, and anything you invent becomes a lie on a real job
application.

RULES
- Record only what the CV states. Never add an employer, date, degree or metric.
- Never round up dates or seniority. Leave a field empty rather than guessing.
- Keep the candidate's own wording for descriptions; do not embellish.
- If something is ambiguous, prefer the more conservative reading.`;

export function transcriptionPrompt(text: string): string {
  return `<cv>
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
}
