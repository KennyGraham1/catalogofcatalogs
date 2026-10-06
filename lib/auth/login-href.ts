import { usePathname } from 'next/navigation';
import { safeCallbackPath } from './errors';

/**
 * The sign-in URL that returns the user to `path` afterwards. Only a same-origin path is
 * carried (safeCallbackPath, the check the login page applies on the way back), and the
 * home page and the auth pages themselves are left out, so links stay plain where a
 * callback would add nothing.
 */
export function loginHref(path?: string | null): string {
  const target = safeCallbackPath(path ?? null, '');
  if (!target || target === '/' || /^\/(login|register|forgot-password|reset-password)(\/|\?|#|$)/.test(target)) {
    return '/login';
  }
  return `/login?callbackUrl=${encodeURIComponent(target)}`;
}

/** loginHref for the current page (path only: the query is not needed to resume a workflow). */
export function useLoginHref(): string {
  return loginHref(usePathname());
}
