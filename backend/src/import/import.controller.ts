import {
  Controller, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { ImportService } from './import.service';

const MAX_BYTES = 10 * 1024 * 1024;

@Controller('import')
@UseGuards(AuthGuard)
export class ImportController {
  constructor(private readonly importer: ImportService) {}

  /**
   * Reads a CV and returns a PROPOSAL. Nothing is saved here.
   *
   * The browser shows what was found, the person confirms, and the existing
   * PUT /profile does the writing. Keeping those separate is what makes this an
   * assistant rather than something that silently rewrites your history.
   */
  @Post('cv')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async cv(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    return this.importer.fromFile(file.buffer, file.originalname);
  }
}
