/**
 * @jest-environment node
 *
 * Admin user-management and role-request routes, run as real handlers against an
 * in-memory stand-in for MongoDB. Only the session check (requireAdmin/requireAuth)
 * and outbound notifications are stubbed.
 *
 * #115: approving a role request applied the role snapshot taken when it was filed,
 * whatever had happened to the account since, so a stale request could demote an
 * admin or re-elevate a demoted user.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireAdmin: jest.fn(),
  requireAuth: jest.fn(),
}));
jest.mock('@/lib/notifications', () => ({
  createUserNotification: jest.fn(async () => ({})),
  sendEmailNotification: jest.fn(async () => {}),
}));
jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: {
    USERS: 'users',
    ROLE_REQUESTS: 'role_requests',
    AUDIT_LOGS: 'audit_logs',
    NOTIFICATIONS: 'notifications',
  },
}));

import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/auth/types';
import { PATCH as patchUser, DELETE as deleteUser } from '@/app/api/users/[id]/route';
import { GET as listRoleRequests } from '@/app/api/role-requests/route';
import { PATCH as reviewRoleRequest } from '@/app/api/role-requests/[id]/route';

type Doc = Record<string, any>;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('$ne' in condition) return value !== condition.$ne;
      if ('$in' in condition) return condition.$in.includes(value);
      throw new Error(`fake collection: unsupported filter ${JSON.stringify(condition)}`);
    }
    return value === condition;
  });
}

function applyUpdate(doc: Doc, update: Doc) {
  const unsupported = Object.keys(update).filter(op => op !== '$set');
  if (unsupported.length) throw new Error(`fake collection: unsupported update ${unsupported}`);
  Object.assign(doc, update.$set);
}

/** Just enough of a MongoDB collection for these routes; documents are copied out. */
function fakeCollection(docs: Doc[] = []) {
  const find = (filter: Doc = {}) => {
    const result = docs.filter(doc => matches(doc, filter)).map(doc => ({ ...doc }));
    const cursor = { sort: () => cursor, project: () => cursor, toArray: async () => result };
    return cursor;
  };
  return {
    docs,
    findOne: jest.fn(async (filter: Doc) => {
      const doc = docs.find(d => matches(d, filter));
      return doc ? { ...doc } : null;
    }),
    find: jest.fn(find),
    insertOne: jest.fn(async (doc: Doc) => {
      docs.push({ ...doc });
      return { acknowledged: true };
    }),
    updateOne: jest.fn(async (filter: Doc, update: Doc) => {
      const doc = docs.find(d => matches(d, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(doc, update);
      return { matchedCount: 1, modifiedCount: 1 };
    }),
    updateMany: jest.fn(async (filter: Doc, update: Doc) => {
      const hit = docs.filter(d => matches(d, filter));
      hit.forEach(doc => applyUpdate(doc, update));
      return { matchedCount: hit.length, modifiedCount: hit.length };
    }),
    deleteOne: jest.fn(async (filter: Doc) => {
      const index = docs.findIndex(d => matches(d, filter));
      if (index < 0) return { deletedCount: 0 };
      docs.splice(index, 1);
      return { deletedCount: 1 };
    }),
    countDocuments: jest.fn(async (filter: Doc = {}) => docs.filter(d => matches(d, filter)).length),
  };
}

let db: Record<string, ReturnType<typeof fakeCollection>>;

function user(id: string, role: UserRole, extra: Doc = {}): Doc {
  return { id, email: `${id}@example.test`, name: id, role, is_active: true, password_hash: 'x', ...extra };
}

function pendingRequest(id: string, userId: string, currentRole: UserRole, requestedRole: UserRole): Doc {
  return {
    id, user_id: userId, user_email: `${userId}@example.test`, user_name: userId,
    current_role: currentRole, requested_role: requestedRole, justification: 'Need to import data',
    status: 'pending', admin_notes: null, created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z', reviewed_at: null, reviewed_by: null, reviewed_by_name: null,
  };
}

const ADMIN = { id: 'admin1', email: 'admin1@example.test', name: 'Admin One', role: UserRole.ADMIN };

function actAs(actor: typeof ADMIN) {
  (requireAdmin as jest.Mock).mockResolvedValue({ session: { user: actor }, user: actor });
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.44' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function setUsers(...docs: Doc[]) {
  db.users.docs.splice(0, db.users.docs.length, ...docs);
}

function stored(collection: string, id: string) {
  return db[collection].docs.find(doc => doc.id === id);
}

beforeEach(() => {
  db = {
    users: fakeCollection(),
    role_requests: fakeCollection(),
    audit_logs: fakeCollection(),
    notifications: fakeCollection(),
  };
  (getCollection as jest.Mock).mockImplementation(async (name: string) => {
    if (!db[name]) throw new Error(`unexpected collection ${name}`);
    return db[name];
  });
  actAs(ADMIN);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('#115 role-request approval uses the live role', () => {
  it('approves when the account is still in the role the request was filed from', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.VIEWER));
    db.role_requests.docs.push(pendingRequest('rr1', 'u1', UserRole.VIEWER, UserRole.EDITOR));

    const res = await reviewRoleRequest(jsonRequest('/api/role-requests/rr1', 'PATCH', { status: 'approved' }), params('rr1'));

    expect(res.status).toBe(200);
    expect(stored('users', 'u1')!.role).toBe(UserRole.EDITOR);
    expect(stored('role_requests', 'rr1')!.status).toBe('approved');
  });

  it('refuses to demote a user who was promoted to admin after filing (409, nothing changed)', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.ADMIN));
    db.role_requests.docs.push(pendingRequest('rr1', 'u1', UserRole.VIEWER, UserRole.EDITOR));

    const res = await reviewRoleRequest(jsonRequest('/api/role-requests/rr1', 'PATCH', { status: 'approved' }), params('rr1'));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/role has changed/i);
    expect(stored('users', 'u1')!.role).toBe(UserRole.ADMIN);
    expect(stored('role_requests', 'rr1')!.status).toBe('pending');
    expect(db.audit_logs.docs.filter(e => e.action === 'user.role_change')).toHaveLength(0);
  });

  it('refuses to re-elevate a user who was demoted after filing', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.GUEST));
    db.role_requests.docs.push(pendingRequest('rr1', 'u1', UserRole.VIEWER, UserRole.ADMIN));

    const res = await reviewRoleRequest(jsonRequest('/api/role-requests/rr1', 'PATCH', { status: 'approved' }), params('rr1'));

    expect(res.status).toBe(409);
    expect(stored('users', 'u1')!.role).toBe(UserRole.GUEST);
  });

  it('refuses to elevate a deactivated account', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.VIEWER, { is_active: false }));
    db.role_requests.docs.push(pendingRequest('rr1', 'u1', UserRole.VIEWER, UserRole.ADMIN));

    const res = await reviewRoleRequest(jsonRequest('/api/role-requests/rr1', 'PATCH', { status: 'approved' }), params('rr1'));

    expect(res.status).toBe(409);
    expect(stored('users', 'u1')!.role).toBe(UserRole.VIEWER);
    expect(stored('role_requests', 'rr1')!.status).toBe('pending');
  });

  it('closes pending requests when an admin changes the role directly', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.VIEWER));
    db.role_requests.docs.push(pendingRequest('rr1', 'u1', UserRole.VIEWER, UserRole.EDITOR));

    const res = await patchUser(jsonRequest('/api/users/u1', 'PATCH', { role: UserRole.ADMIN }), params('u1'));
    expect(res.status).toBe(200);

    const request = stored('role_requests', 'rr1')!;
    expect(request.status).not.toBe('pending');
    expect(request.admin_notes).toMatch(/ADMIN/);
    // ...so the stale request can no longer be approved.
    const review = await reviewRoleRequest(jsonRequest('/api/role-requests/rr1', 'PATCH', { status: 'approved' }), params('rr1'));
    expect(review.status).not.toBe(200);
    expect(stored('users', 'u1')!.role).toBe(UserRole.ADMIN);
  });

  it('lists requests with the live role next to the snapshot', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.GUEST, { is_active: false }));
    db.role_requests.docs.push(
      pendingRequest('rr1', 'u1', UserRole.VIEWER, UserRole.ADMIN),
      pendingRequest('rr2', 'gone', UserRole.VIEWER, UserRole.EDITOR),
    );

    const res = await listRoleRequests(jsonRequest('/api/role-requests?status=pending', 'GET'));
    const { requests } = await res.json();

    expect(requests.find((r: Doc) => r.id === 'rr1')).toMatchObject({ current_role: 'viewer', live_role: 'guest', live_is_active: false });
    expect(requests.find((r: Doc) => r.id === 'rr2')).toMatchObject({ live_role: null, live_is_active: null });
  });
});

describe('#118 user administration is audit-logged', () => {
  const entries = (action: string) => db.audit_logs.docs.filter(entry => entry.action === action);

  it('records a direct role change: who, whom, from, to, and the client address', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.VIEWER));

    await patchUser(jsonRequest('/api/users/u1', 'PATCH', { role: UserRole.ADMIN }), params('u1'));

    expect(entries('user.role_change')).toEqual([
      expect.objectContaining({
        actor_id: 'admin1',
        actor_email: 'admin1@example.test',
        target_id: 'u1',
        ip: '198.51.100.44',
        metadata: expect.objectContaining({ fromRole: UserRole.VIEWER, toRole: UserRole.ADMIN }),
      }),
    ]);
  });

  it('records deactivation and reactivation', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.EDITOR));

    await patchUser(jsonRequest('/api/users/u1', 'PATCH', { is_active: false }), params('u1'));
    await patchUser(jsonRequest('/api/users/u1', 'PATCH', { is_active: true }), params('u1'));

    expect(entries('user.deactivate')).toEqual([expect.objectContaining({ actor_id: 'admin1', target_id: 'u1' })]);
    expect(entries('user.activate')).toEqual([expect.objectContaining({ actor_id: 'admin1', target_id: 'u1' })]);
  });

  it('does not log a role change that changed nothing', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.EDITOR));

    await patchUser(jsonRequest('/api/users/u1', 'PATCH', { role: UserRole.EDITOR, name: 'Renamed' }), params('u1'));

    expect(entries('user.role_change')).toHaveLength(0);
  });

  it("records a deletion with the deleted account's identity", async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.EDITOR));

    const res = await deleteUser(jsonRequest('/api/users/u1', 'DELETE'), params('u1'));

    expect(res.status).toBe(200);
    expect(entries('user.delete')).toEqual([
      expect.objectContaining({
        actor_id: 'admin1',
        target_id: 'u1',
        metadata: expect.objectContaining({ email: 'u1@example.test', role: UserRole.EDITOR }),
      }),
    ]);
  });

  it('records a rejected role request as a rejection, not as a role change', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.VIEWER));
    db.role_requests.docs.push(pendingRequest('rr1', 'u1', UserRole.VIEWER, UserRole.EDITOR));

    await reviewRoleRequest(jsonRequest('/api/role-requests/rr1', 'PATCH', { status: 'rejected' }), params('rr1'));

    expect(entries('user.role_change')).toHaveLength(0);
    expect(entries('role_request.reject')).toEqual([
      expect.objectContaining({ actor_id: 'admin1', target_id: 'u1', ip: '198.51.100.44' }),
    ]);
  });

  it('gives every entry its own id (audit_logs has a unique index on id)', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('u1', UserRole.VIEWER));

    await patchUser(jsonRequest('/api/users/u1', 'PATCH', { role: UserRole.EDITOR, is_active: false }), params('u1'));

    const ids = db.audit_logs.docs.map(entry => entry.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('#121 admins cannot lock the system out of administration', () => {
  const activeAdmins = () => db.users.docs.filter(doc => doc.role === UserRole.ADMIN && doc.is_active !== false);

  it('refuses self-demotion and self-deactivation, but allows editing your own name', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('admin2', UserRole.ADMIN));

    const demote = await patchUser(jsonRequest('/api/users/admin1', 'PATCH', { role: UserRole.VIEWER }), params('admin1'));
    const deactivate = await patchUser(jsonRequest('/api/users/admin1', 'PATCH', { is_active: false }), params('admin1'));
    const rename = await patchUser(jsonRequest('/api/users/admin1', 'PATCH', { name: 'Still Admin' }), params('admin1'));

    expect(demote.status).toBe(400);
    expect(deactivate.status).toBe(400);
    expect(rename.status).toBe(200);
    expect(stored('users', 'admin1')).toMatchObject({ role: UserRole.ADMIN, is_active: true, name: 'Still Admin' });
  });

  it('refuses to demote the last active admin (acting admin revoked since the session check)', async () => {
    // The caller passed requireAdmin, but their own account has since been deactivated.
    setUsers(user('admin1', UserRole.ADMIN, { is_active: false }), user('admin2', UserRole.ADMIN));

    const res = await patchUser(jsonRequest('/api/users/admin2', 'PATCH', { role: UserRole.EDITOR }), params('admin2'));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/at least one active administrator/i);
    expect(stored('users', 'admin2')).toMatchObject({ role: UserRole.ADMIN, is_active: true });
    expect(db.audit_logs.docs.filter(e => e.action === 'user.role_change')).toHaveLength(0);
  });

  it('refuses to deactivate or delete the last active admin', async () => {
    setUsers(user('admin1', UserRole.ADMIN, { is_active: false }), user('admin2', UserRole.ADMIN));

    const deactivate = await patchUser(jsonRequest('/api/users/admin2', 'PATCH', { is_active: false }), params('admin2'));
    const remove = await deleteUser(jsonRequest('/api/users/admin2', 'DELETE'), params('admin2'));

    expect(deactivate.status).toBe(409);
    expect(remove.status).toBe(409);
    expect(stored('users', 'admin2')).toMatchObject({ role: UserRole.ADMIN, is_active: true });
  });

  it('keeps an active admin when two admins demote each other at the same time', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('admin2', UserRole.ADMIN));
    const second = { ...ADMIN, id: 'admin2', email: 'admin2@example.test', name: 'Admin Two' };
    (requireAdmin as jest.Mock)
      .mockResolvedValueOnce({ session: { user: ADMIN }, user: ADMIN })
      .mockResolvedValueOnce({ session: { user: second }, user: second });

    const responses = await Promise.all([
      patchUser(jsonRequest('/api/users/admin2', 'PATCH', { role: UserRole.VIEWER }), params('admin2')),
      patchUser(jsonRequest('/api/users/admin1', 'PATCH', { role: UserRole.VIEWER }), params('admin1')),
    ]);

    expect(activeAdmins().length).toBeGreaterThanOrEqual(1);
    expect(responses.filter(r => r.status === 200).length).toBeLessThanOrEqual(1);
  });

  it('keeps an active admin when two admins delete each other at the same time', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('admin2', UserRole.ADMIN));
    const second = { ...ADMIN, id: 'admin2', email: 'admin2@example.test', name: 'Admin Two' };
    (requireAdmin as jest.Mock)
      .mockResolvedValueOnce({ session: { user: ADMIN }, user: ADMIN })
      .mockResolvedValueOnce({ session: { user: second }, user: second });

    await Promise.all([
      deleteUser(jsonRequest('/api/users/admin2', 'DELETE'), params('admin2')),
      deleteUser(jsonRequest('/api/users/admin1', 'DELETE'), params('admin1')),
    ]);

    expect(activeAdmins().length).toBeGreaterThanOrEqual(1);
  });

  it('still lets an admin demote another admin while one remains', async () => {
    setUsers(user('admin1', UserRole.ADMIN), user('admin2', UserRole.ADMIN));

    const res = await patchUser(jsonRequest('/api/users/admin2', 'PATCH', { role: UserRole.EDITOR }), params('admin2'));

    expect(res.status).toBe(200);
    expect(stored('users', 'admin2')!.role).toBe(UserRole.EDITOR);
  });
});
