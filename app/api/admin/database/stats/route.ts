import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getDatabaseReport } from '@/lib/query-optimizer';

/**
 * GET /api/admin/database/stats
 * Returns comprehensive database performance statistics
 */
export async function GET() {
  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const report = await getDatabaseReport(db);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      database: report,
    });
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return NextResponse.json(
      { error: 'Failed to get database statistics' },
      { status: 500 }
    );
  }
}

