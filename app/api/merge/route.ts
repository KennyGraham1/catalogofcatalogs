import { NextRequest, NextResponse } from 'next/server';
import { mergeCatalogues as dbMergeCatalogues } from '@/lib/merge';
import { validateMergeRequest, formatZodErrors } from '@/lib/validation';
import { apiCache } from '@/lib/cache';
import { getSession } from '@/lib/auth';
import { auditApiAction } from '@/lib/api-middleware';
import { withCSRF } from '@/lib/csrf';

export const POST = withCSRF(async (request: NextRequest) => {
  try {
    const body = await request.json();

    // Get authenticated user
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

    const { name, sourceCatalogues, config, metadata, exportOnly } = body;

    // Add user context to metadata
    const enrichedMetadata = {
      ...metadata,
      created_by: userId,
    };

    const result = await dbMergeCatalogues(name, sourceCatalogues, config, enrichedMetadata, exportOnly);

    // Create audit log if user is authenticated and not export-only
    if (userId && !exportOnly) {
      await auditApiAction(request as any, 'merge_catalogues', 'catalogue', result.catalogueId, {
        name,
        sourceCatalogues: sourceCatalogues.map((c: any) => c.id),
        config,
      });
    }

    // Clear cache since a new catalogue was created (unless export-only mode)
    if (!exportOnly) {
      apiCache.clearAll();
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Merge error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to merge catalogues';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
});