/**
 * @jest-environment node
 *
 * Integration tests for authentication flows
 *
 * These tests verify the complete authentication workflow including:
 * - User registration
 * - Password change
 * - Password reset flow
 * - Role-based access control
 *
 * The real route handlers and auth helpers run against per-test MongoDB mocks.
 *
 * This suite used to run in the project's default jsdom environment, where Request is
 * undefined, so every test was silently skipped; when forced to run, four expectations
 * were stale (finding #120). It now declares the node environment, sends each request
 * from its own client address (the auth routes' per-IP limiter would otherwise carry
 * over between tests), and mocks the reset-token store the way the route uses it.
 */

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Mock NextAuth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

// Mock MongoDB
jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  getCollection: jest.fn(),
  COLLECTIONS: {
    USERS: 'users',
    SESSIONS: 'sessions',
    PASSWORD_RESET_TOKENS: 'password_reset_tokens',
    AUDIT_LOGS: 'audit_logs',
    AUTH_RATE_LIMITS: 'auth_rate_limits',
  },
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { getCollection } from '@/lib/mongodb';
import { getSession, requireAdmin, requireEditor } from '@/lib/auth/middleware';

type MockCollection = Record<string, jest.Mock>;

/** Route getCollection(name) to this test's collection mocks. */
function useCollections(map: Record<string, MockCollection>) {
  const collections: Record<string, MockCollection> = {
    // Side collections the routes write to; not under test here.
    audit_logs: { insertOne: jest.fn().mockResolvedValue({ acknowledged: true }) },
    auth_rate_limits: {
      createIndex: jest.fn().mockResolvedValue('expires_at_1'),
      findOneAndUpdate: jest.fn().mockResolvedValue({ attempts: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    },
    ...map,
  };
  (getCollection as jest.Mock).mockImplementation(async (name: string) => {
    if (!collections[name]) throw new Error(`unexpected collection ${name}`);
    return collections[name];
  });
}

let nextClient = 0;

/** A JSON POST from its own client address. */
function post(url: string, body: unknown): NextRequest {
  nextClient += 1;
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${nextClient}` },
    body: JSON.stringify(body),
  });
}

describe('Authentication Integration Tests', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Registration', () => {
    const mockInsertOne = jest.fn();
    const mockFindOne = jest.fn();

    beforeEach(() => {
      useCollections({ users: { insertOne: mockInsertOne, findOne: mockFindOne } });
    });

    it('should register a new user with valid credentials', async () => {
      // Arrange
      mockFindOne.mockResolvedValue(null); // No existing user
      mockInsertOne.mockResolvedValue({ insertedId: 'new-user-id' });

      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const response = await POST(post('/api/auth/register', {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        name: 'New User',
      }));

      // Assert
      expect(response.status).toBe(201);
      expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({
        email: 'newuser@example.com',
        role: 'viewer',
        password_hash: 'hashed_password',
      }));
    });

    it('should reject registration with existing email', async () => {
      // Arrange
      mockFindOne.mockResolvedValue({ email: 'existing@example.com' });

      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const response = await POST(post('/api/auth/register', {
        email: 'existing@example.com',
        password: 'SecurePassword123!',
        name: 'Existing User',
      }));
      const body = await response.json();

      // Assert
      expect(response.status).toBe(409);
      expect(body.error).toContain('already exists');
      expect(mockInsertOne).not.toHaveBeenCalled();
    });

    it('should reject registration with weak password', async () => {
      // Arrange
      mockFindOne.mockResolvedValue(null);

      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const response = await POST(post('/api/auth/register', {
        email: 'newuser@example.com',
        password: 'weak', // Too short
        name: 'New User',
      }));

      // Assert
      expect(response.status).toBe(400);
      expect(mockInsertOne).not.toHaveBeenCalled();
    });

    it('should reject registration with invalid email', async () => {
      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const response = await POST(post('/api/auth/register', {
        email: 'not-an-email',
        password: 'SecurePassword123!',
        name: 'New User',
      }));

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('Password Change', () => {
    const mockFindOne = jest.fn();
    const mockUpdateOne = jest.fn();

    beforeEach(() => {
      useCollections({ users: { findOne: mockFindOne, updateOne: mockUpdateOne } });
    });

    it('should change password with valid current password', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
      });

      mockFindOne.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        password_hash: 'current_hash',
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      // Act
      const { POST } = await import('@/app/api/auth/change-password/route');
      const response = await POST(post('/api/auth/change-password', {
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewSecurePassword456!',
      }));

      // Assert: the hash and the session version change in one conditional write.
      expect(response.status).toBe(200);
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { id: 'user-123', password_hash: 'current_hash' },
        {
          $set: { password_hash: 'hashed_password', updated_at: expect.any(String) },
          $inc: { jwt_version: 1 },
        },
      );
    });

    it('should reject password change with incorrect current password', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com' },
      });

      mockFindOne.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
        password_hash: 'current_hash',
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Act
      const { POST } = await import('@/app/api/auth/change-password/route');
      const response = await POST(post('/api/auth/change-password', {
        currentPassword: 'WrongPassword!',
        newPassword: 'NewSecurePassword456!',
      }));

      // Assert: a wrong field, not a missing session (the route used to answer 401).
      expect(response.status).toBe(400);
      expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    it('should reject password change for unauthenticated user', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(null);

      // Act
      const { POST } = await import('@/app/api/auth/change-password/route');
      const response = await POST(post('/api/auth/change-password', {
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewSecurePassword456!',
      }));

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('Role-Based Access Control', () => {
    const mockFindOne = jest.fn();

    beforeEach(() => {
      useCollections({ users: { findOne: mockFindOne } });
    });

    it('should allow admin to access admin routes', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'admin-123', email: 'admin@example.com', role: 'admin' },
      });

      mockFindOne.mockResolvedValue({
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
        is_active: true,
      });

      const request = new NextRequest('http://localhost:3000/api/admin');

      // Act
      const result = await requireAdmin(request);

      // Assert
      expect(result).not.toBeInstanceOf(NextResponse);
      if (result instanceof NextResponse) {
        throw new Error('Expected admin access to be granted');
      }
      expect(result.user.role).toBe('admin');
    });

    it('should deny viewer access to write operations', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });

      const request = new NextRequest('http://localhost:3000/api/catalogues');

      // Act
      const result = await requireEditor(request);

      // Assert
      expect(result).toBeInstanceOf(NextResponse);
      if (result instanceof NextResponse) {
        expect(result.status).toBe(403);
      }
    });

    it('should allow editor to create catalogues but not manage users', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      const request = new NextRequest('http://localhost:3000/api/catalogues');

      // Act
      const editorResult = await requireEditor(request);
      const adminResult = await requireAdmin(request);

      // Assert
      expect(editorResult).not.toBeInstanceOf(NextResponse);
      if (editorResult instanceof NextResponse) {
        throw new Error('Expected editor access to be granted');
      }
      expect(editorResult.user.role).toBe('editor');

      expect(adminResult).toBeInstanceOf(NextResponse);
      if (adminResult instanceof NextResponse) {
        expect(adminResult.status).toBe(403);
      }
    });
  });

  describe('Session Management', () => {
    it('should return user info for authenticated session', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'user@example.com',
          name: 'Test User',
          role: 'viewer',
        },
      });

      const request = new NextRequest('http://localhost:3000/api/session');

      // Act
      const session = await getSession(request);

      // Assert
      expect(session).toBeDefined();
      expect(session?.user.email).toBe('user@example.com');
    });

    it('should return null for unauthenticated request', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/session');

      // Act
      const session = await getSession(request);

      // Assert
      expect(session).toBeNull();
    });
  });
});

describe('Password Reset Flow', () => {
  const GENERIC_REPLY = 'If an account exists for that email, a reset link has been sent.';
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  describe('Forgot Password', () => {
    it('should create reset token for valid email', async () => {
      // Arrange
      const earlierLinks = [{ id: 'reset-old-1' }]; // beyond the newest three
      const cursor: Record<'sort' | 'skip' | 'project' | 'toArray', jest.Mock> = {
        sort: jest.fn(() => cursor),
        skip: jest.fn(() => cursor),
        project: jest.fn(() => cursor),
        toArray: jest.fn().mockResolvedValue(earlierLinks),
      };
      const tokens = {
        find: jest.fn(() => cursor),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        insertOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      };
      useCollections({
        users: { findOne: jest.fn().mockResolvedValue({ id: 'user-123', email: 'user@example.com', is_active: true }) },
        password_reset_tokens: tokens,
      });

      // Act
      const { POST } = await import('@/app/api/auth/forgot-password/route');
      const response = await POST(post('/api/auth/forgot-password', { email: 'user@example.com' }));

      // Assert: same reply either way; only the token's hash is stored.
      expect(response.status).toBe(200);
      expect((await response.json()).message).toBe(GENERIC_REPLY);
      expect(tokens.insertOne).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user-123',
        token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        used_at: null,
        expires_at: expect.any(Date),
      }));
      // Earlier links stay valid; only those beyond the newest three are removed.
      expect(tokens.find).toHaveBeenCalledWith({ user_id: 'user-123' });
      expect(cursor.skip).toHaveBeenCalledWith(3);
      expect(tokens.deleteMany).toHaveBeenCalledWith({ id: { $in: ['reset-old-1'] } });
    });

    it('should not reveal if email exists', async () => {
      // Arrange
      const tokens = { deleteMany: jest.fn(), insertOne: jest.fn() };
      useCollections({
        users: { findOne: jest.fn().mockResolvedValue(null) }, // User doesn't exist
        password_reset_tokens: tokens,
      });

      // Act
      const { POST } = await import('@/app/api/auth/forgot-password/route');
      const response = await POST(post('/api/auth/forgot-password', { email: 'nonexistent@example.com' }));
      const body = await response.json();

      // Assert - Same response for existing and non-existing emails
      expect(response.status).toBe(200);
      expect(body.message).toBe(GENERIC_REPLY);
      expect(tokens.insertOne).not.toHaveBeenCalled();
    });
  });

  describe('Reset Password', () => {
    /**
     * A token store that answers the route's findOne filter the way MongoDB would
     * (token_hash match, used_at null, expires_at in the future).
     */
    function tokenStore(doc: Record<string, any>) {
      return {
        findOne: jest.fn(async (filter: Record<string, any>) => (
          filter.token_hash === doc.token_hash &&
          filter.used_at === null && doc.used_at === null &&
          doc.expires_at > filter.expires_at.$gt
        ) ? { ...doc } : null),
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        updateMany: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
      };
    }

    function usersStore() {
      return {
        findOne: jest.fn().mockResolvedValue({ id: 'user-123', email: 'user@example.com', password_hash: 'old_hash' }),
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
      };
    }

    const tokenDoc = (overrides: Record<string, unknown>) => ({
      id: 'token-123',
      user_id: 'user-123',
      token_hash: sha256('the_token'),
      expires_at: new Date(Date.now() + 3600000), // 1 hour from now
      used_at: null,
      ...overrides,
    });

    it('should reset password with valid token', async () => {
      // Arrange
      const tokens = tokenStore(tokenDoc({}));
      const users = usersStore();
      useCollections({ users, password_reset_tokens: tokens });

      // Act
      const { POST } = await import('@/app/api/auth/reset-password/route');
      const response = await POST(post('/api/auth/reset-password', {
        token: 'the_token',
        newPassword: 'NewSecurePassword123!',
      }));

      // Assert: the token is claimed atomically, then hash and session version change together.
      expect(response.status).toBe(200);
      expect(tokens.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'token-123', used_at: null, expires_at: { $gt: expect.any(Date) } }),
        { $set: { used_at: expect.any(Date) } },
      );
      expect(users.updateOne).toHaveBeenCalledWith(
        { id: 'user-123', password_hash: 'old_hash' },
        { $set: { password_hash: 'hashed_password', updated_at: expect.any(String) }, $inc: { jwt_version: 1 } },
      );
    });

    it('should reject expired token', async () => {
      // Arrange
      const users = usersStore();
      useCollections({
        users,
        password_reset_tokens: tokenStore(tokenDoc({ expires_at: new Date(Date.now() - 3600000) })), // Expired 1 hour ago
      });

      // Act
      const { POST } = await import('@/app/api/auth/reset-password/route');
      const response = await POST(post('/api/auth/reset-password', {
        token: 'the_token',
        newPassword: 'NewSecurePassword123!',
      }));

      // Assert
      expect(response.status).toBe(400);
      expect(users.updateOne).not.toHaveBeenCalled();
    });

    it('should reject already used token', async () => {
      // Arrange
      const users = usersStore();
      useCollections({
        users,
        password_reset_tokens: tokenStore(tokenDoc({ used_at: new Date(Date.now() - 60000) })), // Already used
      });

      // Act
      const { POST } = await import('@/app/api/auth/reset-password/route');
      const response = await POST(post('/api/auth/reset-password', {
        token: 'the_token',
        newPassword: 'NewSecurePassword123!',
      }));

      // Assert
      expect(response.status).toBe(400);
      expect(users.updateOne).not.toHaveBeenCalled();
    });
  });
});
