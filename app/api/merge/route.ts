import { NextRequest, NextResponse } from 'next/server';
import { mergeCatalogues as dbMergeCatalogues } from '@/lib/merge';
import { validateMergeRequest, formatZodErrors } from '@/lib/validation';
import { requireEditor } from '@/lib/auth/middleware';
import { writeAuditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // A missing or malformed body is the client's error (400), not a failed merge (500).
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 });
    }

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

    // Use the Zod-validated/coerced output, NOT the raw body, so unvalidated fields
    // (e.g. oversized metadata) can never reach the database.
    const { name, sourceCatalogues, config, metadata, exportOnly } = validation.data!;

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

    // The creator recorded on the merged catalogue is the session user, never client input.
    const result = await dbMergeCatalogues(name, sourceCatalogues, config, metadata, exportOnly, {
      createdBy: authResult.user.id,
    });

    // A saved merge creates a catalogue (contract C13). lib/db.ts invalidates its caches on
    // every catalogue and event write, so nothing needs clearing here. An export-only merge
    // writes nothing and is not audited as a creation.
    if (!exportOnly && result.catalogueId) {
      await writeAuditLog({
        action: 'merge.create',
        actor_id: authResult.user.id,
        actor_email: authResult.user.email,
        target_id: result.catalogueId,
        target_type: 'catalogue',
        metadata: {
          name,
          sourceCatalogueIds: sourceCatalogues.map((catalogue) => String(catalogue.id)),
          mergeStrategy: config.mergeStrategy,
          priority: config.priority,
          ...(config.priorityOrder ? { priorityOrder: config.priorityOrder } : {}),
          timeThreshold: config.timeThreshold,
          distanceThreshold: config.distanceThreshold,
          eventCount: result.eventCount,
          originalEventCount: result.originalEventCount,
        },
      }, request);
    }

    return NextResponse.json(result);
  } catch (error) {
    // Log the real error server-side, but return a generic client-facing message so internal
    // exception detail (DB driver errors, query internals, etc.) is not disclosed.
    console.error('Merge error:', error);

    // Errors the data layer raises deliberately carry their own status (e.g. 409 when a
    // catalogue cannot be written) and a message written for the client.
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json(
        { error: error.message, code: error.code ?? 'MERGE_FAILED' },
        { status: error.statusCode }
      );
    }

    const isNotFound = error instanceof Error && error.message.includes('not found');

    return NextResponse.json(
      {
        error: isNotFound
          ? 'One or more source catalogues were not found'
          : 'Failed to merge catalogues',
        code: isNotFound ? 'CATALOGUE_NOT_FOUND' : 'MERGE_FAILED'
      },
      { status: 500 }
    );
  }
}
