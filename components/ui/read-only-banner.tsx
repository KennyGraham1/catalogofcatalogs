'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth/hooks';
import { loginHref } from '@/lib/auth/login-href';
import { registerHref, requestAccessHref } from '@/lib/auth/access-request';
import { Button } from '@/components/ui/button';

const HIDDEN_PATHS = new Set(['/login', '/register']);

export function ReadOnlyBanner() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading || isAuthenticated || HIDDEN_PATHS.has(pathname)) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Read-only mode"
      className="border-b border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="container flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            You are in read-only mode. Uploading, importing, merging and editing catalogues
            need Editor access, which an administrator grants on request after you sign in.{' '}
            <Link
              href={requestAccessHref(false)}
              className="whitespace-nowrap font-medium underline underline-offset-4 hover:no-underline"
            >
              Request Editor access
            </Link>
          </p>
        </div>
        {/* From lg the header shows Login and Sign Up itself; below, they are in its menu. */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Button asChild size="sm" variant="outline">
            <Link href={loginHref(pathname)}>
              <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
              Login
            </Link>
          </Button>
          <Button asChild size="sm" variant="default">
            <Link href={registerHref(pathname)}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Sign Up
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
