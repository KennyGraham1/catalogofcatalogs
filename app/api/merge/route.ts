import { NextRequest, NextResponse } from 'next/server';
import { mergeCatalogues as dbMergeCatalogues } from '@/lib/merge';
import { validateMergeRequest, formatZodErrors } from '@/lib/validation';
import { apiCache } from '@/lib/cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, sourceCatalogues, config, metadata, exportOnly } = body;

    const result = await dbMergeCatalogues(name, sourceCatalogues, config, metadata, exportOnly);

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
}