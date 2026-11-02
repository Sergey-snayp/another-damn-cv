export class ResumeError extends Error {
  constructor(
    readonly code: 'not-found' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}
