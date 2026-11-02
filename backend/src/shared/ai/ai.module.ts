import { Module } from '@nestjs/common';
import { ClaudeProcessRunner } from './claude-process.runner';

@Module({ providers: [ClaudeProcessRunner], exports: [ClaudeProcessRunner] })
export class AiModule {}
