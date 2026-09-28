import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';
import { createId } from '@/lib/id';
import { validateSavedFilterInput, MAX_SAVED_FILTERS_PER_USER } from './validation';

const logger = new Logger('SavedFiltersAPI');

/**
 * GET /api/saved-filters
 * Returns the signed-in user's saved filters. Saved filters are personal: the list
 * used to be public and returned every user's filter IDs, names and descriptions.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }
    const filters = await dbQueries.getSavedFilters(authResult.user.id);
    return NextResponse.json(filters);
  } catch (error) {
    logger.error('Failed to fetch saved filters', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

/**
 * POST /api/saved-filters
 * Create a new saved filter, owned by the signed-in user
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json().catch(() => null);
    const input = validateSavedFilterInput(body);
    if (!input.ok) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }
    const { name, description, filterConfig, filterConfigString } = input.value;

    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const ownerId = authResult.user.id;
    if (await dbQueries.countSavedFilters(ownerId) >= MAX_SAVED_FILTERS_PER_USER) {
      return NextResponse.json(
        { error: `A user may keep at most ${MAX_SAVED_FILTERS_PER_USER} saved filters; delete one first` },
        { status: 409 }
      );
    }

    const id = createId();
    await dbQueries.insertSavedFilter(id, name, description, filterConfigString, ownerId);

    logger.info('Saved filter created', { id, name });

    return NextResponse.json({ id, name, description, filterConfig }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create saved filter', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
