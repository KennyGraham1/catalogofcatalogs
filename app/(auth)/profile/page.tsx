'use client';

/**
 * User Profile Page
 * Display and manage user profile information
 */

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserRole } from '@/lib/auth/types';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleSignOut = async () => {
    setLoading(true);
    await signOut({ callbackUrl: '/login' });
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session?.user) {
    return null;
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
              <p className="mt-1 text-lg">{session.user.name}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Email</h3>
              <p className="mt-1 text-lg">{session.user.email}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Role</h3>
              <div className="mt-1">
                <Badge variant={getRoleBadgeVariant(session.user.role)}>
                  {session.user.role.toUpperCase()}
                </Badge>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">User ID</h3>
              <p className="mt-1 font-mono text-sm text-gray-600">{session.user.id}</p>
            </div>
          </div>
          
          <div className="border-t pt-6">
            <h3 className="mb-4 text-lg font-medium">Permissions</h3>
            <div className="space-y-2 text-sm">
              {session.user.role === UserRole.ADMIN && (
                <>
                  <p>✓ Full system access</p>
                  <p>✓ User management</p>
                  <p>✓ System settings</p>
                  <p>✓ All catalogue operations</p>
                </>
              )}
              {session.user.role === UserRole.EDITOR && (
                <>
                  <p>✓ Create and edit catalogues</p>
                  <p>✓ Import and merge data</p>
                  <p>✓ Export catalogues</p>
                </>
              )}
              {session.user.role === UserRole.VIEWER && (
                <>
                  <p>✓ View all catalogues</p>
                  <p>✓ Export catalogues</p>
                </>
              )}
              {session.user.role === UserRole.GUEST && (
                <>
                  <p>✓ View public catalogues</p>
                </>
              )}
            </div>
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

