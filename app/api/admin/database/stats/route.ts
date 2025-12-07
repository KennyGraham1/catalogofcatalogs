import { NextResponse } from 'next/server';
import { getDb, isConnected, getConnectionStats } from '@/lib/mongodb';
import { getDatabaseReport, getServerStatus } from '@/lib/query-optimizer';

/**
 * GET /api/admin/database/stats
 * Returns comprehensive database performance statistics
 */
export async function GET() {
  try {
    if (!isConnected()) {
      await getDb();
    }

    const report = await getDatabaseReport();
    const serverStatus = await getServerStatus();
    const connectionStats = getConnectionStats();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      database: report,
      server: serverStatus,
      connection: connectionStats,
    });
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return NextResponse.json(
      { error: 'Failed to get database statistics' },
      { status: 500 }
    );
  }
}
