import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';

/** Global: both importing and rewriting need it, neither owns it. */
@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
