/**
 * NextAuth Configuration
 * Configures authentication with MongoDB, JWT, and credentials provider
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUserByEmail, verifyPassword, updateLastLogin, toSafeUser, getSessionUserState } from './utils';
import { UserRole } from './types';
import { writeAuditLog } from '../audit';
import { beginCredentialAttempt } from './login-rate-limit';
import { toHeaders } from '../rate-limiter';
import { AuthErrorCode } from './errors';

// Validate NEXTAUTH_SECRET at module load time so the application fails fast if
// the secret is not configured at runtime. The check is skipped during
// `next build` (NEXT_PHASE === 'phase-production-build'), where importing this
// module to collect page data must not require deployment secrets; the secret
// is still enforced when the server actually runs.
if (
  typeof window === 'undefined' &&
  process.env.NODE_ENV !== 'test' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
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

/**
 * A bcrypt hash (cost 10, as hashPassword uses) of a random secret that was never
 * stored. Sign-in compares against it when the email is unknown, so an unknown email
 * costs the same bcrypt work, and takes the same time, as a wrong password.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$66IzwhFASyioiEBWkRf/IeFfY94GaBg8R0c9XEI5kSiCjrOmneDfu';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'user@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      // Errors are thrown as codes (lib/auth/errors.ts): NextAuth returns the message to
      // the client verbatim, and the sign-in page turns the code into text.
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error(AuthErrorCode.MissingCredentials);
        }

        const email = credentials.email.trim().toLowerCase();
        // Audit entries record the client address, resolved as the limiter resolves it.
        const client = { headers: toHeaders(request.headers) };
        // Check the shared quota before user lookup or expensive bcrypt work.
        const attempt = await beginCredentialAttempt(email, client.headers);
        if (!attempt) {
          throw new Error(AuthErrorCode.TooManyAttempts);
        }

        const user = await getUserByEmail(email);

        if (!user) {
          // Same bcrypt cost as a real check: response time must not reveal whether
          // the account exists.
          await verifyPassword(credentials.password, DUMMY_PASSWORD_HASH);
          await writeAuditLog({ action: 'user.login_failed', metadata: { reason: 'user_not_found' } }, client);
          throw new Error(AuthErrorCode.InvalidCredentials);
        }

        // Verify password first: a wrong password gets the same answer whatever the
        // account's state, so only its owner can learn that it is disabled.
        const isValid = await verifyPassword(credentials.password, user.password_hash);

        if (!isValid) {
          await writeAuditLog({ action: 'user.login_failed', target_id: user.id, metadata: { reason: 'bad_password' } }, client);
          throw new Error(AuthErrorCode.InvalidCredentials);
        }

        // Check if user is active
        if (!user.is_active) {
          await writeAuditLog({ action: 'user.login_failed', target_id: user.id, metadata: { reason: 'account_disabled' } }, client);
          throw new Error(AuthErrorCode.AccountDisabled);
        }

        // Successful sign-ins are not counted against the quota.
        await attempt.succeeded();

        // Update last login
        await updateLastLogin(user.id);
        await writeAuditLog({ action: 'user.login', actor_id: user.id, actor_email: user.email }, client);

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

      // Subsequent calls (session refresh, and every getServerSession() on an
      // API route): re-read the authorisation state from the database instead of
      // trusting the claims baked into the token at sign-in. Without this a
      // demoted admin keeps admin access, and a deactivated account keeps any
      // access at all, until the token expires (24 h).
      if (token.id) {
        const current = await getSessionUserState(token.id as string);

        // Account deleted or deactivated -> revoke. Returning null here does NOT reliably
        // destroy the session: the session callback still receives the prebuilt `session`
        // and returns it, so getServerSession() answers with a truthy user. Mark the token
        // instead and let the session callback refuse it.
        if (!current || !current.isActive) {
          (token as Record<string, unknown>).revoked = true;
          return token;
        }

        // Password change/reset bumps jwt_version; tokens issued before the bump
        // are revoked. A token without a version predates the field and is
        // treated as version 0.
        const tokenVersion = typeof token.jwtVersion === 'number' ? token.jwtVersion : 0;
        if (tokenVersion < current.jwtVersion) {
          (token as Record<string, unknown>).revoked = true;
          return token;
        }
        delete (token as Record<string, unknown>).revoked;

        // Role changes (demotion or promotion) take effect on the next request.
        if (current.role) token.role = current.role;
      }

      return token;
    },

    async session({ session, token }) {
      // A revoked or missing token must not yield a usable session. Every consumer
      // (middleware, getServerSession callers, useSession) tests session.user, so
      // clearing it is what actually closes the gate.
      if (!token || (token as Record<string, unknown>).revoked) {
        return { ...session, user: undefined } as unknown as typeof session;
      }
      if (session.user) {
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
