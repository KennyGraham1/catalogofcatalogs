/**
 * API endpoint to get sample events across all catalogues for dashboard visualization
 * Returns a limited number of recent events with geographic distribution
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    if (isNaN(limit) || limit <= 0 || limit > 1000) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 1000' },
        { status: 400 }
      );
    }

    if (!db) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // Get sample events from all catalogues
    // Prioritize recent events with good geographic distribution
    const events = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT
          e.id,
          e.catalogue_id,
          e.time,
          e.latitude,
          e.longitude,
          e.depth,
          e.magnitude,
          e.magnitude_type,
          e.event_type,
          c.name as catalogue_name
        FROM merged_events e
        JOIN merged_catalogues c ON e.catalogue_id = c.id
        WHERE e.latitude IS NOT NULL
          AND e.longitude IS NOT NULL
          AND e.magnitude IS NOT NULL
        ORDER BY e.time DESC
        LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
      limit
    });
  } catch (error) {
    console.error('[API] Failed to fetch sample events:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch sample events',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

