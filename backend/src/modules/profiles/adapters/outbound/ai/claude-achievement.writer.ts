import { z } from 'zod';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import { firstJsonObject } from '../../../../../shared/ai/json';
import {
  DASH_PUNCTUATION_RULE,
  withoutAddedPurpose,
  withoutDashPunctuation,
} from '../../../../resumes/contracts';
import type {
  AchievementWriter,
  AssistInput,
  DeepenInput,
  SummaryAssistInput,
} from '../../../application/ports/achievement-writer';
import {
  AchievementError,
  type AchievementDraft,
  type AchievementSource,
} from '../../../domain/achievements';

const HONESTY = `ABSOLUTE RULES. Breaking any of these makes the output unusable:
- Use ONLY facts written in <notes>, <job>, <current_bullets> or <answers>. Never add a
  number, tool, product, company, scale, team size, reason, outcome or claim that is not
  written there.
- Keep every number exactly as written ("~20k" may become "~20,000", nothing else).
- Never inflate: "helped with" does not become "led", "did 2 audits" becomes "Completed 2
  audits", not "Led 2 audits", and never add an action the notes do not state ("used" does
  not become "migrated", "worked on" does not become "built").`;

/**
 * How a Profile achievement reads: a finished bullet for an engineering CV, as a
 * technical recruiter wants it. The Profile is the full, detailed record; each
 * CV later chooses and rewords from it for one posting (see the resumes rules).
 */
const PROFILE_STANDARD = `READ IT AS A SENIOR TECHNICAL RECRUITER: you screen engineering CVs every day and know
what makes a hiring manager stop. Concrete systems, the technologies that built them named
in context, what they power, scale, and real ownership. Every achievement is a finished CV
bullet, as detailed as the facts allow.

How an achievement reads:
- Shape: strong past-tense verb, what was built or changed, the technologies it used named
  in the clause that says what each did, what it powers or for whom, then scale or result
  when the facts give it. For example, in shape only:
  "Built [system] in [language] on [cloud services], powering [what] for [scale]."
  "Designed [mechanism] with [technology], so [reason the facts give]."
  "Led a [n]-person team delivering [system] with [technologies]."
- Name each technology where it works: "backed by [database] for [what it stores]",
  "orchestrated with [service]", "secured with [method]". Never a bare list of tools.
- Ownership lives in the verb: "Built from scratch", "Designed and built", "Owned", "Led a
  3-person team". Never as an aside ("as its sole author,").
- Numbers and scale exactly as the facts give them ("~15,000-20,000 transactions a day").
- A time frame when the facts give one (daily, in 3 months, over 2 years), and a lasting fact
  ("still in production") as a short closing clause, only when the facts say it.
- No filler and no benefit the facts do not state.
- 20 to 40 words, one or two sentences, ending with a period. Shorter only when the facts
  hold no more: a thin line is a reason to ask a question, not to pad it.
- ${DASH_PUNCTUATION_RULE}`;

const SYSTEM = `You turn a person's own notes about one job into achievements for their career profile.
The profile keeps everything they did, in full detail; later, a few of these are chosen and
reworded for each CV.

${HONESTY}

How to split the notes:
- One achievement per piece of work (a system, a feature, a fix, a migration, an audit, a
  team they led), at most 40 words each. Do not merge two pieces of work.
- When the notes say more about one piece of work than 40 words hold, write several
  achievements about it, each about one part: how it was built; a decision and its reason;
  how it was tested; the team they led; what it changed. Each names the work, so it stands
  on its own. Never thin one-fact lines.
- Do not repeat a line from <current_bullets>; write only what is new or fuller.
- Never repeat yourself: each achievement opens with a different past-tense verb (and not one
  <current_bullets> already open with, where another fits), and no two reuse the same phrases.
- Every technology named in <notes>, in the job's description or in <current_bullets> is in
  at least one achievement (new or current), in context of what it did. A technology only in
  the job's tech stack goes in where the notes say what it did; otherwise it may only be
  named for the job's platform as a whole ("the platform's services in TypeScript on Node.js,
  running on AWS Lambda"), never tied to a piece of work the notes do not connect it to.

${PROFILE_STANDARD}

Follow-up questions ("asks"): for each achievement, up to 2 short questions whose answers
would make it fuller, only about what the notes leave out:
- what it was like before ("How were certificates renewed before?"),
- why it was done this way ("Why Step Functions rather than a cron job?"),
- what part was theirs ("Did you build it alone or with a team?"),
- how many or how much ("About how many alerts a week?"),
- whether it lasted ("Is it still in use?").
An achievement that already has these gets no questions.

Also:
- "techStack": the technologies the notes name, as written: languages, frameworks, libraries,
  databases, cloud services, protocols and developer tools. Not companies, clients, card
  networks, payment providers or chat apps.
- "technologies": every technology named anywhere in <job> or <notes>, as written.
- "description": when <job> has no description, one or two sentences on what the role or
  project was (product, team, scale), from the notes only; otherwise "".

Return ONLY JSON, no prose and no code fences:
{"achievements": [{"text": "...", "asks": ["..."]}], "techStack": ["..."], "technologies": ["..."], "description": ""}`;

const COVER_SYSTEM = `You add achievements to one job on a person's career profile, so that every technology
they used appears in at least one achievement.

${HONESTY}

- For each technology in <missing>, find in <notes> or <job> what it did in this job, and
  write it into an achievement: a new one about that work, or a fuller version of one in
  <written> (then return the fuller version; it replaces that one).
- A technology listed in the job's tech stack, with no word on what it did, may be named for
  the job's platform as a whole, in one achievement that says what the platform was built
  and run with ("Developed the payment platform's services in TypeScript on Node.js, running
  on AWS Lambda behind API Gateway"). Never tie it to a piece of work the facts do not
  connect it to, and never guess what it was used for.
- A technology you cannot place honestly goes in "unplaced".
- Several missing technologies from the same work belong in one achievement.

${PROFILE_STANDARD}

Return ONLY JSON, no prose and no code fences:
{"achievements": [{"text": "...", "replaces": "the line from <written> it makes fuller, or empty"}], "unplaced": ["..."]}`;

const DEEPEN_SYSTEM = `You rewrite one achievement on a person's career profile with their answers to follow-up questions.

${HONESTY}

- Rewrite only this one achievement. Keep everything it already says, and add only what the
  answers give: the before and after, the reason, their part, the counts, whether it lasted.
- Never bring in other work: only this achievement and the answers are facts here.
- An answer that says "no", "don't know" or nothing adds nothing.

${PROFILE_STANDARD}

Return ONLY JSON, no prose and no code fences:
{"text": "...", "asks": ["any question still worth asking, at most 1"]}`;

const SPLIT_SYSTEM = `You split one achievement on a person's career profile that is too long for a CV line.

${HONESTY}

- Write 2 to 4 achievements, each at most 40 words, one or two sentences.
- Each is about one part of the work: how it was built; a decision and its reason; how it was
  tested; the team they led; what it changed or whether it lasted.
- Each names the work it is about ("the TLS certificate service"), so it reads on its own.
- Together they keep every fact of the original: every number, name and reason. Use only
  its words and facts; add nothing.

${PROFILE_STANDARD}

Return ONLY JSON, no prose and no code fences:
{"parts": ["...", "..."]}`;

const ASSIST_SYSTEM = `You write 3 versions of one bullet for the work experience on a person's career profile.

${HONESTY}

- "improve": <bullet> is the bullet as it is now. Keep everything it says (every number, tool
  and fact); make it read better. "write": <words> is what the person wrote about the work,
  maybe rough or empty; write a new bullet from it and <job>.
- Use only facts in <bullet> or <words>, <job>, <keywords> and <coach>. A keyword goes in only
  where it is true of this work; otherwise leave it out. <coach> is the task the person did and
  what it changed, in their words: build the bullet around it.
- Never make up a number, a time frame or an outcome. Where a number would make the bullet
  stronger but the facts give none, write a placeholder the person fills in: "[X]%" for a
  share, "[N]" for a count, "[N] months" for a time. At most 2 placeholders per version.
- "Led", "managed" or "mentored" only when the facts say so.
- Follow <request> when there is one, within these rules.
- <other_bullets> are this job's other bullets. Never repeat yourself: no version restates
  work they already describe, opens with a verb they open with, or reuses their phrases.
- The 3 versions, each from another angle:
  1. "Result first": open with what the work changed or what it powers.
  2. "Technical": name the technologies where they worked and how it was built.
  3. "Concise": the tightest version, under 30 words.

${PROFILE_STANDARD}

Return ONLY JSON, no prose and no code fences:
{"options": [{"angle": "Result first", "text": "..."}, {"angle": "Technical", "text": "..."}, {"angle": "Concise", "text": "..."}]}`;

const answerSchema = z.object({
  achievements: z
    .array(
      z.object({
        text: z.string().catch(''),
        asks: z.array(z.string()).catch([]),
        ask: z.string().nullable().optional(),
      }),
    )
    .catch([]),
  techStack: z.array(z.string()).catch([]),
  technologies: z.array(z.string()).catch([]),
  description: z.string().catch(''),
});
const coverSchema = z.object({
  achievements: z.array(z.object({ text: z.string().catch(''), replaces: z.string().catch('') })).catch([]),
  unplaced: z.array(z.string()).catch([]),
});
const deepenSchema = z.object({ text: z.string().catch(''), asks: z.array(z.string()).catch([]) });
const splitSchema = z.object({ parts: z.array(z.string()).catch([]) });
const suggestSchema = z.object({
  keywords: z.array(z.string()).catch([]),
  tasks: z.array(z.string()).catch([]),
});

const SUMMARY_SYSTEM = `You write 3 versions of the professional summary on a person's career profile.

${HONESTY}

- "improve": <summary> is the summary as it is now; keep its facts and make it stronger.
  "write": <words> is what the person wrote (maybe rough or empty); write a summary from <profile>.
- Use only facts in <profile>, <summary> or <words>, and <keywords>. Years of experience only as
  <profile> gives them. Name real employers, products, domains and technologies from <profile>.
- A keyword goes in only where <profile> shows it. Follow <request> when there is one.
- Never make up a number; where one would help but <profile> has none, write "[X]" or "[N]".
- No "I", "me" or "my". "Led", "managed" or "mentored" only when <profile> says so.
- 3 or 4 sentences, 60 to 120 words. Sentence 1 is the hook: the title closest to the person's
  work, years of experience and core stack; then the domains, then 1 or 2 results with numbers.
- The 3 versions, each from another angle:
  1. "Results": lead with the strongest results.
  2. "Technical": lead with the stack and the systems built.
  3. "Domain": lead with the industries and products.

Return ONLY JSON, no prose and no code fences:
{"options": [{"angle": "Results", "text": "..."}, {"angle": "Technical", "text": "..."}, {"angle": "Domain", "text": "..."}]}`;

const SUGGEST_SYSTEM = `You list, for one job on a person's career profile, what its bullets could be about.

- "keywords": about 12 short terms (1 to 3 words, Title Case) a recruiter for this kind of job
  searches for, taken from <job>, <current_bullets> and <notes>: domain terms ("Payment
  Processing", "Tokenization"), technologies from its tech stack ("AWS Lambda"), and practices
  ("API Integration", "Production Support"). Only what this job's text points to.
- "tasks": about 10 responsibilities someone in this job does, each a short phrase in sentence
  case ("Card payment processing", "REST API development", "Live production support"), from the
  same text. The person picks the ones they did; never claim one for them.

Return ONLY JSON, no prose and no code fences:
{"keywords": ["..."], "tasks": ["..."]}`;

const assistSchema = z.object({
  options: z.array(z.object({ angle: z.string().catch(''), text: z.string().catch('') })).catch([]),
});

export function achievementPrompt(source: AchievementSource): string {
  return `<job>
Title: ${source.title}
Company: ${source.company}${source.client ? `\nClient: ${source.client}` : ''}
Description: ${source.description || '(none)'}
Tech stack: ${source.techStack || '(none)'}
</job>

<current_bullets>
${source.bullets.map((bullet) => `- ${bullet}`).join('\n') || '(none)'}
</current_bullets>

<notes>
${source.notes}
</notes>`;
}

const factsOf = (source: AchievementSource) =>
  [
    source.title,
    source.company,
    source.client,
    source.description,
    source.techStack,
    source.notes,
    ...source.bullets,
  ].join('\n');

/** Writes with the local Claude CLI: prompt only, no tools, no saved session. */
export class ClaudeAchievementWriter implements AchievementWriter {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}

  async draft(source: AchievementSource): Promise<AchievementDraft> {
    const raw = await this.llm.complete(achievementPrompt(source), SYSTEM, {
      effort: 'medium',
      timeoutMs: 150_000,
      maxOutputChars: 60_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not return achievements. Try again.');
    const answer = answerSchema.parse(json);
    const facts = factsOf(source);
    return {
      // A benefit the notes do not state ("…to reduce risk") is cut.
      achievements: answer.achievements.map((item) => ({
        text: withoutDashPunctuation(withoutAddedPurpose(item.text, facts)),
        asks: (item.asks.length ? item.asks : item.ask ? [item.ask] : []).map(withoutDashPunctuation),
      })),
      techStack: answer.techStack,
      technologies: answer.technologies,
      description: withoutDashPunctuation(answer.description),
    };
  }

  async cover(input: {
    source: AchievementSource;
    missing: string[];
    written: string[];
  }): Promise<{ achievements: { text: string; replaces: string }[]; unplaced: string[] }> {
    const prompt = `${achievementPrompt(input.source)}

<written>
${input.written.map((line) => `- ${line}`).join('\n') || '(none)'}
</written>

<missing>
${input.missing.join(', ')}
</missing>`;
    const raw = await this.llm.complete(prompt, COVER_SYSTEM, {
      effort: 'medium',
      timeoutMs: 150_000,
      maxOutputChars: 40_000,
    });
    const json = firstJsonObject(raw);
    if (!json) return { achievements: [], unplaced: input.missing };
    const answer = coverSchema.parse(json);
    const facts = factsOf(input.source);
    return {
      achievements: answer.achievements.map((item) => ({
        text: withoutDashPunctuation(withoutAddedPurpose(item.text, facts)),
        replaces: item.replaces.trim(),
      })),
      unplaced: answer.unplaced,
    };
  }

  async assist(input: AssistInput): Promise<{ angle: string; text: string }[]> {
    const prompt = `<mode>${input.mode}</mode>

<job>
Title: ${input.source.title}
Company: ${input.source.company}${input.source.client ? `\nClient: ${input.source.client}` : ''}
Description: ${input.source.description || '(none)'}
</job>

${input.mode === 'improve' ? `<bullet>\n${input.text}\n</bullet>` : `<words>\n${input.text || '(none: write from the job)'}\n</words>`}

<other_bullets>
${
  input.source.bullets
    .filter((bullet) => bullet.trim() && bullet.trim() !== input.text.trim())
    .map((bullet) => `- ${bullet}`)
    .join('\n') || '(none)'
}
</other_bullets>

<keywords>
${input.keywords.join(', ') || '(none)'}
</keywords>${
      input.coach
        ? `\n\n<coach>\nTask: ${input.coach.task}\nWhat it changed: ${input.coach.impacts.join(', ') || '(not given)'}\nHow much: ${input.coach.amount || '(not given)'}\nOver how long: ${input.coach.period || '(not given)'}\n</coach>`
        : ''
    }${input.instruction ? `\n\n<request>\n${input.instruction}\n</request>` : ''}`;
    const raw = await this.llm.complete(prompt, ASSIST_SYSTEM, {
      effort: 'medium',
      timeoutMs: 120_000,
      maxOutputChars: 20_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not write a bullet. Try again.');
    const facts = [
      input.source.description,
      input.text,
      ...input.keywords,
      ...(input.coach
        ? [input.coach.task, ...input.coach.impacts, input.coach.amount, input.coach.period]
        : []),
    ].join('\n');
    return assistSchema.parse(json).options.map((option) => ({
      angle: option.angle,
      text: withoutDashPunctuation(withoutAddedPurpose(option.text, facts)),
    }));
  }

  async summary(input: SummaryAssistInput): Promise<{ angle: string; text: string }[]> {
    const prompt = `<mode>${input.mode}</mode>

<profile>
${input.facts.slice(0, 30_000)}
</profile>

${input.mode === 'improve' ? `<summary>\n${input.text}\n</summary>` : `<words>\n${input.text || '(none)'}\n</words>`}

<keywords>
${input.keywords.join(', ') || '(none)'}
</keywords>${input.instruction ? `\n\n<request>\n${input.instruction}\n</request>` : ''}`;
    const raw = await this.llm.complete(prompt, SUMMARY_SYSTEM, {
      effort: 'medium',
      timeoutMs: 120_000,
      maxOutputChars: 20_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not write a summary. Try again.');
    return assistSchema.parse(json).options.map((option) => ({
      angle: option.angle,
      text: withoutDashPunctuation(withoutAddedPurpose(option.text, `${input.facts}\n${input.text}`)),
    }));
  }

  async suggest(source: AchievementSource): Promise<{ keywords: string[]; tasks: string[] }> {
    const raw = await this.llm.complete(achievementPrompt(source), SUGGEST_SYSTEM, {
      effort: 'low',
      timeoutMs: 90_000,
      maxOutputChars: 10_000,
    });
    const json = firstJsonObject(raw);
    if (!json) return { keywords: [], tasks: [] };
    return suggestSchema.parse(json);
  }

  async split(input: { source: AchievementSource; text: string }): Promise<string[]> {
    const prompt = `<job>
Title: ${input.source.title}
Company: ${input.source.company}${input.source.client ? `\nClient: ${input.source.client}` : ''}
</job>

<achievement>
${input.text}
</achievement>`;
    const raw = await this.llm.complete(prompt, SPLIT_SYSTEM, {
      effort: 'medium',
      timeoutMs: 120_000,
      maxOutputChars: 20_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not split the line. Try again.');
    return splitSchema
      .parse(json)
      .parts.map((part) => withoutDashPunctuation(withoutAddedPurpose(part, input.text)));
  }

  async deepen(input: DeepenInput): Promise<{ text: string; asks: string[] }> {
    const answers = input.answers.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n');
    // Only the job, this line and the answers: other work in the notes stays out of view.
    const prompt = `<job>
Title: ${input.source.title}
Company: ${input.source.company}${input.source.client ? `\nClient: ${input.source.client}` : ''}
</job>

<achievement>
${input.text}
</achievement>

<answers>
${answers}
</answers>${input.avoid?.length ? `\n\nDo not mention ${input.avoid.join(', ')}: they belong to other work.` : ''}`;
    const raw = await this.llm.complete(prompt, DEEPEN_SYSTEM, {
      effort: 'medium',
      timeoutMs: 120_000,
      maxOutputChars: 20_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not rewrite the line. Try again.');
    const answer = deepenSchema.parse(json);
    return {
      text: withoutDashPunctuation(withoutAddedPurpose(answer.text, `${input.text}\n${answers}`)),
      asks: answer.asks.map(withoutDashPunctuation),
    };
  }
}
