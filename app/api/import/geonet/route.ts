/**
 * GeoNet Import API Endpoint
 *
 * POST /api/import/geonet - Trigger a GeoNet import
 * Protected by CSRF token validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { geonetImportService } from '@/lib/geonet-import-service';
import { apiCache } from '@/lib/cache';
import { requireEditor } from '@/lib/auth/middleware';

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

    if (startDate) {
      parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid start date format' },
          { status: 400 }
        );
      }
    }

    if (endDate) {
      parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid end date format' },
          { status: 400 }
        );
      }
    }

    // Validate hours
    if (hours !== undefined && (typeof hours !== 'number' || hours <= 0)) {
      return NextResponse.json(
        { error: 'Hours must be a positive number' },
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
    if (minDepth !== undefined && (typeof minDepth !== 'number' || minDepth < 0)) {
      return NextResponse.json(
        { error: 'Minimum depth must be a non-negative number' },
        { status: 400 }
      );
    }

    if (maxDepth !== undefined && (typeof maxDepth !== 'number' || maxDepth < 0)) {
      return NextResponse.json(
        { error: 'Maximum depth must be a non-negative number' },
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

    if (minLongitude !== undefined && maxLongitude !== undefined && minLongitude > maxLongitude) {
      return NextResponse.json(
        { error: 'Minimum longitude cannot be greater than maximum longitude' },
        { status: 400 }
      );
    }

    // Validate date order
    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
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

    // Trigger import
    console.log('[API] Starting GeoNet import with options:', {
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
      updateExisting,
      catalogueId,
      catalogueName,
    });

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
    });

    console.log('[API] Import completed:', result);

    // Clear cache since new events were imported
    apiCache.clearAll();

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Import error:', error);

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

