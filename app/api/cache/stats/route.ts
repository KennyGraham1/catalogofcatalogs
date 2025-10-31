import { NextResponse } from 'next/server';
import { getAllCacheStats } from '@/lib/cache';

/**
 * GET /api/cache/stats
 * Returns cache statistics for monitoring and debugging
 */
export async function GET() {
  try {
    const stats = getAllCacheStats();
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      caches: stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get cache statistics' },
      { status: 500 }
    );
  }
}

