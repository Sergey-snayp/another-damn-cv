import type { RenderedResume } from './resume';
import { resumeText } from './resume-score';

/** How the editor's AI writes for one CV. */
export interface AiSettings {
  tone: 'balanced' | 'confident' | 'concise';
  /** Standing instructions, such as "Keep British spelling". */
  instructions: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = { tone: 'balanced', instructions: '' };

const TONES: Record<AiSettings['tone'], string> = {
  balanced: 'Plain, professional and specific.',
  confident: 'Direct and confident: active verbs, outcome first. Still only what the facts support.',
  concise: 'As short as possible: one line per bullet where the facts allow.',
};

export function aiSettingsFrom(value: unknown): AiSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<AiSettings>;
  return {
    tone: raw.tone && raw.tone in TONES ? raw.tone : DEFAULT_AI_SETTINGS.tone,
    instructions: typeof raw.instructions === 'string' ? raw.instructions.slice(0, 1_000) : '',
  };
}

/** The settings as lines for a prompt, so every AI feature in the editor follows them. */
export function settingsForPrompt(settings: AiSettings): string {
  return [
    `Tone: ${TONES[settings.tone]}`,
    settings.instructions.trim() && `The candidate's standing instructions: ${settings.instructions.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** One change the chat proposes. Nothing is applied until the person clicks Apply. */
export interface ChatSuggestion {
  target: 'summary' | 'headline' | 'bullet' | 'add-skill';
  /** The bullet's lineage, for "bullet". */
  lineageId?: string;
  /** Where it goes, for the person to read: "Engineer at Acme". */
  where: string;
  before: string;
  after: string;
  reason: string;
}

export interface RawSuggestion {
  target?: string;
  lineageId?: string;
  after?: string;
  reason?: string;
}

/**
 * The model's suggestions, kept only when they point at something on the CV.
 * "before" always comes from the CV, never from the model, so a suggestion
 * cannot quietly replace text it misquoted. A skill can only be added when
 * the CV already mentions it somewhere: the chat never adds a skill the
 * person has not shown.
 */
export function checkedSuggestions(resume: RenderedResume, raw: RawSuggestion[]): ChatSuggestion[] {
  const out: ChatSuggestion[] = [];
  const text = resumeText(resume).toLowerCase();
  const skills = new Set(resume.skills.map((skill) => skill.name.trim().toLowerCase()));
  for (const item of raw) {
    const after = (item.after ?? '').trim();
    const reason = (item.reason ?? '').trim().slice(0, 300);
    if (!after || after.length > 2_000) continue;
    if (item.target === 'summary') {
      const before = resume.summaries.default ?? '';
      if (after !== before.trim()) out.push({ target: 'summary', where: 'Summary', before, after, reason });
    } else if (item.target === 'headline') {
      const before = resume.contact?.headline ?? '';
      if (after.length <= 200 && after !== before.trim())
        out.push({ target: 'headline', where: 'Headline', before, after, reason });
    } else if (item.target === 'bullet' && item.lineageId) {
      const role = resume.experiences.find((r) => r.achievements.some((a) => a.lineageId === item.lineageId));
      const bullet = role?.achievements.find((a) => a.lineageId === item.lineageId);
      if (role && bullet && after !== bullet.bullet.trim())
        out.push({
          target: 'bullet',
          lineageId: bullet.lineageId,
          where: [role.title, role.company].filter(Boolean).join(' at '),
          before: bullet.bullet,
          after,
          reason,
        });
    } else if (item.target === 'add-skill') {
      const name = after.slice(0, 60);
      if (!skills.has(name.toLowerCase()) && text.includes(name.toLowerCase()))
        out.push({ target: 'add-skill', where: 'Skills', before: '', after: name, reason });
    }
    if (out.length >= 8) break;
  }
  return out;
}
