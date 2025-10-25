/**
 * API endpoint to get filtered events from a catalogue
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, EventFilters } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const catalogueId = params.id;
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
    
    const startTime = searchParams.get('startTime');
    if (startTime) filters.startTime = startTime;
    
    const endTime = searchParams.get('endTime');
    if (endTime) filters.endTime = endTime;
    
    const eventType = searchParams.get('eventType');
    if (eventType) filters.eventType = eventType;
    
    const magnitudeType = searchParams.get('magnitudeType');
    if (magnitudeType) filters.magnitudeType = magnitudeType;
    
    const evaluationStatus = searchParams.get('evaluationStatus');
    if (evaluationStatus) filters.evaluationStatus = evaluationStatus;
    
    const evaluationMode = searchParams.get('evaluationMode');
    if (evaluationMode) filters.evaluationMode = evaluationMode;
    
    const maxAzimuthalGap = searchParams.get('maxAzimuthalGap');
    if (maxAzimuthalGap) filters.maxAzimuthalGap = parseFloat(maxAzimuthalGap);
    
    const minUsedPhaseCount = searchParams.get('minUsedPhaseCount');
    if (minUsedPhaseCount) filters.minUsedPhaseCount = parseInt(minUsedPhaseCount);
    
    const minUsedStationCount = searchParams.get('minUsedStationCount');
    if (minUsedStationCount) filters.minUsedStationCount = parseInt(minUsedStationCount);
    
    const maxStandardError = searchParams.get('maxStandardError');
    if (maxStandardError) filters.maxStandardError = parseFloat(maxStandardError);
    
    // Get filtered events
    const events = await dbQueries.getFilteredEvents(catalogueId, filters);
    
    return NextResponse.json({
      success: true,
      events,
      count: events.length,
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

