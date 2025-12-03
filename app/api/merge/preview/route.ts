import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { validateMergeRequest, formatZodErrors } from '@/lib/validation';
import { previewMerge } from '@/lib/merge';
import { withCSRF } from '@/lib/csrf';

/**
 * POST /api/merge/preview
 * 
 * Preview merge operation without saving to database
 * Returns duplicate groups for QC visualization
 */
export const POST = withCSRF(async (request: NextRequest) => {
  try {
    const body = await request.json();

    // Get authenticated user (optional for preview)
    const session = await getSession();
    const userId = session?.user?.id;

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
});

