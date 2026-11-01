import { Module } from '@nestjs/common';
import { ExtractService } from './extract.service';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

@Module({
  providers: [ExtractService, ImportService],
  controllers: [ImportController],
})
export class ImportModule {}
