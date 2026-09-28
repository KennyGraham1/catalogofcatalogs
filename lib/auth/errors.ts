/**
 * Sign-in error codes and sign-in redirect handling, shared by the credentials
 * provider (lib/auth/config.ts) and the sign-in page.
 *
 * NextAuth hands the message of an error thrown by `authorize` back to the client as
 * `signIn(...).error` (and as ?error= on its redirects), so `authorize` throws these
 * stable codes rather than sentences, and the page turns them into text.
 */

export const AuthErrorCode = {
  /** Wrong password or unknown email (NextAuth's own code for failed credentials). */
  InvalidCredentials: 'CredentialsSignin',
  /** Refused by the credential throttle (lib/auth/login-rate-limit.ts). */
  TooManyAttempts: 'TooManyAttempts',
  /** Correct password, deactivated account. Only sent once the password has matched. */
  AccountDisabled: 'AccountDisabled',
  MissingCredentials: 'MissingCredentials',
} as const;

/** Text for a sign-in error code. None of them reveals whether an account exists. */
export function describeAuthError(code: string | null | undefined): string {
  switch (code) {
    case AuthErrorCode.InvalidCredentials:
      return 'Invalid email or password.';
    case AuthErrorCode.TooManyAttempts:
      return 'Too many sign-in attempts. Please wait 15 minutes and try again, or reset your password.';
    case AuthErrorCode.AccountDisabled:
      return 'This account has been disabled. Please contact an administrator.';
    case AuthErrorCode.MissingCredentials:
      return 'Enter your email and password.';
    default:
      return 'Unable to sign in. Please try again.';
  }
}

const CALLBACK_BASE = 'http://callback.invalid';

/**
 * Where to go after signing in: a same-origin path from ?callbackUrl=, or `fallback`.
 * Absolute and protocol-relative URLs are refused (open redirect), including the
 * backslash and control-character spellings browsers normalise to '//host'.
 */
export function safeCallbackPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, CALLBACK_BASE);
    if (url.origin !== CALLBACK_BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
