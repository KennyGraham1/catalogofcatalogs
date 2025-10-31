import { NextResponse } from 'next/server';

/**
 * GET /api/admin/pool/stats
 * Returns database connection pool statistics
 * 
 * Note: This endpoint is a placeholder for when connection pooling is enabled.
 * Currently, the application uses a single SQLite connection which is appropriate
 * for most use cases.
 */
export async function GET() {
  try {
    // For now, return basic info about the current setup
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      pooling: {
        enabled: false,
        type: 'single-connection',
        note: 'SQLite uses a single connection with WAL mode for concurrency',
      },
      recommendation: 'Connection pooling can be enabled by switching to DatabasePool in lib/db-pool.ts',
    });
  } catch (error) {
    console.error('Failed to get pool stats:', error);
    return NextResponse.json(
      { error: 'Failed to get pool statistics' },
      { status: 500 }
    );
  }
}

