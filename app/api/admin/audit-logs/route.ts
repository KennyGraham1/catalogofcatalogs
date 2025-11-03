/**
 * Audit Logs API Route
 * 
 * Get audit logs (admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api-middleware';
import { getAllAuditLogs, getUserAuditLogs } from '@/lib/auth-db';

/**
 * GET /api/admin/audit-logs
 * Get all audit logs (admin only)
 */
export const GET = withAdmin(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const limit = parseInt(searchParams.get('limit') || '100');

  let logs;
  
  if (userId) {
    logs = await getUserAuditLogs(userId, limit);
  } else {
    logs = await getAllAuditLogs(limit);
  }

  return NextResponse.json({ logs });
});

