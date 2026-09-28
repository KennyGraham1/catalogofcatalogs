import { NextRequest, NextResponse } from 'next/server';
import { getAllCacheStats, clearAllCaches } from '@/lib/cache';
import { writeAuditLog } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/middleware';

/**
 * GET /api/cache/stats
 * Returns cache statistics for monitoring and debugging (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

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
 * Clears all caches of this server instance (admin only). Other instances keep theirs;
 * catalogue writes already invalidate every instance through the shared cache
 * generation, so this is for recovery, not routine use.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Clear all caches, and retire every cache generation handed out so far so a
    // request that read the database before this call cannot re-cache its result.
    clearAllCaches();

    console.log('[Cache] All caches cleared via API');
    await writeAuditLog({
      action: 'cache.clear',
      actor_id: authResult.user.id,
      actor_email: authResult.user.email,
      target_type: 'cache',
    }, request);

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
