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

const ROLE_CONTEXT: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Full control over system settings and user management.',
  [UserRole.EDITOR]: 'Can create, edit, merge, and import catalogues.',
  [UserRole.VIEWER]: 'Read-only access with export permissions.',
  [UserRole.GUEST]: 'Public read-only access to catalogues.',
};

const PERMISSION_CONTEXT: Partial<Record<Permission, string>> = {
  [Permission.CATALOGUE_CREATE]: 'Create new catalogues and upload data.',
  [Permission.CATALOGUE_READ]: 'View catalogue data.',
  [Permission.CATALOGUE_UPDATE]: 'Edit catalogue metadata and content.',
  [Permission.CATALOGUE_DELETE]: 'Delete catalogues and associated data.',
  [Permission.CATALOGUE_EXPORT]: 'Export catalogues to supported formats.',
  [Permission.IMPORT_GEONET]: 'Import data from GeoNet.',
  [Permission.IMPORT_FILE]: 'Import data from file uploads.',
  [Permission.MERGE_CATALOGUES]: 'Merge multiple catalogues into one.',
  [Permission.USER_READ]: 'View user accounts.',
  [Permission.USER_CREATE]: 'Create new user accounts.',
  [Permission.USER_UPDATE]: 'Update user details.',
  [Permission.USER_DELETE]: 'Remove user accounts.',
  [Permission.USER_MANAGE_ROLES]: 'Manage user roles and permissions.',
  [Permission.SYSTEM_SETTINGS]: 'Manage system settings.',
  [Permission.SYSTEM_AUDIT]: 'Access system audit logs.',
};

const formatPermissionLabel = (permission: Permission) => {
  const [resource, action] = permission.split(':');
  const actionLabel = action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const resourceLabel = resource.replace(/_/g, ' ');
  return `${actionLabel} ${resourceLabel}`.trim();
};

export function AuthGateCard({
  title,
  description,
  requiredRole,
  requiredPermission,
  action,
  secondaryAction,
}: AuthGateCardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const roleContext = requiredRole ? ROLE_CONTEXT[requiredRole] : null;
  const permissionContext = requiredPermission ? PERMISSION_CONTEXT[requiredPermission] : null;

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
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                      Access needed
                    </span>
                    {requiredRole && (
                      <Badge variant="outline">{requiredRole.toUpperCase()}</Badge>
                    )}
                    {requiredPermission && (
                      <Badge variant="outline">
                        {formatPermissionLabel(requiredPermission)}
                      </Badge>
                    )}
                  </div>
                  {roleContext && <div className="mt-1 text-[11px]">{roleContext}</div>}
                  {permissionContext && (
                    <div className="mt-1 text-[11px]">{permissionContext}</div>
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
