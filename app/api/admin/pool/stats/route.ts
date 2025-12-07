import { NextResponse } from 'next/server';
import { getConnectionStats, isConnected } from '@/lib/mongodb';

/**
 * GET /api/admin/pool/stats
 * Returns MongoDB connection pool statistics
 */
export async function GET() {
  try {
    const stats = getConnectionStats();
    const connected = await isConnected();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      database: 'mongodb',
      connected,
      pooling: {
        enabled: true,
        type: 'mongodb-native',
        note: 'MongoDB uses built-in connection pooling with configurable pool size',
      },
      stats: {
        totalConnections: stats.totalConnections,
        activeConnections: stats.activeConnections,
        errors: stats.errors,
        lastConnected: stats.lastConnected,
      },
    });
  } catch (error) {
    console.error('Failed to get pool stats:', error);
    return NextResponse.json(
      { error: 'Failed to get pool statistics' },
      { status: 500 }
    );
  }
}
