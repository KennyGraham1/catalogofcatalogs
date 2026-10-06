/**
 * UI audit 2026-10-05, finding 9: protected-action links pointed to plain /login, and the
 * login page falls back to the home page without a callback, so the user lost the workflow
 * they came from. loginHref carries a safe same-origin callback.
 */
import { loginHref } from '@/lib/auth/login-href';

describe('loginHref', () => {
  it('returns to the page the user came from', () => {
    expect(loginHref('/merge')).toBe('/login?callbackUrl=%2Fmerge');
    expect(loginHref('/catalogues/abc/map?tab=events')).toBe('/login?callbackUrl=%2Fcatalogues%2Fabc%2Fmap%3Ftab%3Devents');
  });

  it('stays plain for the home page, the auth pages and missing paths', () => {
    for (const path of [undefined, null, '', '/', '/login', '/login?callbackUrl=%2Fx', '/register', '/forgot-password', '/reset-password?token=t']) {
      expect(loginHref(path)).toBe('/login');
    }
  });

  it('never carries an off-site target', () => {
    for (const path of ['https://evil.example/x', '//evil.example', '/\\evil.example', '/.//evil.example']) {
      expect(loginHref(path)).toBe('/login');
    }
  });
});
