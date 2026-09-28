/**
 * @jest-environment node
 *
 * #123: sign-in must not reveal which accounts exist or are disabled.
 *
 * - An unknown email skipped bcrypt entirely, so it answered ~100 ms faster than a
 *   known one.
 * - A disabled account answered 'Account is disabled...' before the password was
 *   checked, and NextAuth passes that text back verbatim, so anyone could tell a
 *   disabled account from an active one without its password.
 *
 * Registration's 409 for an existing email is kept deliberately (see the note in
 * app/api/auth/register/route.ts); it now points the owner at sign-in and reset.
 */

jest.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: (opts: unknown) => opts }));
jest.mock('@/lib/auth/utils', () => ({
  getUserByEmail: jest.fn(),
  verifyPassword: jest.fn(),
  updateLastLogin: jest.fn(async () => {}),
  toSafeUser: jest.fn((user: Record<string, unknown>) => user),
  getSessionUserState: jest.fn(),
  createUser: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => {}) }));
jest.mock('@/lib/auth/login-rate-limit', () => ({
  beginCredentialAttempt: jest.fn(async () => ({ succeeded: jest.fn(async () => {}) })),
}));

import * as bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import * as auth from '@/lib/auth/utils';
import { writeAuditLog } from '@/lib/audit';
import { POST as register } from '@/app/api/auth/register/route';

const utils = auth as unknown as Record<'getUserByEmail' | 'verifyPassword' | 'createUser', jest.Mock>;

const ACTIVE = { id: 'u-active', email: 'active@example.test', name: 'A', role: 'viewer', is_active: true, password_hash: 'hash:right' };
const DISABLED = { ...ACTIVE, id: 'u-disabled', email: 'disabled@example.test', is_active: false };

async function signInError(email: string, password: string): Promise<string> {
  try {
    await (authOptions.providers[0] as any).authorize({ email, password }, { headers: { 'x-forwarded-for': '198.51.100.30' } });
    return 'signed in';
  } catch (error) {
    return (error as Error).message;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  utils.getUserByEmail.mockImplementation(async (email: string) => [ACTIVE, DISABLED].find(u => u.email === email) ?? null);
  utils.verifyPassword.mockImplementation(async (password: string, hash: string) => hash === `hash:${password}`);
});

describe('#123 sign-in does not reveal account existence or state', () => {
  it('runs a real-cost bcrypt comparison for an unknown email', async () => {
    const message = await signInError('nobody@example.test', 'guess');

    expect(message).toBe(await signInError(ACTIVE.email, 'wrong'));
    expect(utils.verifyPassword).toHaveBeenCalledWith('guess', expect.stringMatching(/^\$2[aby]\$10\$/));
    const dummyHash = utils.verifyPassword.mock.calls.find(([password]) => password === 'guess')![1];
    expect(bcrypt.getRounds(dummyHash)).toBe(10);
  });

  it('gives a disabled account with a wrong password the same answer as an active one', async () => {
    const disabled = await signInError(DISABLED.email, 'wrong');
    const active = await signInError(ACTIVE.email, 'wrong');

    expect(disabled).toBe(active);
    expect(disabled).not.toMatch(/disabled/i);
    expect(utils.verifyPassword).toHaveBeenCalledTimes(2);
  });

  it('tells the owner, once the password is right, that the account is disabled', async () => {
    const message = await signInError(DISABLED.email, 'right');

    expect(message).toMatch(/disabled/i);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.login_failed', target_id: DISABLED.id, metadata: { reason: 'account_disabled' } }),
      expect.anything(),
    );
  });
});

describe('#123 registration with an existing email', () => {
  it('still answers 409 and points the owner to sign-in or password reset', async () => {
    utils.createUser.mockRejectedValue(new Error('User with this email already exists'));
    const request = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.31' },
      body: JSON.stringify({ email: ACTIVE.email, password: 'long-enough-1', name: 'X' }),
    });

    const res = await register(request);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/sign in|reset/i);
  });
});
