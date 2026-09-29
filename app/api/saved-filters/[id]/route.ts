import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, type SavedFilterScope } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/auth/types';
import { validateSavedFilterInput } from '../validation';

const logger = new Logger('SavedFilterAPI');

/**
 * Saved filters are personal. Every operation addresses only the caller's own filters,
 * so another user's filter is indistinguishable from a missing one (404). An
 * administrator may address any filter, including those saved before ownership was
 * recorded. Any signed-in account used to be able to read, overwrite or delete every
 * user's filters.
 */
function ownerScope(user: { id: string; role?: string }): SavedFilterScope {
  return user.role === UserRole.ADMIN ? { admin: true } : { ownerId: user.id };
}

const notFound = () => NextResponse.json({ error: 'Saved filter not found' }, { status: 404 });

/**
 * GET /api/saved-filters/[id]
 * Returns a specific saved filter
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const filter = await dbQueries.getSavedFilterById(id, ownerScope(authResult.user));

    if (!filter) {
      return notFound();
    }

    // Parse the filter config JSON
    const filterConfig = JSON.parse(filter.filter_config);

    return NextResponse.json({
      ...filter,
      filterConfig,
    });
  } catch (error) {
    logger.error('Failed to fetch saved filter', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

/**
 * PUT /api/saved-filters/[id]
 * Update a saved filter
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const input = validateSavedFilterInput(body);
    if (!input.ok) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }
    const { name, description, filterConfig, filterConfigString } = input.value;

    const updated = await dbQueries.updateSavedFilter(id, name, description, filterConfigString, ownerScope(authResult.user));
    if (!updated) {
      return notFound();
    }

    logger.info('Saved filter updated', { id: id, name });

    return NextResponse.json({ id: id, name, description, filterConfig });
  } catch (error) {
    logger.error('Failed to update saved filter', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

/**
 * DELETE /api/saved-filters/[id]
 * Delete a saved filter
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const deleted = await dbQueries.deleteSavedFilter(id, ownerScope(authResult.user));
    if (!deleted) {
      return notFound();
    }

    logger.info('Saved filter deleted', { id: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete saved filter', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
