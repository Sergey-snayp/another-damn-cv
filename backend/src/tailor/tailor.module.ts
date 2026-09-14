import { Module } from '@nestjs/common';
import { FactBaseModule } from '../factbase/factbase.module';
import { TailorService } from './tailor.service';
import { TailorController } from './tailor.controller';

@Module({
  imports: [FactBaseModule],
  providers: [TailorService],
  controllers: [TailorController],
})
export class TailorModule {}
