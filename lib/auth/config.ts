/**
 * NextAuth Configuration
 * Configures authentication with MongoDB, JWT, and credentials provider
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUserByEmail, verifyPassword, updateLastLogin, toSafeUser } from './utils';
import { UserRole } from './types';

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
          throw new Error('Invalid email or password');
        }

        // Check if user is active
        if (!user.is_active) {
          throw new Error('Account is disabled. Please contact an administrator.');
        }

        // Verify password
        const isValid = await verifyPassword(credentials.password, user.password_hash);
        
        if (!isValid) {
          throw new Error('Invalid email or password');
        }

        // Update last login
        await updateLastLogin(user.id);

        // Return safe user data
        const safeUser = toSafeUser(user);
        
        return {
          id: safeUser.id,
          email: safeUser.email,
          name: safeUser.name,
          role: safeUser.role,
        };
      },
    }),
  ],
  
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  
  callbacks: {
    async jwt({ token, user }) {
      // Add user data to token on sign in
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    
    async session({ session, token }) {
      // Add user data to session
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
