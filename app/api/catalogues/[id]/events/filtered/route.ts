/**
 * API endpoint to get filtered events from a catalogue
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, EventFilters, ALLOWED_EVENT_TYPE, ALLOWED_EVALUATION_STATUS, ALLOWED_EVALUATION_MODE } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { normalizeTimestamp } from '@/lib/earthquake-utils';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const catalogueId = id;
    const { searchParams } = new URL(request.url);

    // Build filters from query parameters
    const filters: EventFilters = {};

    const minMagnitude = searchParams.get('minMagnitude');
    if (minMagnitude) filters.minMagnitude = parseFloat(minMagnitude);

    const maxMagnitude = searchParams.get('maxMagnitude');
    if (maxMagnitude) filters.maxMagnitude = parseFloat(maxMagnitude);

    const minDepth = searchParams.get('minDepth');
    if (minDepth) filters.minDepth = parseFloat(minDepth);

    const maxDepth = searchParams.get('maxDepth');
    if (maxDepth) filters.maxDepth = parseFloat(maxDepth);

    // Timestamps: accept any format the system supports (ISO, space-separated ISO,
    // DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, unix seconds/ms) and normalise to ISO
    // so the MongoDB string comparison against stored ISO values is correct.
    const startTime = searchParams.get('startTime');
    if (startTime) {
      const normalized = normalizeTimestamp(startTime);
      if (!normalized) {
        return NextResponse.json(
          { error: 'Invalid startTime: could not parse as a recognised date format' },
          { status: 400 }
        );
      }
      filters.startTime = normalized;
    }

    const endTime = searchParams.get('endTime');
    if (endTime) {
      const normalized = normalizeTimestamp(endTime);
      if (!normalized) {
        return NextResponse.json(
          { error: 'Invalid endTime: could not parse as a recognised date format' },
          { status: 400 }
        );
      }
      filters.endTime = normalized;
    }

    // Enum filters: normalise to lowercase to match stored data, validate against
    // allowed sets so callers get a clear error instead of silently empty results.
    const eventType = searchParams.get('eventType');
    if (eventType) {
      const normalized = eventType.toLowerCase().trim();
      if (!ALLOWED_EVENT_TYPE.has(normalized)) {
        return NextResponse.json(
          { error: `Invalid eventType: "${eventType}". Must be one of the allowed QuakeML event types.` },
          { status: 400 }
        );
      }
      filters.eventType = normalized;
    }

    const evaluationStatus = searchParams.get('evaluationStatus');
    if (evaluationStatus) {
      const normalized = evaluationStatus.toLowerCase().trim();
      if (!ALLOWED_EVALUATION_STATUS.has(normalized)) {
        return NextResponse.json(
          { error: `Invalid evaluationStatus: "${evaluationStatus}". Allowed: ${Array.from(ALLOWED_EVALUATION_STATUS).join(', ')}` },
          { status: 400 }
        );
      }
      filters.evaluationStatus = normalized;
    }

    const evaluationMode = searchParams.get('evaluationMode');
    if (evaluationMode) {
      const normalized = evaluationMode.toLowerCase().trim();
      if (!ALLOWED_EVALUATION_MODE.has(normalized)) {
        return NextResponse.json(
          { error: `Invalid evaluationMode: "${evaluationMode}". Allowed: ${Array.from(ALLOWED_EVALUATION_MODE).join(', ')}` },
          { status: 400 }
        );
      }
      filters.evaluationMode = normalized;
    }

    // magnitudeType is free-form (ML, Mw, mb, etc.) — just normalise case
    const magnitudeType = searchParams.get('magnitudeType');
    if (magnitudeType) filters.magnitudeType = magnitudeType.trim();

    const maxAzimuthalGap = searchParams.get('maxAzimuthalGap');
    if (maxAzimuthalGap) filters.maxAzimuthalGap = parseFloat(maxAzimuthalGap);

    const minUsedPhaseCount = searchParams.get('minUsedPhaseCount');
    if (minUsedPhaseCount) filters.minUsedPhaseCount = parseInt(minUsedPhaseCount);

    const minUsedStationCount = searchParams.get('minUsedStationCount');
    if (minUsedStationCount) filters.minUsedStationCount = parseInt(minUsedStationCount);

    const maxStandardError = searchParams.get('maxStandardError');
    if (maxStandardError) filters.maxStandardError = parseFloat(maxStandardError);

    // Geographic bounds
    const minLatitude = searchParams.get('minLatitude');
    if (minLatitude) filters.minLatitude = parseFloat(minLatitude);

    const maxLatitude = searchParams.get('maxLatitude');
    if (maxLatitude) filters.maxLatitude = parseFloat(maxLatitude);

    const minLongitude = searchParams.get('minLongitude');
    if (minLongitude) filters.minLongitude = parseFloat(minLongitude);

    const maxLongitude = searchParams.get('maxLongitude');
    if (maxLongitude) filters.maxLongitude = parseFloat(maxLongitude);

    // Get filtered events
    const { events, truncated, limit } = await dbQueries.getFilteredEvents(catalogueId, filters);

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
      truncated,
      limit,
      filters
    });
  } catch (error) {
    console.error('Error filtering events:', error);
    return NextResponse.json(
      { error: 'Failed to filter events' },
      { status: 500 }
    );
  }
}
