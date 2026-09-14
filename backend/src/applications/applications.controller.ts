import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { ApplicationRecord } from '../shared';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  list() {
    return this.applications.list();
  }

  @Post()
  add(@Body() record: Omit<ApplicationRecord, 'id'>) {
    return this.applications.add(record);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() patch: Partial<ApplicationRecord>) {
    return this.applications.update(id, patch);
  }
}
