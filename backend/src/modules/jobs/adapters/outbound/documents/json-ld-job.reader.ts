import type { StructuredJobReader } from '../../../application/ports/job-page-reader';
import { jobFromJsonLd } from './structured-data';

export class JsonLdJobReader implements StructuredJobReader {
  read(blocks: unknown[]) {
    return jobFromJsonLd(blocks);
  }
}
