// mammoth ships no typings; we only use extractRawText.
declare module 'mammoth' {
  export interface RawTextResult { value: string; messages: unknown[] }
  export function extractRawText(input: { buffer: Buffer }): Promise<RawTextResult>;
  const mammoth: { extractRawText: typeof extractRawText };
  export default mammoth;
}
