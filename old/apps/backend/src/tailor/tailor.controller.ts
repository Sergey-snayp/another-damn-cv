import { Body, Controller, Post } from '@nestjs/common';
import type { JobPosting, TailorRequest } from '@cv/core';
import { TailorService } from './tailor.service';

@Controller('tailor')
export class TailorController {
  constructor(private readonly tailor: TailorService) {}

  /** Coverage only — what is supported and, more usefully, what is not. */
  @Post('analyse')
  analyse(@Body() posting: JobPosting) {
    return this.tailor.analyse(posting);
  }

  @Post()
  generate(@Body() request: TailorRequest) {
    return this.tailor.tailor(request);
  }
}
