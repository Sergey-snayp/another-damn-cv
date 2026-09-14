import { Module } from '@nestjs/common';
import { FactBaseModule } from './factbase/factbase.module';
import { TailorModule } from './tailor/tailor.module';
import { ScannerModule } from './scanner/scanner.module';
import { ApplicationsModule } from './applications/applications.module';

@Module({
  imports: [FactBaseModule, TailorModule, ScannerModule, ApplicationsModule],
})
export class AppModule {}
