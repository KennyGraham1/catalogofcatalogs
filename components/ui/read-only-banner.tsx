 'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth/hooks';
import { Button } from '@/components/ui/button';

const HIDDEN_PATHS = new Set(['/login', '/register']);

export function ReadOnlyBanner() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading || isAuthenticated || HIDDEN_PATHS.has(pathname)) {
    return null;
  }

  return (
    <div className="border-b bg-amber-50 text-amber-900">
      <div className="container flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>
            You are in read-only mode. Log in to upload, merge, import, or edit catalogues.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              Login
            </Link>
          </Button>
          <Button asChild size="sm" variant="default">
            <Link href="/register">
              <UserPlus className="mr-2 h-4 w-4" />
              Sign Up
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
