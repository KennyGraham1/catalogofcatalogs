import { NextResponse } from 'next/server';
import { getAllCacheStats, apiCache, catalogueCache, eventCache, statisticsCache } from '@/lib/cache';

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

/**
 * DELETE /api/cache/stats
 * Clears all caches - useful when data is out of sync
 */
export async function DELETE() {
  try {
    // Clear all caches
    apiCache.clearAll();
    catalogueCache.clearAll();
    eventCache.clearAll();
    statisticsCache.clearAll();

    console.log('[Cache] All caches cleared via API');

    return NextResponse.json({
      success: true,
      message: 'All caches cleared successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear caches' },
      { status: 500 }
    );
  }
}

