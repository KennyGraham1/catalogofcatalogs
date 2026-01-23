/**
 * NextAuth Type Extensions
 * Extends NextAuth types to include custom user fields
 */

import { UserRole } from '@/lib/auth/types';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
  }
}

