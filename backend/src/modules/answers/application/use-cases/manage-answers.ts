import type { AnswerDrafter, AnswerRepository, CvEvidenceReader } from '../ports/answers';
import { fitDraft, type DraftRequest } from '../../domain/drafts';
import { AnswerNotFoundError, matchAnswers, questionKey, type FormQuestion } from '../../domain/answers';

export class ListAnswers {
  constructor(private readonly repository: AnswerRepository) {}
  execute(userId: string) {
    return this.repository.list(userId);
  }
}

/** Saves what the person chose from a form. Blank answers are left out. */
export class SaveAnswers {
  constructor(private readonly repository: AnswerRepository) {}
  async execute(
    userId: string,
    input: { company?: string; answers: { question: string; answer: string }[] },
  ) {
    const byKey = new Map<
      string,
      { question: string; questionKey: string; answer: string; company: string | null }
    >();
    for (const item of input.answers) {
      const key = questionKey(item.question);
      const answer = item.answer.trim();
      if (!key || !answer) continue;
      byKey.set(key, {
        question: item.question.trim(),
        questionKey: key,
        answer,
        company: input.company?.trim() || null,
      });
    }
    return this.repository.upsertMany(userId, [...byKey.values()]);
  }
}

export class UpdateAnswer {
  constructor(private readonly repository: AnswerRepository) {}
  async execute(userId: string, id: string, answer: string) {
    const updated = await this.repository.update(userId, id, answer.trim());
    if (!updated) throw new AnswerNotFoundError();
    return updated;
  }
}

export class DeleteAnswer {
  constructor(private readonly repository: AnswerRepository) {}
  async execute(userId: string, id: string) {
    if (!(await this.repository.remove(userId, id))) throw new AnswerNotFoundError();
  }
}

/** Finds saved answers for a form's questions and records them as used. */
export class MatchAnswers {
  constructor(private readonly repository: AnswerRepository) {}
  async execute(userId: string, input: { company?: string; questions: FormQuestion[] }) {
    const result = matchAnswers(input.questions, await this.repository.list(userId), input.company);
    if (result.matches.length) {
      await this.repository.markUsed(userId, [...new Set(result.matches.map((match) => match.answerId))]);
    }
    return result;
  }
}

/** An AI draft for one question, from the chosen CV and the job. Nothing is saved. */
export class DraftAnswer {
  constructor(
    private readonly cv: CvEvidenceReader,
    private readonly drafter: AnswerDrafter,
  ) {}
  async execute(userId: string, request: DraftRequest) {
    const { resumeId, ...rest } = request;
    const cv = await this.cv.read(userId, resumeId);
    return fitDraft(await this.drafter.draft({ ...rest, cv }), request);
  }
}
