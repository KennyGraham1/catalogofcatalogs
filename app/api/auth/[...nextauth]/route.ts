/**
 * NextAuth.js API Route Handler
 * 
 * This file handles all NextAuth.js authentication requests.
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
