/**
 * NextAuth.js API Route Handler
 *
 * This file handles all NextAuth.js authentication requests.
 *
 * Note: Rate limiting is handled at the middleware level to avoid
 * interfering with NextAuth's request parsing.
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
