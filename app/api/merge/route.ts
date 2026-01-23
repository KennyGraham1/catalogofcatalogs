import { NextRequest, NextResponse } from 'next/server';
import { mergeCatalogues as dbMergeCatalogues } from '@/lib/merge';
import { validateMergeRequest, formatZodErrors } from '@/lib/validation';
import { apiCache } from '@/lib/cache';
import { requireEditor } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();

    // Validate request body using Zod schema
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

    const { name, sourceCatalogues, config, metadata, exportOnly } = body;

    // Additional validation: require at least 2 catalogues
    if (!sourceCatalogues || sourceCatalogues.length < 2) {
      return NextResponse.json(
        {
          error: 'At least 2 catalogues are required for merging',
          code: 'INSUFFICIENT_CATALOGUES'
        },
        { status: 400 }
      );
    }

    // Validate catalogue name is not empty
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'Catalogue name is required',
          code: 'MISSING_NAME'
        },
        { status: 400 }
      );
    }

    const result = await dbMergeCatalogues(name, sourceCatalogues, config, metadata, exportOnly);

    // Clear cache since a new catalogue was created (unless export-only mode)
    if (!exportOnly) {
      apiCache.clearAll();
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Merge error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to merge catalogues';
    const errorCode = error instanceof Error && error.message.includes('not found')
      ? 'CATALOGUE_NOT_FOUND'
      : 'MERGE_FAILED';

    return NextResponse.json(
      {
        error: errorMessage,
        code: errorCode
      },
      { status: 500 }
    );
  }
}