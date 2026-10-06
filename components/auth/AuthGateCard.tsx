'use client';

import Link from 'next/link';
import { ShieldAlert, LogIn, User as UserIcon, KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth/hooks';
import { useLoginHref } from '@/lib/auth/login-href';
import { REQUEST_ACCESS_PATH, requestAccessHref } from '@/lib/auth/access-request';
import { Permission, ROLE_PERMISSIONS, UserRole } from '@/lib/auth/types';
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
  /**
   * The title's heading level. The card usually replaces a whole page, so it is the
   * page's h1; pass h2 where it sits under a page heading (e.g. inside a tab).
   */
  headingLevel?: 'h1' | 'h2' | 'h3';
}

const ROLE_CONTEXT: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Full control over system settings and user management.',
  [UserRole.EDITOR]: 'Can create, edit, merge, and import catalogues.',
  [UserRole.VIEWER]: 'Read-only access with export permissions.',
  [UserRole.GUEST]: 'Public read-only access to catalogues.',
};

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.EDITOR]: 'Editor',
  [UserRole.VIEWER]: 'Viewer',
  [UserRole.GUEST]: 'Guest',
};

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.GUEST]: 0,
  [UserRole.VIEWER]: 1,
  [UserRole.EDITOR]: 2,
  [UserRole.ADMIN]: 3,
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

/**
 * Editor access is what the upload, import, merge and edit workflows need, and what a
 * new (Viewer) account asks an administrator for, so a gate that Editor access opens
 * offers that request. Admin-only areas do not invite Admin requests from here; the
 * profile form still allows them.
 */
function roleToRequest(requiredRole?: UserRole, requiredPermission?: Permission): UserRole | null {
  if (requiredRole) return requiredRole === UserRole.EDITOR ? UserRole.EDITOR : null;
  if (requiredPermission && ROLE_PERMISSIONS[UserRole.EDITOR].includes(requiredPermission)) return UserRole.EDITOR;
  return null;
}

export function AuthGateCard({
  title,
  description,
  requiredRole,
  requiredPermission,
  action,
  secondaryAction,
  headingLevel = 'h1',
}: AuthGateCardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  // Sign-in from a gate returns to the page the gate is on.
  const signInHref = useLoginHref();
  const roleContext = requiredRole ? ROLE_CONTEXT[requiredRole] : null;
  const permissionContext = requiredPermission ? PERMISSION_CONTEXT[requiredPermission] : null;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <LoadingCard text="Checking access..." className="w-full max-w-xl" />
      </div>
    );
  }

  // Callers name the plain sign-in and registration pages; carry the return path on them.
  const withCallback = (href: string) => {
    if (href === '/login') return signInHref;
    if (href === '/register') return signInHref.replace(/^\/login/, '/register'); // as registerHref
    return href;
  };

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

  const requestRole = roleToRequest(requiredRole, requiredPermission);
  const currentRank = user?.role ? ROLE_RANK[user.role as UserRole] ?? 0 : 0;
  const canRequest = requestRole !== null && currentRank < ROLE_RANK[requestRole];
  const requestLabel = requestRole ? `Request ${ROLE_LABEL[requestRole]} access` : '';
  // A signed-in user below the required role can ask for it now: that is the main action.
  const requestAction = isAuthenticated && canRequest
    ? { label: requestLabel, href: REQUEST_ACCESS_PATH }
    : undefined;

  const actions = [requestAction, resolvedAction, resolvedSecondaryAction].filter(
    (item): item is AuthGateAction => Boolean(item)
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-[1px] shadow-lg shadow-primary/10">
          <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-card/95">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
            <CardHeader className="relative space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle as={headingLevel} className="text-xl">{resolvedTitle}</CardTitle>
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
                href={isAuthenticated ? '/profile' : signInHref}
                className="block rounded-lg border bg-muted/40 p-3 transition hover:border-primary/50 hover:bg-muted/60"
                aria-label={isAuthenticated ? 'Open your profile' : 'Sign in'}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background">
                    <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
                    <span className="text-[11px] uppercase tracking-wide">
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

              {canRequest && requestRole && (
                <div
                  data-request-access
                  className="flex items-start gap-3 rounded-md border border-dashed px-3 py-2 text-sm"
                >
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-medium">How to get {ROLE_LABEL[requestRole]} access</p>
                    {isAuthenticated ? (
                      <p className="text-muted-foreground">
                        Your account has {ROLE_LABEL[(user?.role as UserRole) ?? UserRole.VIEWER]} access.
                        An administrator grants {ROLE_LABEL[requestRole]} access: send a request from
                        your profile, with a short reason, and an administrator will review it.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        New accounts have Viewer access: browsing catalogues, maps and analytics,
                        and exporting data. After signing in, you can{' '}
                        <Link
                          href={requestAccessHref(false)}
                          className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                        >
                          request {ROLE_LABEL[requestRole]} access
                        </Link>{' '}
                        from your profile; an administrator reviews each request.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {actions.length > 0 && (
                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
                  {actions.map((item, index) => {
                    const href = withCallback(item.href);
                    const isSignIn = href.startsWith('/login');
                    return (
                      <Button
                        key={`${item.label}-${item.href}`}
                        asChild
                        variant={index === 0 ? 'default' : 'outline'}
                        className={index === 0 ? 'shadow-sm' : undefined}
                      >
                        <Link href={href}>
                          {isSignIn && <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />}
                          {item === requestAction && <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />}
                          {item.label}
                        </Link>
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

