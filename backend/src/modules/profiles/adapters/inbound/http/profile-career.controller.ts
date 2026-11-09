import {
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { GetProfileCareer } from '../../../application/use-cases/get-profile-career';
import { ImportProfileCareer } from '../../../application/use-cases/import-profile-career';
import { SaveProfileCareer } from '../../../application/use-cases/save-profile-career';
import { CareerImportError, type CareerImport, type CareerSections } from '../../../domain/career-profile';
import { DraftAchievements } from '../../../application/use-cases/draft-achievements';
import { DeepenAchievement } from '../../../application/use-cases/deepen-achievement';
import type { DeepenInput } from '../../../application/ports/achievement-writer';
import { AchievementError, type AchievementSource } from '../../../domain/achievements';
import {
  achievementDraftSchema,
  careerImportSchema,
  careerUpdateSchema,
  deepenAchievementSchema,
} from '../../career.schemas';
@Catch(AchievementError)
class AchievementErrorFilter implements ExceptionFilter {
  catch(error: AchievementError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(502).json({ statusCode: 502, message: error.message });
  }
}
@Catch(CareerImportError)
class CareerErrorFilter implements ExceptionFilter {
  catch(error: CareerImportError, host: ArgumentsHost) {
    const status = { invalid: 400, conflict: 409, 'not-found': 404 }[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message: error.message });
  }
}
@Controller('profile/career')
@UseGuards(AuthGuard)
@UseFilters(CareerErrorFilter, AchievementErrorFilter)
export class ProfileCareerController {
  constructor(
    @Inject(GetProfileCareer) private readonly get: GetProfileCareer,
    @Inject(ImportProfileCareer) private readonly importer: ImportProfileCareer,
    @Inject(SaveProfileCareer) private readonly editor: SaveProfileCareer,
    @Inject(DraftAchievements) private readonly achievements: DraftAchievements,
    @Inject(DeepenAchievement) private readonly deepen: DeepenAchievement,
  ) {}
  /** "Rewrite with my answers": one achievement filled out with the answers to its questions. */
  @Post('achievements/deepen') @HttpCode(200) deepenAchievement(
    @Body(new ZodValidationPipe(deepenAchievementSchema)) input: DeepenInput,
  ) {
    return this.deepen.execute(input);
  }
  /** "Turn into bullets": achievements proposed from the notes about one job. Nothing is saved. */
  @Post('achievements') @HttpCode(200) draftAchievements(
    @Body(new ZodValidationPipe(achievementDraftSchema)) source: AchievementSource,
  ) {
    return this.achievements.execute(source);
  }
  @Get() read(@CurrentUser() userId: string) {
    return this.get.execute(userId);
  }
  @Put() saveCareer(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(careerUpdateSchema))
    input: { expectedRevision: number; sections: Partial<CareerSections> },
  ) {
    return this.editor.execute(userId, input);
  }
  @Post('import') @HttpCode(200) save(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(careerImportSchema)) input: CareerImport,
  ) {
    return this.importer.execute(userId, input);
  }
}
