/**
 * #113 (defence in depth): useAuth must not report a signed-in user unless the
 * session actually carries one.
 *
 * next-auth's SessionProvider reports status 'authenticated' for any non-empty
 * session object, including `{ user: null }` (the old /api/auth/session answer) and
 * `{ expires }` (NextAuth's own answer for a revoked token). The read-only banner, the
 * mobile Login/Sign Up menu and the auth gate cards all key off isAuthenticated.
 */

import { renderHook } from '@testing-library/react';

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }));

import { useSession } from 'next-auth/react';
import { useAuth } from '@/lib/auth/hooks';
import { UserRole } from '@/lib/auth/types';

function sessionState(data: unknown, status: 'authenticated' | 'unauthenticated' | 'loading') {
  (useSession as jest.Mock).mockReturnValue({ data, status });
  return renderHook(() => useAuth()).result.current;
}

describe('useAuth.isAuthenticated', () => {
  it('is false for a user-less session object the provider still calls authenticated', () => {
    expect(sessionState({ user: null }, 'authenticated').isAuthenticated).toBe(false);
    expect(sessionState({ expires: '2099-01-01T00:00:00.000Z' }, 'authenticated').isAuthenticated).toBe(false);
  });

  it('is true for a session with a user', () => {
    const auth = sessionState({ user: { id: 'u1', role: UserRole.VIEWER } }, 'authenticated');
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user).toEqual({ id: 'u1', role: UserRole.VIEWER });
  });

  it('is false while loading or unauthenticated', () => {
    expect(sessionState(null, 'unauthenticated').isAuthenticated).toBe(false);
    const loading = sessionState(undefined, 'loading');
    expect(loading.isAuthenticated).toBe(false);
    expect(loading.isLoading).toBe(true);
  });
});
