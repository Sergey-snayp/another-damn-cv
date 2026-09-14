import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global: every feature module needs the database, none should have to import it. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
