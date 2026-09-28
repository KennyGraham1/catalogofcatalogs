/**
 * GeoNet Import API Endpoint
 *
 * POST /api/import/geonet - Trigger a GeoNet import
 *
 * Requires the Editor role (requireEditor checks the NextAuth session). There is no
 * CSRF token: cross-site requests are kept out by the session cookie's SameSite=Lax
 * attribute, and middleware.ts refuses any state-changing /api request whose Origin
 * names another host.
 */

import { NextRequest, NextResponse } from 'next/server';
import { geonetImportService, GeoNetImportTargetError } from '@/lib/geonet-import-service';
import { requireEditor } from '@/lib/auth/middleware';
import { normalizeTimestamp } from '@/lib/earthquake-utils';
import { writeAuditLog } from '@/lib/audit';

// A broad import fans out into hundreds of serial GeoNet requests (the time-window
// chunker bisects until every window is under GeoNet's 10,000-event cap) plus the
// batched database writes, so this route needs the same extended budget the bulk
// upload routes get instead of the platform default. Seconds; Vercel Pro/Enterprise.
export const maxDuration = 300;

/** The earliest origin time the platform stores (lib/db.ts validateMergedEvent). */
const EARLIEST_EVENT_TIME = Date.UTC(1000, 0, 1);

/**
 * An ISO 8601 date or date-time as a UTC instant, or null. The import form sends
 * datetime-local values ('2024-10-24T00:00') and labels them UTC; new Date() reads an
 * offset-less date-time as SERVER-LOCAL time, which on a Pacific/Auckland host moved
 * the requested window 12-13 hours. normalizeTimestamp reads it as UTC and honours an
 * explicit Z or offset.
 */
function parseUtcDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return null;
  const iso = normalizeTimestamp(value);
  return iso ? new Date(iso) : null;
}

export async function POST(request: NextRequest) {
  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();

    // Parse and validate request body
    const {
      startDate,
      endDate,
      hours,
      minMagnitude,
      maxMagnitude,
      minDepth,
      maxDepth,
      minLatitude,
      maxLatitude,
      minLongitude,
      maxLongitude,
      updateExisting,
      catalogueId,
      catalogueName,
    } = body;

    // Validate date range
    let parsedStartDate: Date | undefined;
    let parsedEndDate: Date | undefined;

    // A lone start or end used to be dropped silently, importing the last 24 hours.
    if ((startDate != null) !== (endDate != null)) {
      return NextResponse.json(
        { error: 'Provide both startDate and endDate, or neither' },
        { status: 400 }
      );
    }

    if (startDate != null) {
      parsedStartDate = parseUtcDate(startDate) ?? undefined;
      if (!parsedStartDate) {
        return NextResponse.json(
          { error: 'Invalid start date format (expected ISO 8601; a time without an offset is read as UTC)' },
          { status: 400 }
        );
      }
    }

    if (endDate != null) {
      parsedEndDate = parseUtcDate(endDate) ?? undefined;
      if (!parsedEndDate) {
        return NextResponse.json(
          { error: 'Invalid end date format (expected ISO 8601; a time without an offset is read as UTC)' },
          { status: 400 }
        );
      }
    }

    if (parsedStartDate && parsedStartDate.getTime() < EARLIEST_EVENT_TIME) {
      return NextResponse.json(
        { error: 'Start date must be in or after the year 1000' },
        { status: 400 }
      );
    }

    // Validate hours. The window must start at a date GeoNet can be asked for: an
    // hours value reaching past year 0 produced a negative-year ISO string.
    if (hours !== undefined && (
      typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 ||
      Date.now() - hours * 60 * 60 * 1000 < EARLIEST_EVENT_TIME
    )) {
      return NextResponse.json(
        { error: 'Hours must be a positive number that does not reach back before the year 1000' },
        { status: 400 }
      );
    }

    // Validate magnitude range
    if (minMagnitude !== undefined && (typeof minMagnitude !== 'number' || minMagnitude < 0)) {
      return NextResponse.json(
        { error: 'Minimum magnitude must be a non-negative number' },
        { status: 400 }
      );
    }

    if (maxMagnitude !== undefined && (typeof maxMagnitude !== 'number' || maxMagnitude < 0)) {
      return NextResponse.json(
        { error: 'Maximum magnitude must be a non-negative number' },
        { status: 400 }
      );
    }

    if (minMagnitude !== undefined && maxMagnitude !== undefined && minMagnitude > maxMagnitude) {
      return NextResponse.json(
        { error: 'Minimum magnitude cannot be greater than maximum magnitude' },
        { status: 400 }
      );
    }

    // Validate depth range
    if (minDepth !== undefined && (typeof minDepth !== 'number' || minDepth < -5)) {
      return NextResponse.json(
        { error: 'Minimum depth must be >= -5 km' },
        { status: 400 }
      );
    }

    if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < -5)) {
      return NextResponse.json(
        { error: 'Maximum depth must be >= -5 km' },
        { status: 400 }
      );
    }

    if (minDepth !== undefined && maxDepth !== undefined && minDepth > maxDepth) {
      return NextResponse.json(
        { error: 'Minimum depth cannot be greater than maximum depth' },
        { status: 400 }
      );
    }

    // Validate latitude range (-90 to 90)
    if (minLatitude !== undefined && (typeof minLatitude !== 'number' || minLatitude < -90 || minLatitude > 90)) {
      return NextResponse.json(
        { error: 'Minimum latitude must be between -90 and 90' },
        { status: 400 }
      );
    }

    if (maxLatitude !== undefined && (typeof maxLatitude !== 'number' || maxLatitude < -90 || maxLatitude > 90)) {
      return NextResponse.json(
        { error: 'Maximum latitude must be between -90 and 90' },
        { status: 400 }
      );
    }

    if (minLatitude !== undefined && maxLatitude !== undefined && minLatitude > maxLatitude) {
      return NextResponse.json(
        { error: 'Minimum latitude cannot be greater than maximum latitude' },
        { status: 400 }
      );
    }

    // Validate longitude range (-180 to 180)
    if (minLongitude !== undefined && (typeof minLongitude !== 'number' || minLongitude < -180 || minLongitude > 180)) {
      return NextResponse.json(
        { error: 'Minimum longitude must be between -180 and 180' },
        { status: 400 }
      );
    }

    if (maxLongitude !== undefined && (typeof maxLongitude !== 'number' || maxLongitude < -180 || maxLongitude > 180)) {
      return NextResponse.json(
        { error: 'Maximum longitude must be between -180 and 180' },
        { status: 400 }
      );
    }

    // NOTE: minLongitude > maxLongitude is intentionally NOT rejected — it is the
    // RFC 7946 section 5.2 convention for a bounding box crossing the antimeridian
    // (180 degrees), which NZ offshore (Kermadec) catalogues require.

    // Validate date order
    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
        { status: 400 }
      );
    }

    // Validate the target catalogue id if provided (the service checks the catalogue)
    if (catalogueId !== undefined && (typeof catalogueId !== 'string' || catalogueId.trim() === '')) {
      return NextResponse.json(
        { error: 'Catalogue id must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate catalogue name if provided
    if (catalogueName !== undefined && (typeof catalogueName !== 'string' || catalogueName.trim() === '')) {
      return NextResponse.json(
        { error: 'Catalogue name cannot be empty' },
        { status: 400 }
      );
    }

    if (updateExisting !== undefined && typeof updateExisting !== 'boolean') {
      return NextResponse.json(
        { error: 'updateExisting must be true or false' },
        { status: 400 }
      );
    }

    const query = {
      startDate: parsedStartDate?.toISOString(),
      endDate: parsedEndDate?.toISOString(),
      hours,
      minMagnitude,
      maxMagnitude,
      minDepth,
      maxDepth,
      minLatitude,
      maxLatitude,
      minLongitude,
      maxLongitude,
    };

    // Trigger import
    console.log('[API] Starting GeoNet import with options:', { ...query, updateExisting, catalogueId, catalogueName });

    const result = await geonetImportService.importEvents({
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      hours,
      minMagnitude,
      maxMagnitude,
      minDepth,
      maxDepth,
      minLatitude,
      maxLatitude,
      minLongitude,
      maxLongitude,
      updateExisting: updateExisting ?? false,
      catalogueId,
      catalogueName,
      // Recorded as the new catalogue's created_by.
      userId: authResult.user.id,
    });

    console.log('[API] Import completed:', result);

    await writeAuditLog({
      action: 'import.geonet',
      actor_id: authResult.user.id,
      actor_email: authResult.user.email,
      target_id: result.catalogueId || undefined,
      target_type: 'catalogue',
      metadata: {
        catalogueCreated: !catalogueId && !!result.catalogueId,
        success: result.success,
        updateExisting: updateExisting ?? false,
        query,
        totalFetched: result.totalFetched,
        newEvents: result.newEvents,
        updatedEvents: result.updatedEvents,
        skippedEvents: result.skippedEvents,
        collidedEvents: result.collidedEvents,
        invalidEvents: result.invalidEvents,
        excludedEvents: result.excludedEvents,
        failedEvents: result.failedEvents,
        errorCount: result.errors.length,
      },
    }, request);

    // No cache clearing here: lib/db.ts invalidates the server caches on every
    // catalogue and event write the import makes.
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Import error:', error);

    // The chosen catalogue cannot take this import (missing, not a GeoNet import
    // catalogue, or another import into it is running). Nothing was fetched or written.
    if (error instanceof GeoNetImportTargetError) {
      return NextResponse.json(
        {
          error: 'Import failed',
          message: error.message,
          errorType: error.name,
          timestamp: new Date().toISOString(),
        },
        { status: error.status }
      );
    }

    // Extract detailed error information
    let errorMessage = 'Unknown error occurred';
    let errorType = 'UnknownError';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      errorType = error.name;

      // Sanitize error message to prevent leaking internal details
      // Remove file paths and stack traces
      errorMessage = errorMessage
        .replace(/at\s+.*\(.*\)/g, '')
        .replace(/\/[^\s]+\.(ts|js)/g, '<path>')
        .trim();
      // Truncate very long messages
      if (errorMessage.length > 200) {
        errorMessage = errorMessage.substring(0, 200) + '...';
      }

      // Check for specific error types and provide helpful messages
      if (error.message.includes('Circuit breaker is OPEN')) {
        errorMessage = 'The GeoNet API appears to be experiencing issues. Please try again later.';
        errorType = 'CircuitBreakerOpen';
        statusCode = 503;
      } else if (error.message.includes('GeoNet API returned an error')) {
        errorType = 'GeoNetApiError';
        statusCode = 502;
      } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        errorMessage = 'Request to GeoNet API timed out. Please try again with a smaller time range.';
        errorType = 'TimeoutError';
        statusCode = 504;
      } else if (error.message.includes('fetch') || error.message.includes('network')) {
        errorMessage = 'Network error connecting to GeoNet API. Please check your connection and try again.';
        errorType = 'NetworkError';
        statusCode = 503;
      } else if (error.message.includes('Database not available')) {
        errorMessage = 'Database is temporarily unavailable. Please try again later.';
        errorType = 'DatabaseError';
        statusCode = 503;
      }
    }

    return NextResponse.json(
      {
        error: 'Import failed',
        message: errorMessage,
        errorType,
        timestamp: new Date().toISOString(),
      },
      { status: statusCode }
    );
  }
}
