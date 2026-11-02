export class TailoringError extends Error {
  constructor(
    readonly code: 'not-found' | 'invalid' | 'pending' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
