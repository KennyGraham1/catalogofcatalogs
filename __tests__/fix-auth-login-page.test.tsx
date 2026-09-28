/**
 * #124: the sign-in page showed 'Unable to sign in. Please try again.' for every
 * failure - including throttling, where the useful answer is "wait" - and always went
 * to '/' afterwards, dropping the callbackUrl the middleware had added (so a user sent
 * to sign in from /profile never got back there). A callbackUrl must also never
 * redirect off-site.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = jest.fn();
const refresh = jest.fn();
let query = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }));

import { signIn } from 'next-auth/react';
import LoginPage from '@/app/(auth)/login/page';
import { describeAuthError, safeCallbackPath } from '@/lib/auth/errors';

async function submit(result: unknown) {
  (signIn as jest.Mock).mockResolvedValue(result);
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(signIn).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  query = '';
});

describe('sign-in errors', () => {
  it.each([
    ['TooManyAttempts', /too many sign-in attempts.*15 minutes/i],
    ['AccountDisabled', /disabled.*administrator/i],
    ['CredentialsSignin', /invalid email or password/i],
  ])('explains %s', async (code, message) => {
    await submit({ ok: false, status: 401, error: code, url: null });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('explains an error NextAuth put in the URL', async () => {
    query = 'error=TooManyAttempts';
    render(<LoginPage />);

    expect(screen.getByText(/too many sign-in attempts/i)).toBeInTheDocument();
  });
});

describe('callbackUrl', () => {
  it('returns to a same-origin path after signing in', async () => {
    query = 'callbackUrl=%2Fprofile%3Ftab%3Drequests';
    await submit({ ok: true, status: 200, error: null, url: 'http://localhost/profile' });

    await waitFor(() => expect(push).toHaveBeenCalledWith('/profile?tab=requests'));
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    '/\\evil.example/phish',
    'javascript:alert(1)',
  ])('ignores %s', async (callbackUrl) => {
    query = `callbackUrl=${encodeURIComponent(callbackUrl)}`;
    await submit({ ok: true, status: 200, error: null, url: 'http://localhost/' });

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('confirms a password change', () => {
    query = 'callbackUrl=%2Fprofile&passwordChanged=1';
    render(<LoginPage />);

    expect(screen.getByText(/password was changed/i)).toBeInTheDocument();
  });
});

describe('safeCallbackPath', () => {
  it('keeps same-origin paths and rejects everything else', () => {
    expect(safeCallbackPath('/admin/users?x=1#y')).toBe('/admin/users?x=1#y');
    expect(safeCallbackPath(null)).toBe('/');
    expect(safeCallbackPath('')).toBe('/');
    expect(safeCallbackPath('profile')).toBe('/');
    expect(safeCallbackPath('/\t/evil.example')).toBe('/');
    expect(safeCallbackPath('http://localhost/profile')).toBe('/');
    expect(describeAuthError('SomethingElse')).toMatch(/unable to sign in/i);
  });
});
