'use client';

import Link from 'next/link';
import { ShieldAlert, LogIn, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth/hooks';
import { Permission, UserRole } from '@/lib/auth/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingCard } from '@/components/ui/loading-spinner';

interface AuthGateAction {
  label: string;
  href: string;
}

interface AuthGateCardProps {
  title?: string;
  description?: string;
  requiredRole?: UserRole;
  requiredPermission?: Permission;
  action?: AuthGateAction;
  secondaryAction?: AuthGateAction;
}

export function AuthGateCard({
  title,
  description,
  requiredRole,
  requiredPermission,
  action,
  secondaryAction,
}: AuthGateCardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <LoadingCard text="Checking access..." className="w-full max-w-xl" />
      </div>
    );
  }

  const resolvedTitle =
    title ?? (isAuthenticated ? 'Access restricted' : 'Authentication required');
  const resolvedDescription =
    description ??
    (isAuthenticated
      ? 'Your account does not have access to this page.'
      : 'Please log in to continue.');

  const resolvedAction =
    action ??
    (!isAuthenticated ? { label: 'Log in', href: '/login' } : undefined);
  const resolvedSecondaryAction =
    secondaryAction ??
    (!isAuthenticated ? { label: 'Sign up', href: '/register' } : undefined);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-[1px] shadow-lg shadow-primary/10">
          <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-card/95">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
            <CardHeader className="relative space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{resolvedTitle}</CardTitle>
                    <CardDescription>{resolvedDescription}</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="uppercase tracking-wide">
                  Protected
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <Link
                href="/login"
                className="block rounded-lg border bg-muted/40 p-3 transition hover:border-primary/50 hover:bg-muted/60"
                aria-label="Open login page"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">
                      {isAuthenticated ? 'Signed in' : 'Not signed in'}
                    </div>
                    <div className="text-muted-foreground">
                      {isAuthenticated ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{user?.name || user?.email || 'User'}</span>
                          {user?.role && (
                            <Badge variant="secondary">{user.role.toUpperCase()}</Badge>
                          )}
                        </div>
                      ) : (
                        <span>Sign in to unlock protected actions and settings.</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>

              {(requiredRole || requiredPermission) && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {requiredRole && (
                    <Badge variant="outline">Role: {requiredRole.toUpperCase()}</Badge>
                  )}
                  {requiredPermission && (
                    <Badge variant="outline">Permission: {requiredPermission}</Badge>
                  )}
                </div>
              )}

              {(resolvedAction || resolvedSecondaryAction) && (
                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                  {resolvedAction && (
                    <Button asChild className="shadow-sm">
                      <Link href={resolvedAction.href}>
                        {!isAuthenticated && <LogIn className="mr-2 h-4 w-4" />}
                        {resolvedAction.label}
                      </Link>
                    </Button>
                  )}
                  {resolvedSecondaryAction && (
                    <Button variant="outline" asChild>
                      <Link href={resolvedSecondaryAction.href}>
                        {resolvedSecondaryAction.label}
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
