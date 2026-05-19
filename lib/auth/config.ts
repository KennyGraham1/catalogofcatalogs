/**
 * NextAuth Configuration
 * Configures authentication with MongoDB, JWT, and credentials provider
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUserByEmail, verifyPassword, updateLastLogin, toSafeUser, isJwtVersionValid } from './utils';
import { UserRole } from './types';
import { writeAuditLog } from '../audit';

// Validate NEXTAUTH_SECRET at module load time
// This ensures the application fails fast if the secret is not configured
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET environment variable is not set. ' +
      'Please set a secure random string (at least 32 characters) for JWT signing. ' +
      'You can generate one using: openssl rand -base64 32'
    );
  }

  if (secret.length < 32) {
    console.warn(
      '[Auth] Warning: NEXTAUTH_SECRET should be at least 32 characters for security. ' +
      'Current length: ' + secret.length
    );
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'user@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        // Get user from database
        const user = await getUserByEmail(credentials.email);

        if (!user) {
          await writeAuditLog({ action: 'user.login_failed', metadata: { reason: 'user_not_found' } });
          throw new Error('Invalid email or password');
        }

        // Check if user is active
        if (!user.is_active) {
          await writeAuditLog({ action: 'user.login_failed', target_id: user.id, metadata: { reason: 'account_disabled' } });
          throw new Error('Account is disabled. Please contact an administrator.');
        }

        // Verify password
        const isValid = await verifyPassword(credentials.password, user.password_hash);

        if (!isValid) {
          await writeAuditLog({ action: 'user.login_failed', target_id: user.id, metadata: { reason: 'bad_password' } });
          throw new Error('Invalid email or password');
        }

        // Update last login
        await updateLastLogin(user.id);
        await writeAuditLog({ action: 'user.login', actor_id: user.id, actor_email: user.email });

        // Return safe user data
        const safeUser = toSafeUser(user);

        return {
          id: safeUser.id,
          email: safeUser.email,
          name: safeUser.name,
          role: safeUser.role,
          jwtVersion: (user as any).jwt_version ?? 0,
        };
      },
    }),
  ],
  
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // First sign-in: embed role and jwt_version into the token.
        token.id = user.id;
        token.role = (user as any).role;
        token.jwtVersion = (user as any).jwtVersion ?? 0;
        return token;
      }

      // Subsequent calls (session refresh): validate that the stored jwt_version
      // still matches. If the user changed their password, the version was bumped
      // and this token is now invalid.
      if (token.id && typeof token.jwtVersion === 'number') {
        const valid = await isJwtVersionValid(token.id as string, token.jwtVersion as number);
        if (!valid) return null as any; // signals NextAuth to destroy the session
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  
  secret: process.env.NEXTAUTH_SECRET,
  
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Helper function to get server-side session
 */
export { getServerSession } from 'next-auth';
