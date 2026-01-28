'use client';

/**
 * Admin Role Requests Page
 * Review and approve or reject role upgrade requests (Admin only)
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/hooks';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import type { RoleChangeRequest } from '@/lib/auth/types';
import { UserRole } from '@/lib/auth/types';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function AdminRoleRequestsPage() {
  const { user, isLoading } = useAuth();
  const [requests, setRequests] = useState<RoleChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError('');

      const url = statusFilter === 'all'
        ? '/api/role-requests'
        : `/api/role-requests?status=${statusFilter}`;

      const response = await fetch(url);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch role requests');
      }

      const data = await response.json();
      setRequests(data.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch role requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === UserRole.ADMIN) {
      fetchRequests();
    }
    // fetchRequests uses statusFilter which is already in deps; function is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, statusFilter]);

  const handleDecision = async (requestId: string, decision: 'approved' | 'rejected') => {
    try {
      setActionId(requestId);
      setError('');

      const response = await fetch(`/api/role-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: decision,
          adminNotes: notesById[requestId],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role request');
      }

      toast({
        title: `Request ${decision}`,
        description: 'The role request was updated successfully.',
      });

      await fetchRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role request';
      setError(message);
      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setActionId(null);
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

  if (isLoading || loading) {
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
        description="Please log in to review role requests."
        action={{ label: 'Log in', href: '/login' }}
        secondaryAction={{ label: 'Back to Home', href: '/' }}
      />
    );
  }

  if (user.role !== UserRole.ADMIN) {
    return (
      <AuthGateCard
        title="Admin access required"
        description="This area is restricted to administrators."
        requiredRole={UserRole.ADMIN}
        action={{ label: 'Back to Dashboard', href: '/dashboard' }}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Role Requests</CardTitle>
          <CardDescription>
            Review and approve or reject role upgrade requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Filter by status:</span>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Requested Role</TableHead>
                <TableHead>Justification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Admin Notes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((requestItem) => (
                <TableRow key={requestItem.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{requestItem.user_name}</p>
                      <p className="text-xs text-muted-foreground">{requestItem.user_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{requestItem.current_role.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{requestItem.requested_role.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs">
                    {requestItem.justification}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(requestItem.status)}>
                      {requestItem.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(requestItem.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    {requestItem.status === 'pending' ? (
                      <Textarea
                        rows={2}
                        placeholder="Optional notes"
                        value={notesById[requestItem.id] || ''}
                        onChange={(event) =>
                          setNotesById((prev) => ({
                            ...prev,
                            [requestItem.id]: event.target.value,
                          }))
                        }
                        disabled={actionId === requestItem.id}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {requestItem.admin_notes || 'No notes provided'}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {requestItem.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleDecision(requestItem.id, 'approved')}
                          disabled={actionId === requestItem.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDecision(requestItem.id, 'rejected')}
                          disabled={actionId === requestItem.id}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Reviewed {requestItem.reviewed_at ? new Date(requestItem.reviewed_at).toLocaleDateString('en-GB') : ''}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {requests.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              No role requests found for this filter.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

