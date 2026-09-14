import { resolve } from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  factBasePath: process.env.FACTBASE_PATH
    ?? resolve(process.env.HOME ?? '', 'Projects/CVs/sergey_proniuk_cv.json'),
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  scanRoot: process.env.SCAN_ROOT ?? resolve(process.env.HOME ?? '', 'Projects'),
};
