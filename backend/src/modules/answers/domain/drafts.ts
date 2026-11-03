/**
 * AI-drafted answers to application questions, for the person to review.
 *
 * The draft may only use the CV. Personal facts the CV cannot hold (motivation,
 * salary, availability, contact handles, "how did you hear about us") come
 * back as questions in `needsInput`, never as invented answers.
 */
import { questionKey, type QuestionKind } from './answers';

export interface JobContext {
  title?: string;
  company?: string;
  /** The posting's text as read from the page; may be empty on a form-only page. */
  text?: string;
}

export interface DraftRequest {
  question: string;
  kind: QuestionKind;
  options?: string[];
  /** The field's character limit, when the form sets one. */
  maxLength?: number;
  job: JobContext;
  resumeId: string;
}

export interface CvEvidence {
  summary: string;
  roles: { company: string; title: string; from: string; to: string | null; bullets: string[] }[];
  skills: string[];
  education: string[];
}

export type DraftContext = Omit<DraftRequest, 'resumeId'> & { cv: CvEvidence };

export interface Draft {
  /** Empty when the CV cannot support an answer; see needsInput. */
  answer: string;
  needsInput: string[];
}

export class DraftError extends Error {
  constructor(
    readonly code: 'unavailable' | 'invalid-output' | 'cv-not-found',
    message: string,
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

/** Cuts a draft to the field's limit at a sentence end, so it never ends mid-word if avoidable. */
function fitLength(text: string, maxLength?: number): string {
  if (!maxLength || text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const sentence = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('.\n'),
  );
  if (sentence > maxLength * 0.5) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(' ');
  return (space > maxLength * 0.5 ? cut.slice(0, space) : cut).trim();
}

/**
 * Makes a model draft fit the field: a choice must be one of the options (its
 * exact text), a number field gets only a number, and text respects the limit.
 */
export function fitDraft(draft: Draft, request: Pick<DraftRequest, 'kind' | 'options' | 'maxLength'>): Draft {
  const answer = draft.answer.trim();
  const needsInput = draft.needsInput.map((item) => item.trim()).filter(Boolean);
  if (!answer) return { answer: '', needsInput };
  if ((request.kind === 'select' || request.kind === 'radio') && request.options?.length) {
    const option = request.options.find((item) => questionKey(item) === questionKey(answer));
    return option ? { answer: option, needsInput } : { answer: '', needsInput };
  }
  if (request.kind === 'number') {
    const number = answer.replace(/[\s,]/g, '').match(/\d+(\.\d+)?/)?.[0];
    return { answer: number ?? '', needsInput };
  }
  if (request.kind === 'checkbox') {
    return { answer: /^(yes|true|1)$/i.test(answer) ? 'Yes' : '', needsInput };
  }
  return { answer: fitLength(answer, request.maxLength), needsInput };
}
