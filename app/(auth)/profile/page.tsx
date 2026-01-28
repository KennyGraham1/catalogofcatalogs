'use client';

/**
 * User Profile Page
 * Display and manage user profile information
 */

import { FormEvent, useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { toast } from '@/hooks/use-toast';
import { RoleChangeRequest, UserRole } from '@/lib/auth/types';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [roleRequests, setRoleRequests] = useState<RoleChangeRequest[]>([]);
  const [roleRequestLoading, setRoleRequestLoading] = useState(false);
  const [roleRequestError, setRoleRequestError] = useState('');
  const [requestedRole, setRequestedRole] = useState<UserRole>(UserRole.EDITOR);
  const [justification, setJustification] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await signOut({ callbackUrl: '/login' });
  };

  useEffect(() => {
    if (!user) return;

    const fetchRoleRequests = async () => {
      try {
        setRoleRequestLoading(true);
        setRoleRequestError('');

        const response = await fetch('/api/role-requests/me');
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load role requests');
        }

        const data = await response.json();
        setRoleRequests(data.requests || []);
      } catch (error) {
        setRoleRequestError(error instanceof Error ? error.message : 'Failed to load role requests');
      } finally {
        setRoleRequestLoading(false);
      }
    };

    fetchRoleRequests();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (user.role === UserRole.EDITOR) {
      setRequestedRole(UserRole.ADMIN);
    } else {
      setRequestedRole(UserRole.EDITOR);
    }
    // Only re-run when user.role changes; user object reference may change on each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const handleRoleRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    try {
      setSubmittingRequest(true);
      setRoleRequestError('');

      const response = await fetch('/api/role-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedRole,
          justification,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit request');
      }

      const data = await response.json();
      setRoleRequests((prev) => [data.request, ...prev]);
      setJustification('');
      toast({
        title: 'Role request submitted',
        description: 'Your request has been sent to administrators for review.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit request';
      setRoleRequestError(message);
      toast({
        title: 'Request failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGateCard
        title="Login required"
        description="Please log in to view your profile."
        action={{ label: 'Log in', href: '/login' }}
        secondaryAction={{ label: 'Back to Home', href: '/' }}
      />
    );
  }

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'destructive';
      case UserRole.EDITOR:
        return 'default';
      case UserRole.VIEWER:
        return 'secondary';
      case UserRole.GUEST:
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getStatusBadgeVariant = (status: RoleChangeRequest['status']) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'rejected':
        return 'destructive';
      case 'pending':
      default:
        return 'secondary';
    }
  };

  const latestRequest = roleRequests[0];
  const hasPendingRequest = roleRequests.some((requestItem) => requestItem.status === 'pending');
  const allowedRoles =
    user.role === UserRole.ADMIN
      ? []
      : user.role === UserRole.EDITOR
        ? [UserRole.ADMIN]
        : [UserRole.EDITOR, UserRole.ADMIN];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Profile</CardTitle>
          <CardDescription>
            View and manage your account information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Name</h3>
              <p className="mt-1 text-lg">{user.name}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Email</h3>
              <p className="mt-1 text-lg">{user.email}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Role</h3>
              <div className="mt-1">
                <Badge variant={getRoleBadgeVariant(user.role)}>
                  {user.role.toUpperCase()}
                </Badge>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">User ID</h3>
              <p className="mt-1 font-mono text-sm text-gray-600">{user.id}</p>
            </div>
          </div>
          
          <div className="border-t pt-6">
            <h3 className="mb-4 text-lg font-medium">Permissions</h3>
            <div className="space-y-2 text-sm">
              {user.role === UserRole.ADMIN && (
                <>
                  <p>✓ Full system access</p>
                  <p>✓ User management</p>
                  <p>✓ System settings</p>
                  <p>✓ All catalogue operations</p>
                </>
              )}
              {user.role === UserRole.EDITOR && (
                <>
                  <p>✓ Create and edit catalogues</p>
                  <p>✓ Import and merge data</p>
                  <p>✓ Export catalogues</p>
                </>
              )}
              {user.role === UserRole.VIEWER && (
                <>
                  <p>✓ View all catalogues</p>
                  <p>✓ Export catalogues</p>
                </>
              )}
              {user.role === UserRole.GUEST && (
                <>
                  <p>✓ View public catalogues</p>
                </>
              )}
            </div>
          </div>
          
          <div className="border-t pt-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-medium">Role Upgrade Request</h3>
              <p className="text-sm text-muted-foreground">
                Request elevated access by submitting a role upgrade request.
              </p>
            </div>

            {roleRequestError && (
              <Alert variant="destructive">
                <AlertDescription>{roleRequestError}</AlertDescription>
              </Alert>
            )}

            {roleRequestLoading ? (
              <p className="text-sm text-muted-foreground">Loading role requests...</p>
            ) : (
              <>
                {latestRequest ? (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(latestRequest.status)}>
                        {latestRequest.status.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Requested {latestRequest.requested_role.toUpperCase()} on{' '}
                        {new Date(latestRequest.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {latestRequest.justification}
                    </p>
                    {latestRequest.admin_notes && (
                      <p className="text-sm">
                        <span className="font-medium">Admin notes:</span> {latestRequest.admin_notes}
                      </p>
                    )}
                    {latestRequest.status === 'approved' && (
                      <p className="text-xs text-muted-foreground">
                        Role updates may require signing out and back in to take effect.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No role upgrade requests submitted yet.
                  </p>
                )}
              </>
            )}

            {allowedRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You already have the highest access level.
              </p>
            ) : (
              <form onSubmit={handleRoleRequestSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="requested-role">Desired Role</Label>
                    <Select
                      value={requestedRole}
                      onValueChange={(value) => setRequestedRole(value as UserRole)}
                      disabled={hasPendingRequest || submittingRequest}
                    >
                      <SelectTrigger id="requested-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedRoles.includes(UserRole.EDITOR) && (
                          <SelectItem value={UserRole.EDITOR}>Editor</SelectItem>
                        )}
                        {allowedRoles.includes(UserRole.ADMIN) && (
                          <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="request-status">Current Status</Label>
                    <div className="flex items-center gap-2 pt-2">
                      <Badge variant={hasPendingRequest ? 'secondary' : 'outline'}>
                        {hasPendingRequest ? 'Pending Request' : 'No Pending Request'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="justification">Justification</Label>
                  <Textarea
                    id="justification"
                    value={justification}
                    onChange={(event) => setJustification(event.target.value)}
                    placeholder="Describe why you need elevated access..."
                    rows={4}
                    disabled={hasPendingRequest || submittingRequest}
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide a brief explanation to help admins review your request.
                  </p>
                </div>

                <div>
                  <Button
                    type="submit"
                    disabled={
                      hasPendingRequest ||
                      submittingRequest ||
                      justification.trim().length < 10
                    }
                  >
                    {submittingRequest ? 'Submitting...' : 'Request Role Upgrade'}
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="border-t pt-6 flex gap-4">
            <Button
              variant="outline"
              onClick={() => router.push('/change-password')}
            >
              Change Password
            </Button>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              disabled={loading}
            >
              {loading ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
