/**
 * NextAuth.js Type Extensions
 * 
 * This file extends the default NextAuth types to include our custom fields.
 */

import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * Extend the default Session interface
   */
  interface Session {
    user: {
      id: string;
      role: string;
      email: string;
      name: string;
    } & DefaultSession['user'];
  }

  /**
   * Extend the default User interface
   */
  interface User {
    id: string;
    email: string;
    name: string | null;
    role: string;
    emailVerified: Date | null;
  }
}

declare module 'next-auth/jwt' {
  /**
   * Extend the default JWT interface
   */
  interface JWT {
    id: string;
    role: string;
    email: string;
    name: string;
  }
}

