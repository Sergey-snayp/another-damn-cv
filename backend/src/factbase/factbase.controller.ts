import { Body, Controller, Get, Put } from '@nestjs/common';
import type { FactBase } from '../shared';
import { FactBaseService } from './factbase.service';

@Controller('factbase')
export class FactBaseController {
  constructor(private readonly factBase: FactBaseService) {}

  @Get()
  get(): FactBase {
    return this.factBase.load();
  }

  @Get('stats')
  stats() {
    return this.factBase.stats();
  }

  @Get('skills')
  skills() {
    return this.factBase.skills();
  }

  @Get('achievements')
  achievements() {
    return this.factBase.achievements();
  }

  /** The extension reads this; it is the only slice that leaves the machine. */
  @Get('profile')
  profile() {
    const base = this.factBase.load();
    const [firstName, ...rest] = base.profile.name.split(' ');

    return {
      firstName,
      lastName: rest.join(' '),
      fullName: base.profile.name,
      ...base.contact,
    };
  }

  @Put()
  update(@Body() base: FactBase) {
    this.factBase.save(base);
    return { ok: true };
  }
}
