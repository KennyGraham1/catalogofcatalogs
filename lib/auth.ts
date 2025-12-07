/**
 * NextAuth.js v4 Configuration
 * 
 * This file contains the authentication configuration for NextAuth.js v4.
 */

import type { NextAuthOptions, User } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getUserByEmail, updateLastLogin } from './auth-db';
import { generateCSRFToken } from './csrf';

/**
 * Login schema validation
 */
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * NextAuth.js configuration options
 */
export const authOptions: NextAuthOptions = {
  // Configure authentication pages
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },

  // Configure authentication providers
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Validate credentials
        const validatedFields = loginSchema.safeParse(credentials);

        if (!validatedFields.success) {
          return null;
        }

        const { email, password } = validatedFields.data;

        try {
          // Get user from database
          const user = await getUserByEmail(email);

          if (!user) {
            return null;
          }

          // Check if user is active
          if (!user.is_active) {
            return null;
          }

          // Verify password
          const passwordsMatch = await bcrypt.compare(password, user.password_hash);

          if (!passwordsMatch) {
            return null;
          }

          // Update last login
          await updateLastLogin(user.id);

          // Return user object (without password)
          return {
            id: user.id,
            email: user.email!,
            name: user.name,
            role: user.role,
          } as User & { role: string };
        } catch (error) {
          console.error('[Auth] Error during authorization:', error);
          return null;
        }
      },
    }),
  ],

  // Configure callbacks
  callbacks: {
    /**
     * JWT callback - called whenever a JWT is created or updated
     */
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.email = user.email;
        if (user.name) {
          token.name = user.name;
        }
      }

      // Generate CSRF token if not present
      if (!token.csrfToken) {
        token.csrfToken = generateCSRFToken();
      }

      return token;
    },

    /**
     * Session callback - called whenever a session is checked
     */
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }

      // Add CSRF token to session for client-side access
      (session as any).csrfToken = token.csrfToken as string;

      return session;
    },
  },

  // Session configuration
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Security configuration
  secret: process.env.NEXTAUTH_SECRET,

  // Debug mode (only in development)
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Get the current session
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Get the current user
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

/**
 * Check if user has a specific role
 */
export async function hasRole(role: string): Promise<boolean> {
  const session = await getSession();
  return (session?.user as any)?.role === role;
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  return await hasRole('admin');
}

/**
 * Check if user can edit (admin or editor)
 */
export async function canEdit(): Promise<boolean> {
  const session = await getSession();
  const userRole = (session?.user as any)?.role;
  return userRole === 'admin' || userRole === 'editor';
}

/**
 * Require authentication
 * Throws an error if user is not authenticated
 */
export async function requireAuth() {
  const session = await getSession();
  
  if (!session?.user) {
    throw new Error('Unauthorized: Authentication required');
  }

  return session.user;
}

/**
 * Require a specific role
 * Throws an error if user doesn't have the role
 */
export async function requireRole(role: string) {
  const user = await requireAuth();
  
  if ((user as any).role !== role) {
    throw new Error(`Forbidden: ${role} role required`);
  }

  return user;
}
