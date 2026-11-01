import { Module } from '@nestjs/common';
import { TailorService } from './tailor.service';
import { TailorController } from './tailor.controller';

@Module({
  providers: [TailorService],
  controllers: [TailorController],
})
export class TailorModule {}
