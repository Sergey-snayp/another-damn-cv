import type { ClaudeProcessRunner } from '../../../../../../shared/ai/claude-process.runner';
import type { CvTranscriber } from '../../../../application/ports/cv-import';
import { parseTranscription } from './transcription.parser';
import { transcriptionPrompt, TRANSCRIPTION_SYSTEM } from './transcription.prompt';

export class ClaudeCvTranscriber implements CvTranscriber {
  constructor(private readonly runner: Pick<ClaudeProcessRunner, 'complete'>) {}
  async transcribe(text: string) {
    return parseTranscription(await this.runner.complete(transcriptionPrompt(text), TRANSCRIPTION_SYSTEM));
  }
}
