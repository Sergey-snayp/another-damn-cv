import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AiModule } from '../../shared/ai/ai.module';
import { ClaudeProcessRunner } from '../../shared/ai/claude-process.runner';
import { AuthModule } from '../auth/auth.module';
import { CvImportController } from './adapters/inbound/http/cv-import.controller';
import { ClaudeCvTranscriber } from './adapters/outbound/ai/claude-cv.transcriber';
import { CvDocumentTextExtractor } from './adapters/outbound/documents/document-text.extractor';
import { ImportCv } from './application/use-cases/import-cv';
import { IMPORT_CV } from './cv-import.tokens';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [CvImportController],
  providers: [
    {
      provide: IMPORT_CV,
      inject: [ClaudeProcessRunner],
      useFactory: (runner: ClaudeProcessRunner) =>
        new ImportCv(new CvDocumentTextExtractor(), new ClaudeCvTranscriber(runner), {
          next: () => randomUUID(),
        }),
    },
  ],
  exports: [IMPORT_CV],
})
export class CvImportModule {}
