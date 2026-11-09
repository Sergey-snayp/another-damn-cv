import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { DEFAULT_KINDS, DefaultNotFoundError, type NewDefault } from '../../../domain/defaults';
import {
  DeleteDefault,
  ListDefaults,
  SaveDefaults,
  UpdateDefault,
} from '../../../application/use-cases/manage-defaults';

const value = z.string().max(500);
export const saveDefaultsSchema = z
  .object({
    defaults: z
      .array(z.object({ kind: z.enum(DEFAULT_KINDS), scope: z.string().max(200), value }).strict())
      .min(1)
      .max(100),
  })
  .strict();
export const updateDefaultSchema = z
  .object({ value: value.refine((text) => text.trim().length > 0) })
  .strict();

@Catch(DefaultNotFoundError)
class DefaultErrorFilter implements ExceptionFilter {
  catch(error: DefaultNotFoundError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(404).json({ statusCode: 404, message: error.message });
  }
}

/** Profile → Default answers in the app. */
@Controller('defaults')
@UseGuards(AuthGuard)
@UseFilters(DefaultErrorFilter)
export class DefaultsController {
  constructor(
    @Inject(ListDefaults) private readonly listDefaults: ListDefaults,
    @Inject(UpdateDefault) private readonly updateDefault: UpdateDefault,
    @Inject(DeleteDefault) private readonly deleteDefault: DeleteDefault,
    @Inject(SaveDefaults) private readonly saveDefaults: SaveDefaults,
  ) {}
  @Get() list(@CurrentUser() userId: string) {
    return this.listDefaults.execute(userId);
  }
  @Post() @HttpCode(200) save(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(saveDefaultsSchema)) body: { defaults: NewDefault[] },
  ) {
    return this.saveDefaults.execute(userId, body.defaults);
  }
  @Patch(':id') update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDefaultSchema)) body: { value: string },
  ) {
    return this.updateDefault.execute(userId, id, body.value);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.deleteDefault.execute(userId, id);
  }
}

/** The extension reads defaults when it fills, and sets or forgets them from a field's icon. */
@Controller('extension/defaults')
@UseGuards(SyncTokenGuard)
@UseFilters(DefaultErrorFilter)
export class ExtensionDefaultsController {
  constructor(
    @Inject(ListDefaults) private readonly listDefaults: ListDefaults,
    @Inject(SaveDefaults) private readonly saveDefaults: SaveDefaults,
    @Inject(DeleteDefault) private readonly deleteDefault: DeleteDefault,
  ) {}
  @Get() list(@CurrentUser() userId: string) {
    return this.listDefaults.execute(userId);
  }
  @Post() save(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(saveDefaultsSchema)) body: { defaults: NewDefault[] },
  ) {
    return this.saveDefaults.execute(userId, body.defaults);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.deleteDefault.execute(userId, id);
  }
}
