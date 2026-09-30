/**
 * GET /api/catalogues/[id]/review — the merge review queue of a merged catalogue (M5).
 *
 * A merge run with `onConflict: 'hold'` still writes a provisional row for every flagged
 * group (the row needs coordinates) but marks it `review_status: 'pending'` with the
 * group's warnings. This lists those rows, or the ones already resolved, oldest first with
 * a keyset cursor, and the two counts so the catalogue page can show "Needs review (N)".
 *
 * Query parameters:
 *   status   pending (default) | resolved
 *   limit    1..200 (default 50)
 *   after    the `nextCursor` of the previous page
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, getEventsForReview } from '@/lib/db';
import type { MergedEvent } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** A review row as the API returns it: the summary columns plus the parsed provenance. */
interface ReviewEventResponse {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
  magnitude_type: string | null;
  review_status: 'pending' | 'resolved' | null;
  review_reasons: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_choice: string | null;
  merge_strategy: string | null;
  source_events: unknown[];
}

/**
 * The stored `source_events` column is JSON text; the queue needs its entries (report data,
 * `selected` / `superseded` flags) as objects. A row whose column is unreadable lists no
 * reports rather than failing the whole page.
 */
function parseSourceEventsColumn(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** review_reasons is stored as an array (M3); tolerate the JSON-text form older tooling may write. */
function reviewReasonsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : parseSourceEventsColumn(value);
  return list.filter((reason): reason is string => typeof reason === 'string');
}

function toReviewEventResponse(event: MergedEvent): ReviewEventResponse {
  return {
    id: event.id,
    time: event.time,
    latitude: event.latitude,
    longitude: event.longitude,
    depth: event.depth ?? null,
    magnitude: event.magnitude,
    magnitude_type: event.magnitude_type ?? null,
    review_status: event.review_status ?? null,
    review_reasons: reviewReasonsOf(event.review_reasons),
    reviewed_by: event.reviewed_by ?? null,
    reviewed_at: event.reviewed_at ?? null,
    review_choice: event.review_choice ?? null,
    merge_strategy: event.merge_strategy ?? null,
    source_events: parseSourceEventsColumn(event.source_events),
  };
}

function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= MAX_LIMIT ? value : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: catalogueId } = await context.params;

  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const params = request.nextUrl.searchParams;
    const status = params.get('status') ?? 'pending';
    if (status !== 'pending' && status !== 'resolved') {
      return NextResponse.json(
        { error: "status must be 'pending' or 'resolved'", code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    const limit = parseLimit(params.get('limit'));
    if (limit === null) {
      return NextResponse.json(
        { error: `limit must be an integer between 1 and ${MAX_LIMIT}`, code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    const after = params.get('after');

    const catalogue = await dbQueries.getCatalogueById(catalogueId);
    if (!catalogue) {
      return NextResponse.json({ error: 'Catalogue not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const page = await getEventsForReview(catalogueId, { status, limit, after: after || null });

    return NextResponse.json({
      events: page.events.map(toReviewEventResponse),
      nextCursor: page.nextCursor,
      pendingCount: page.pendingCount,
      resolvedCount: page.resolvedCount,
    });
  } catch (error) {
    console.error('Review queue error:', error);
    // The data layer's own client-facing errors (e.g. a malformed cursor) keep their status;
    // anything else is masked so driver internals are not disclosed.
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json(
        { error: error.message, code: error.code ?? 'REVIEW_FAILED' },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to load the review queue', code: 'REVIEW_FAILED' },
      { status: 500 }
    );
  }
}
