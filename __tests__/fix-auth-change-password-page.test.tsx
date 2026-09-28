/**
 * #124: changing the password revokes every session, including the caller's own (the
 * JWT version is bumped), but the page promised 'Redirecting to profile...' and pushed
 * /profile, where the middleware bounced the now signed-out user to the sign-in page.
 * The page must say so, sign out, and send the user to sign in with a way back to
 * their profile.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ signOut: jest.fn(async () => undefined) }));
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'user@example.test' }, isAuthenticated: true, isLoading: false }),
}));

import { signOut } from 'next-auth/react';
import ChangePasswordPage from '@/app/(auth)/change-password/page';

const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
  push.mockClear();
  (signOut as jest.Mock).mockClear();
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ message: 'Password changed successfully' }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

it('tells the user they are signed out and sends them to sign in, then back to their profile', async () => {
  render(<ChangePasswordPage />);
  fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old-password-1' } });
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new-password-1' } });
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'new-password-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

  expect(await screen.findByText(/signed out/i)).toBeInTheDocument();
  expect(screen.queryByText(/redirecting to profile/i)).not.toBeInTheDocument();

  await act(async () => {
    jest.advanceTimersByTime(3000);
  });

  await waitFor(() => expect(signOut).toHaveBeenCalledWith({
    callbackUrl: '/login?callbackUrl=%2Fprofile&passwordChanged=1',
  }));
  expect(push).not.toHaveBeenCalledWith('/profile');
});
