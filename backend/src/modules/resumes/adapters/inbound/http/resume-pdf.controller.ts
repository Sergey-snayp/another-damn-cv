import {
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
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
import { PdfNotReadyError, PdfUnavailableError } from '../../../domain/resume-pdf';
import { ResumeErrorFilter } from './resume-error.filter';
import { ResumeOwnerGuard } from './resume-owner.guard';

/** The editor's design: the same fields as the app's ResumeTheme. */
export const resumeThemeSchema = z
  .object({
    // One design for now; older designs saved before are shown in this one.
    template: z.enum(['professional']),
    accent: z.string().regex(/^#[0-9a-f]{3,8}$/i),
    fontFamily: z.string().min(1).max(200),
    fontSize: z.number().min(6).max(20),
    lineHeight: z.number().min(0.8).max(3),
    sectionGap: z.number().min(0).max(80),
    /** The name's size on the CV, in points. */
    nameSize: z.number().min(16).max(48).optional(),
    /** The editor's section order and the sections hidden from the CV ("summary", "experience", …). */
    sectionOrder: z.array(z.string().min(1).max(60)).max(40).optional(),
    hiddenSections: z.array(z.string().min(1).max(60)).max(40).optional(),
  })
  .strict();

export const renameSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

@Catch(PdfUnavailableError, PdfNotReadyError)
class PdfErrorFilter implements ExceptionFilter {
  catch(error: PdfUnavailableError | PdfNotReadyError, host: ArgumentsHost) {
    const status = error instanceof PdfNotReadyError ? 409 : 503;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message: error.message });
  }
}

export function sendPdf(
  res: Response,
  file: { fileName: string; pdf: Buffer },
  disposition: 'inline' | 'attachment',
) {
  // Express encodes international names in filename* as well as a fallback.
  res.attachment(file.fileName);
  if (disposition === 'inline')
    res.setHeader(
      'Content-Disposition',
      String(res.getHeader('Content-Disposition')).replace(/^attachment/, 'inline'),
    );
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

  @Get(':id/pdf') async pdf(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    sendPdf(res, await this.pdfs.file(userId, id), download ? 'attachment' : 'inline');
  }

  /** The Save button calls this only after saving the CV's content. */
  @Post(':id/pdf') @HttpCode(200) async generate(@CurrentUser() userId: string, @Param('id') id: string) {
    const file = await this.pdfs.generate(userId, id);
    return { fileName: file.fileName, version: file.version };
  }

  /** The editor's ✎ on the CV name. */
  @Patch(':id/name') async rename(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(renameSchema)) body: { name: string },
  ) {
    return { name: await this.pdfs.rename(userId, id, body.name) };
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
