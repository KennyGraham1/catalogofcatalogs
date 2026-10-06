import { loginHref } from './login-href';

/**
 * Editor (or Admin) access is granted by an administrator. A signed-in user asks for it
 * with the role upgrade request form on the profile page (POST /api/role-requests), which
 * administrators review at /admin/role-requests. The form's section carries this id.
 */
export const REQUEST_ACCESS_SECTION_ID = 'request-access';
export const REQUEST_ACCESS_PATH = `/profile#${REQUEST_ACCESS_SECTION_ID}`;

/**
 * Where a "Request Editor access" link goes: the request form for a signed-in user;
 * for a guest, sign-in first, returning to the form afterwards.
 */
export function requestAccessHref(isAuthenticated: boolean): string {
  return isAuthenticated ? REQUEST_ACCESS_PATH : loginHref(REQUEST_ACCESS_PATH);
}

/**
 * The registration URL that carries the same safe callback loginHref would, so that
 * registering and then signing in still returns the user to `path`.
 */
export function registerHref(path?: string | null): string {
  return loginHref(path).replace(/^\/login/, '/register');
}

/** The password-recovery URL, carrying the same safe callback for the way back. */
export function forgotPasswordHref(path?: string | null): string {
  return loginHref(path).replace(/^\/login/, '/forgot-password');
}
