/**
 * POST /api/catalogues/[id]/review/[eventId] — resolve one held merged event (M5).
 *
 * Body: `{ choice: 'keep' }` keeps the provisional solution the strategy produced;
 * `{ choice: { report: i } }` publishes report i of the row's source_events wholesale
 * (lib/merge.ts rebuildMergedEventForReport). Either way the row becomes
 * `review_status: 'resolved'` and records who decided, when and what. Editors only; every
 * decision is audited as 'merge.review'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveMergedEventReview } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { requireEditor } from '@/lib/auth/middleware';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type ReviewChoice = 'keep' | { report: number };

/**
 * The two accepted body shapes, and nothing else: a report index must be a non-negative
 * integer (the data layer checks it against the row's actual reports).
 */
function parseReviewChoice(body: unknown): ReviewChoice | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const choice = (body as { choice?: unknown }).choice;
  if (choice === 'keep') return 'keep';
  if (choice && typeof choice === 'object' && !Array.isArray(choice)) {
    const report = (choice as { report?: unknown }).report;
    if (typeof report === 'number' && Number.isInteger(report) && report >= 0) {
      return { report };
    }
  }
  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id: catalogueId, eventId } = await context.params;

  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json().catch(() => null);
    const choice = parseReviewChoice(body);
    if (choice === null) {
      return NextResponse.json(
        { error: "choice must be 'keep' or { report: <index> }", code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const result = await resolveMergedEventReview(catalogueId, eventId, choice, {
      userId: authResult.user.id,
    });

    // The recorded choice uses the same text form the row stores (review_choice).
    const choiceText = choice === 'keep' ? 'keep' : `report:${choice.report}`;
    await writeAuditLog({
      action: 'merge.review',
      actor_id: authResult.user.id,
      actor_email: authResult.user.email,
      target_id: eventId,
      target_type: 'merged_event',
      metadata: { catalogueId, eventId, choice: choiceText },
    }, request);

    return NextResponse.json({ event: result.event, pendingCount: result.pendingCount });
  } catch (error) {
    console.error('Merge review error:', error);
    // 404 (no such event/catalogue), 409 (not pending) and 400 (bad report) come from the
    // data layer with client-facing messages; anything else is masked.
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json(
        { error: error.message, code: error.code ?? 'REVIEW_FAILED' },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to resolve the review', code: 'REVIEW_FAILED' },
      { status: 500 }
    );
  }
}
