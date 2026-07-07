import { NextRequest, NextResponse } from 'next/server';

import { validateMergeRequest, formatZodErrors } from '@/lib/validation';
import { previewMerge } from '@/lib/merge';
import { requireEditor } from '@/lib/auth/middleware';

/**
 * POST /api/merge/preview
 *
 * Preview merge operation without saving to database
 * Returns duplicate groups for QC visualization
 *
 * Requires Editor role or higher since this is a precursor to actual merge operations
 */
export async function POST(request: NextRequest) {
  try {
    // Require Editor role or higher (same as main merge endpoint)
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();

    // Validate request body
    const validation = validateMergeRequest(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: formatZodErrors(validation.errors!)
        },
        { status: 400 }
      );
    }

    // Use the Zod-validated/coerced output rather than the raw body.
    const { sourceCatalogues, config } = validation.data!;

    // Validate minimum catalogue count
    if (!sourceCatalogues || sourceCatalogues.length < 2) {
      return NextResponse.json(
        {
          error: 'At least 2 catalogues are required for merge preview',
          code: 'INSUFFICIENT_CATALOGUES'
        },
        { status: 400 }
      );
    }

    // Perform preview merge (dry run)
    const previewResult = await previewMerge(sourceCatalogues, config);

    return NextResponse.json(previewResult);
  } catch (error) {
    // Log the real error server-side; return a generic client-facing message.
    console.error('Merge preview error:', error);

    const isNotFound = error instanceof Error && error.message.includes('not found');

    return NextResponse.json(
      {
        error: isNotFound
          ? 'One or more source catalogues were not found'
          : 'Failed to preview merge',
        code: isNotFound ? 'CATALOGUE_NOT_FOUND' : 'PREVIEW_FAILED'
      },
      { status: 500 }
    );
  }
}

