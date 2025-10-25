import { NextResponse } from 'next/server';
import { mergeCatalogues as dbMergeCatalogues } from '@/lib/merge';
import { validateMergeRequest, formatZodErrors } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const body = await request.json();

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

    const { name, sourceCatalogues, config } = validation.data!;

    const result = await dbMergeCatalogues(name, sourceCatalogues, config);

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