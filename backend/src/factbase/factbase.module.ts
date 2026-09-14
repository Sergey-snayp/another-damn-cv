import { Module } from '@nestjs/common';
import { FactBaseService } from './factbase.service';
import { FactBaseController } from './factbase.controller';

@Module({
  providers: [FactBaseService],
  controllers: [FactBaseController],
  exports: [FactBaseService],
})
export class FactBaseModule {}
