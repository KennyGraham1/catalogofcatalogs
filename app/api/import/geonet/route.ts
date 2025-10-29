/**
 * GeoNet Import API Endpoint
 * 
 * POST /api/import/geonet - Trigger a GeoNet import
 */

import { NextRequest, NextResponse } from 'next/server';
import { geonetImportService } from '@/lib/geonet-import-service';
import { apiCache } from '@/lib/cache';

export async function POST(request: NextRequest) {
  try {
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
    
    return NextResponse.json(
      {
        error: 'Import failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

