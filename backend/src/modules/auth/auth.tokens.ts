export const AUTH_API = Symbol('AuthApi');
export const AUTH_SETTINGS = Symbol('AuthSettings');
export interface AuthSettings {
  googleClientId: string;
}
