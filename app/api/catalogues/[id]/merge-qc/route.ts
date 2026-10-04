/**
 * GET /api/catalogues/[id]/merge-qc — the quality-control summary kept with a merged
 * catalogue (lib/merge-qc.ts MergeQcSummary): totals, per-catalogue and pairwise
 * comparisons, window use, and the flagged, kept-apart and held groups.
 *
 * Query parameters:
 *   format   json (default): the stored summary
 *            csv: the listed groups, one row per entry, as a download
 *
 * A catalogue without a summary (it is not a merge, or it was merged before summaries
 * were kept) is a 404 with code MERGE_QC_NOT_FOUND; a missing catalogue is a 404 with
 * code NOT_FOUND.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';
import { createDownloadHeaders, generateExportFilename } from '@/lib/export-utils';
import { qcListedGroupsCsv } from '@/lib/merge-qc';

export const dynamic = 'force-dynamic';

const FORMATS = ['json', 'csv'] as const;
type MergeQcFormat = typeof FORMATS[number];

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

    const format = (request.nextUrl.searchParams.get('format') || 'json').trim().toLowerCase() as MergeQcFormat;
    if (!FORMATS.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Supported formats: ${FORMATS.join(', ')}`, code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    // The same visibility as every catalogue read: a catalogue being deleted is gone.
    const catalogue = await dbQueries.getCatalogueById(catalogueId);
    if (!catalogue) {
      return NextResponse.json({ error: 'Catalogue not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const stored = await dbQueries.getMergeQcSummary(catalogueId);
    if (!stored) {
      return NextResponse.json(
        {
          error:
            'This catalogue has no merge quality-control summary. Summaries are kept for catalogues ' +
            'created by a merge on this platform, from the release that introduced them.',
          code: 'MERGE_QC_NOT_FOUND',
        },
        { status: 404 }
      );
    }
    const { summary } = stored;

    if (format === 'csv') {
      const filename = generateExportFilename(catalogue.name, 'csv', {
        suffix: 'merge_qc',
        version: catalogue.version ?? undefined,
      });
      const headers = new Headers(createDownloadHeaders(filename, 'csv'));
      headers.set('Content-Type', 'text/csv; charset=utf-8');
      // The CSV holds the listed groups only; say how many there were before the cap.
      headers.set('X-QC-Listed-Groups', String(summary.listedGroups.length));
      headers.set('X-QC-Listed-Groups-Total', String(summary.listedGroupsTotal));
      return new NextResponse(qcListedGroupsCsv(summary), { status: 200, headers });
    }

    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Merge QC summary error:', error);
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json(
        { error: error.message, code: error.code ?? 'MERGE_QC_FAILED' },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to load the merge quality-control summary', code: 'MERGE_QC_FAILED' },
      { status: 500 }
    );
  }
}
