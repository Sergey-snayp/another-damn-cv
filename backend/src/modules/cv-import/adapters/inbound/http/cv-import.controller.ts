import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../../../../auth/http';
import type { ImportCv } from '../../../application/use-cases/import-cv';
import { IMPORT_CV } from '../../../cv-import.tokens';
import { CvImportErrorFilter } from './cv-import-error.filter';

@Controller('import')
@UseGuards(AuthGuard)
@UseFilters(CvImportErrorFilter)
export class CvImportController {
  constructor(@Inject(IMPORT_CV) private readonly importer: ImportCv) {}
  @Post('cv')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  cv(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.importer.execute({ bytes: file.buffer, filename: file.originalname });
  }
}
