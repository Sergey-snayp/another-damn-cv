import {
  Body,
  Catch,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { ResumePdfs } from '../../../application/use-cases/resume-pdfs';
import { PdfUnavailableError } from '../../../domain/resume-pdf';
import { ResumeErrorFilter } from './resume-error.filter';
import { ResumeOwnerGuard } from './resume-owner.guard';

/** The editor's design: the same fields as the app's ResumeTheme. */
export const resumeThemeSchema = z
  .object({
    template: z.enum(['classic', 'compact']),
    accent: z.string().regex(/^#[0-9a-f]{3,8}$/i),
    fontFamily: z.string().min(1).max(200),
    fontSize: z.number().min(6).max(20),
    lineHeight: z.number().min(0.8).max(3),
    sectionGap: z.number().min(0).max(80),
  })
  .strict();

@Catch(PdfUnavailableError)
class PdfErrorFilter implements ExceptionFilter {
  catch(error: PdfUnavailableError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(503).json({ statusCode: 503, message: error.message });
  }
}

function sendPdf(
  res: Response,
  file: { fileName: string; pdf: Buffer },
  disposition: 'inline' | 'attachment',
) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.pdf);
}

/** The app: the CV's design, and its PDF ("Preview resume"). */
@Controller('resumes')
@UseGuards(AuthGuard, ResumeOwnerGuard)
@UseFilters(ResumeErrorFilter, PdfErrorFilter)
export class ResumePdfController {
  constructor(@Inject(ResumePdfs) private readonly pdfs: ResumePdfs) {}

  @Get(':id/theme') async theme(@CurrentUser() userId: string, @Param('id') id: string) {
    return { theme: await this.pdfs.theme(userId, id) };
  }

  @Put(':id/theme') async setTheme(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resumeThemeSchema)) theme: z.infer<typeof resumeThemeSchema>,
  ) {
    return { theme: await this.pdfs.setTheme(userId, id, theme) };
  }

  @Get(':id/pdf') async pdf(@CurrentUser() userId: string, @Param('id') id: string, @Res() res: Response) {
    sendPdf(res, await this.pdfs.file(userId, id), 'inline');
  }
}

/** The extension downloads the CV's PDF to upload it to a form, as Simplify does. */
@Controller('extension/resumes')
@UseGuards(SyncTokenGuard)
@UseFilters(ResumeErrorFilter, PdfErrorFilter)
export class ExtensionResumePdfController {
  constructor(@Inject(ResumePdfs) private readonly pdfs: ResumePdfs) {}

  @Get(':id/pdf') async pdf(@CurrentUser() userId: string, @Param('id') id: string, @Res() res: Response) {
    sendPdf(res, await this.pdfs.file(userId, id), 'attachment');
  }
}

/** For the server's own Chrome: the CV and design behind a short-lived signed link. */
@Controller('print/resumes')
@UseFilters(ResumeErrorFilter)
export class PrintResumeController {
  constructor(@Inject(ResumePdfs) private readonly pdfs: ResumePdfs) {}

  @Get(':id') async view(@Param('id') id: string, @Query('token') token = '') {
    const view = await this.pdfs.printView(token, id);
    if (!view) throw new UnauthorizedException('This print link is not valid.');
    return view;
  }
}
