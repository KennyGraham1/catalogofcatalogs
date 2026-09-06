/**
 * @jest-environment node
 *
 * JWT session revocation tests.
 *
 * A JWT session carries the role that was current when the token was issued and
 * lives for 24 h (lib/auth/config.ts session.maxAge). NextAuth v4 runs
 * callbacks.jwt on every session read — including every getServerSession() call
 * behind requireAdmin/requireEditor — so that callback is the one place where a
 * role demotion or an account deactivation can be made to take effect at once
 * instead of when the token expires.
 */

// next-auth pulls in the ESM-only `uuid` package, which the project's jest
// transform does not process; the callbacks under test are plain functions on
// authOptions, so the package itself is stubbed out.
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: (options: unknown) => options,
}));

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: {
    USERS: 'users',
    AUDIT_LOGS: 'audit_logs',
  },
}));

jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

import { getCollection } from '@/lib/mongodb';
import { authOptions } from '@/lib/auth/config';
import { getSessionUserState } from '@/lib/auth/utils';
import { UserRole } from '@/lib/auth/types';

type UserDoc = Record<string, unknown> | null;

function mockStoredUser(doc: UserDoc) {
  const findOne = jest.fn().mockResolvedValue(doc);
  (getCollection as jest.Mock).mockResolvedValue({ findOne });
  return findOne;
}

const jwtCallback = authOptions.callbacks!.jwt!;
const sessionCallback = authOptions.callbacks!.session!;

// A token as minted at sign-in for an admin whose stored jwt_version was 0.
function adminToken() {
  return { id: 'u1', role: UserRole.ADMIN, jwtVersion: 0 } as any;
}

describe('getSessionUserState', () => {
  it('reads role, active flag and jwt_version for the user id', async () => {
    const findOne = mockStoredUser({ role: 'editor', is_active: true, jwt_version: 3 });

    expect(await getSessionUserState('u1')).toEqual({
      role: 'editor',
      isActive: true,
      jwtVersion: 3,
    });
    expect(findOne).toHaveBeenCalledWith(
      { id: 'u1' },
      { projection: { role: 1, is_active: 1, jwt_version: 1 } },
    );
  });

  it('returns null for a deleted account', async () => {
    mockStoredUser(null);
    expect(await getSessionUserState('gone')).toBeNull();
  });

  it('treats a document with no is_active flag as active and no jwt_version as 0', async () => {
    mockStoredUser({ role: 'viewer' });
    expect(await getSessionUserState('u1')).toEqual({
      role: 'viewer',
      isActive: true,
      jwtVersion: 0,
    });
  });
});

describe('jwt callback — authorisation state is re-read, not trusted', () => {
  it('embeds role and jwt_version on first sign-in without a database read', async () => {
    const findOne = mockStoredUser({ role: 'admin', is_active: true, jwt_version: 0 });

    const token = await jwtCallback({
      token: {} as any,
      user: { id: 'u1', role: UserRole.ADMIN, jwtVersion: 2 } as any,
    } as any);

    expect(token).toMatchObject({ id: 'u1', role: UserRole.ADMIN, jwtVersion: 2 });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('downgrades the token role after a demotion (admin -> viewer)', async () => {
    mockStoredUser({ role: 'viewer', is_active: true, jwt_version: 0 });

    const token: any = await jwtCallback({ token: adminToken() } as any);

    // The stale 'admin' claim must not survive; requireAdmin reads this value.
    expect(token).not.toBeNull();
    expect(token.role).toBe('viewer');

    const session: any = await sessionCallback({
      session: { user: {} } as any,
      token,
    } as any);
    expect(session.user.role).toBe('viewer');
  });

  it('upgrades the token role after an approved role request (viewer -> editor)', async () => {
    mockStoredUser({ role: 'editor', is_active: true, jwt_version: 0 });

    const token: any = await jwtCallback({
      token: { id: 'u1', role: UserRole.VIEWER, jwtVersion: 0 } as any,
    } as any);

    expect(token.role).toBe('editor');
  });

  it('destroys the session when the account has been deactivated', async () => {
    mockStoredUser({ role: 'admin', is_active: false, jwt_version: 0 });

    expect(await jwtCallback({ token: adminToken() } as any)).toBeNull();
  });

  it('destroys the session when the account has been deleted', async () => {
    mockStoredUser(null);

    expect(await jwtCallback({ token: adminToken() } as any)).toBeNull();
  });

  it('destroys the session when jwt_version has been bumped past the token', async () => {
    mockStoredUser({ role: 'admin', is_active: true, jwt_version: 1 });

    expect(await jwtCallback({ token: adminToken() } as any)).toBeNull();
  });

  it('destroys a legacy token with no version once jwt_version has been bumped', async () => {
    mockStoredUser({ role: 'admin', is_active: true, jwt_version: 1 });

    const token = await jwtCallback({
      token: { id: 'u1', role: UserRole.ADMIN } as any,
    } as any);

    expect(token).toBeNull();
  });

  it('keeps a token whose version still matches the stored version', async () => {
    mockStoredUser({ role: 'admin', is_active: true, jwt_version: 0 });

    const token: any = await jwtCallback({ token: adminToken() } as any);

    expect(token).not.toBeNull();
    expect(token.role).toBe('admin');
  });
});
