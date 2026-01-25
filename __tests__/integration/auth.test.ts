/**
 * Integration tests for authentication flows
 *
 * These tests verify the complete authentication workflow including:
 * - User registration
 * - Login/logout
 * - Password change
 * - Password reset flow
 * - Role-based access control
 */

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
  },
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { getCollection } from '@/lib/mongodb';
import { getSession, requireAdmin, requireEditor } from '@/lib/auth/middleware';

describe('Authentication Integration Tests', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Registration', () => {
    const mockInsertOne = jest.fn();
    const mockFindOne = jest.fn();

    beforeEach(() => {
      (getCollection as jest.Mock).mockResolvedValue({
        insertOne: mockInsertOne,
        findOne: mockFindOne,
      });
    });

    it('should register a new user with valid credentials', async () => {
      // Arrange
      mockFindOne.mockResolvedValue(null); // No existing user
      mockInsertOne.mockResolvedValue({ insertedId: 'new-user-id' });

      const requestBody = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        name: 'New User',
      };

      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
      expect(mockInsertOne).toHaveBeenCalled();
    });

    it('should reject registration with existing email', async () => {
      // Arrange
      mockFindOne.mockResolvedValue({ email: 'existing@example.com' });

      const requestBody = {
        email: 'existing@example.com',
        password: 'SecurePassword123!',
        name: 'Existing User',
      };

      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(409);
      expect(body.error).toContain('already exists');
    });

    it('should reject registration with weak password', async () => {
      // Arrange
      mockFindOne.mockResolvedValue(null);

      const requestBody = {
        email: 'newuser@example.com',
        password: 'weak', // Too short
        name: 'New User',
      };

      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject registration with invalid email', async () => {
      // Arrange
      const requestBody = {
        email: 'not-an-email',
        password: 'SecurePassword123!',
        name: 'New User',
      };

      // Act
      const { POST } = await import('@/app/api/auth/register/route');
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('Password Change', () => {
    const mockFindOne = jest.fn();
    const mockUpdateOne = jest.fn();

    beforeEach(() => {
      (getCollection as jest.Mock).mockResolvedValue({
        findOne: mockFindOne,
        updateOne: mockUpdateOne,
      });
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
      mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

      const requestBody = {
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewSecurePassword456!',
      };

      // Act
      const { POST } = await import('@/app/api/auth/change-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockUpdateOne).toHaveBeenCalled();
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

      const requestBody = {
        currentPassword: 'WrongPassword!',
        newPassword: 'NewSecurePassword456!',
      };

      // Act
      const { POST } = await import('@/app/api/auth/change-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject password change for unauthenticated user', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const requestBody = {
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewSecurePassword456!',
      };

      // Act
      const { POST } = await import('@/app/api/auth/change-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('Role-Based Access Control', () => {
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
  const mockFindOne = jest.fn();
  const mockInsertOne = jest.fn();
  const mockUpdateOne = jest.fn();
  const mockUpdateMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getCollection as jest.Mock).mockResolvedValue({
      findOne: mockFindOne,
      insertOne: mockInsertOne,
      updateOne: mockUpdateOne,
      updateMany: mockUpdateMany,
    });
  });

  describe('Forgot Password', () => {
    it('should create reset token for valid email', async () => {
      // Arrange
      mockFindOne.mockResolvedValue({
        id: 'user-123',
        email: 'user@example.com',
      });
      mockInsertOne.mockResolvedValue({ insertedId: 'token-123' });

      const requestBody = { email: 'user@example.com' };

      // Act
      const { POST } = await import('@/app/api/auth/forgot-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert - Should return 200 even if email doesn't exist (security)
      expect(response.status).toBe(200);
    });

    it('should not reveal if email exists', async () => {
      // Arrange
      mockFindOne.mockResolvedValue(null); // User doesn't exist

      const requestBody = { email: 'nonexistent@example.com' };

      // Act
      const { POST } = await import('@/app/api/auth/forgot-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);
      const body = await response.json();

      // Assert - Same response for existing and non-existing emails
      expect(response.status).toBe(200);
      expect(body.message).toBeDefined();
    });
  });

  describe('Reset Password', () => {
    it('should reset password with valid token', async () => {
      // Arrange
      mockFindOne.mockResolvedValue({
        id: 'token-123',
        user_id: 'user-123',
        token_hash: 'hashed_token',
        expires_at: new Date(Date.now() + 3600000), // 1 hour from now
        used: false,
      });
      mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
      mockUpdateMany.mockResolvedValue({ modifiedCount: 1 });

      const requestBody = {
        token: 'valid_token',
        newPassword: 'NewSecurePassword123!',
      };

      // Act
      const { POST } = await import('@/app/api/auth/reset-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should reject expired token', async () => {
      // Arrange
      mockFindOne.mockResolvedValue({
        id: 'token-123',
        user_id: 'user-123',
        token_hash: 'hashed_token',
        expires_at: new Date(Date.now() - 3600000), // Expired 1 hour ago
        used: false,
      });

      const requestBody = {
        token: 'expired_token',
        newPassword: 'NewSecurePassword123!',
      };

      // Act
      const { POST } = await import('@/app/api/auth/reset-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject already used token', async () => {
      // Arrange
      mockFindOne.mockResolvedValue({
        id: 'token-123',
        user_id: 'user-123',
        token_hash: 'hashed_token',
        expires_at: new Date(Date.now() + 3600000),
        used: true, // Already used
      });

      const requestBody = {
        token: 'used_token',
        newPassword: 'NewSecurePassword123!',
      };

      // Act
      const { POST } = await import('@/app/api/auth/reset-password/route');
      const request = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });
  });
});
