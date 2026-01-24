/**
 * Import History API Endpoint
 *
 * GET /api/import/history?catalogueId=xxx&limit=10 - Get import history for a catalogue
 */

import { NextRequest, NextResponse } from 'next/server';
import { geonetImportService } from '@/lib/geonet-import-service';
import { requireEditor } from '@/lib/auth/middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const catalogueId = searchParams.get('catalogueId');
    const limitParam = searchParams.get('limit');
    
    if (!catalogueId) {
      return NextResponse.json(
        { error: 'Missing catalogueId parameter' },
        { status: 400 }
      );
    }
    
    const limit = limitParam ? parseInt(limitParam, 10) : 10;
    
    if (isNaN(limit) || limit <= 0) {
      return NextResponse.json(
        { error: 'Limit must be a positive number' },
        { status: 400 }
      );
    }
    
    const history = await geonetImportService.getImportHistory(catalogueId, limit);
    
    return NextResponse.json(history);
  } catch (error) {
    console.error('[API] Error fetching import history:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to fetch import history',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
