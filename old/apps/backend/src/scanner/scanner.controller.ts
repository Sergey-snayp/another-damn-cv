import { Controller, Get, Post, Query } from '@nestjs/common';
import { ScannerService } from './scanner.service';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scanner: ScannerService) {}

  @Get('repos')
  repos(@Query('root') root?: string) {
    return this.scanner.listRepos(root);
  }

  /** Proposes facts. Nothing is written to the fact base without confirmation. */
  @Post('scan')
  scan(@Query('path') path: string) {
    return this.scanner.scan(path);
  }
}
