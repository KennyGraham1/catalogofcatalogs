import { NextRequest, NextResponse } from 'next/server';

import { validateMergeRequest, formatZodErrors } from '@/lib/validation';
import { previewMerge } from '@/lib/merge';

/**
 * POST /api/merge/preview
 * 
 * Preview merge operation without saving to database
 * Returns duplicate groups for QC visualization
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get authenticated user (optional for preview)
    const userId = undefined;

    // Validate request body
    const validation = validateMergeRequest(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: formatZodErrors(validation.errors!)
        },
        { status: 400 }
      );
    }

    const { sourceCatalogues, config } = body;

    // Perform preview merge (dry run)
    const previewResult = await previewMerge(sourceCatalogues, config);

    return NextResponse.json(previewResult);
  } catch (error) {
    console.error('Merge preview error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to preview merge';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

