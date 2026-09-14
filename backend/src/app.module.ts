import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { ImportModule } from './import/import.module';
import { FactBaseModule } from './factbase/factbase.module';
import { TailorModule } from './tailor/tailor.module';
import { ScannerModule } from './scanner/scanner.module';
import { ApplicationsModule } from './applications/applications.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProfileModule,
    ImportModule,
    FactBaseModule,
    TailorModule,
    ScannerModule,
    ApplicationsModule,
  ],
})
export class AppModule {}
