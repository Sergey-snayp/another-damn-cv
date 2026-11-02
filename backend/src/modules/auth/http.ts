/** Public HTTP integration helpers. Business code should use contracts.ts. */
export { AuthGuard } from './adapters/inbound/http/auth.guard';
export { SyncTokenGuard } from './adapters/inbound/http/sync-token.guard';
export { CurrentUser } from './adapters/inbound/http/current-user.decorator';
export { AuthenticationErrorFilter } from './adapters/inbound/http/authentication-error.filter';
export { syncToken } from './adapters/inbound/http/sync-token';
export type { AuthedRequest } from './adapters/inbound/http/session';
