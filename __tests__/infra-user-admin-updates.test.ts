/**
 * @jest-environment node
 *
 * PATCH /api/users/[id] — deactivation has to be stored as a real boolean.
 *
 * `is_active` is read back as a truthiness test at login (lib/auth/config.ts)
 * and in getSessionUserState, so a string "false" would leave the account fully
 * active while the admin UI showed it as disabled.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireAdmin: jest.fn(),
  requireEditor: jest.fn(),
  requireViewer: jest.fn(),
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: { USERS: 'users' },
}));

import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth/middleware';

function mockAdmin() {
  const user = { id: 'admin1', email: 'admin@example.com', role: 'admin' };
  (requireAdmin as jest.Mock).mockResolvedValue({ session: { user }, user });
}

function mockUsersCollection() {
  const collection = {
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    findOne: jest.fn().mockResolvedValue({ id: 'u1', role: 'viewer', is_active: false }),
  };
  (getCollection as jest.Mock).mockResolvedValue(collection);
  return collection;
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/users/u1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'u1' }) };

describe('PATCH /api/users/[id] — is_active validation', () => {
  beforeEach(() => mockAdmin());

  it('rejects a non-boolean is_active instead of storing a truthy string', async () => {
    const collection = mockUsersCollection();
    const { PATCH } = await import('@/app/api/users/[id]/route');

    const res = await PATCH(patchRequest({ is_active: 'false' }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('is_active must be a boolean');
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('stores a boolean deactivation', async () => {
    const collection = mockUsersCollection();
    const { PATCH } = await import('@/app/api/users/[id]/route');

    const res = await PATCH(patchRequest({ is_active: false }), params);

    expect(res.status).toBe(200);
    expect(collection.updateOne).toHaveBeenCalledWith(
      { id: 'u1' },
      { $set: expect.objectContaining({ is_active: false }) },
    );
  });
});
