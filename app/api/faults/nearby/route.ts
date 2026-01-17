import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * API endpoint to query nearby active faults from GNS Science WFS service
 *
 * Query parameters:
 * - lat: Latitude of the point
 * - lon: Longitude of the point
 * - radius: Search radius in kilometers (default: 50km)
 * - limit: Maximum number of faults to return (default: 10)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lat = parseFloat(searchParams.get('lat') || '');
    const lon = parseFloat(searchParams.get('lon') || '');
    const radius = parseFloat(searchParams.get('radius') || '50'); // km
    const limit = parseInt(searchParams.get('limit') || '10');

    // Validate parameters
    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json(
        { error: 'Invalid latitude or longitude' },
        { status: 400 }
      );
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: 'Latitude must be between -90 and 90, longitude between -180 and 180' },
        { status: 400 }
      );
    }

    // Calculate bounding box from point and radius
    // Approximate: 1 degree latitude ≈ 111 km
    // 1 degree longitude ≈ 111 km * cos(latitude)
    const latDelta = radius / 111;
    const lonDelta = radius / (111 * Math.cos(lat * Math.PI / 180));

    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLon = lon - lonDelta;
    const maxLon = lon + lonDelta;

    // Construct WFS GetFeature request
    const wfsUrl = new URL('https://maps.gns.cri.nz/gns/wfs');
    wfsUrl.searchParams.set('service', 'WFS');
    wfsUrl.searchParams.set('version', '2.0.0');
    wfsUrl.searchParams.set('request', 'GetFeature');
    wfsUrl.searchParams.set('typeName', 'gns:AF250.FAULTS');
    wfsUrl.searchParams.set('outputFormat', 'application/json');
    wfsUrl.searchParams.set('srsName', 'EPSG:4326');
    wfsUrl.searchParams.set('bbox', `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`);
    wfsUrl.searchParams.set('count', limit.toString());

    // Fetch fault data from GNS Science WFS service
    const response = await fetch(wfsUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      },
      // Cache for 1 hour since fault data doesn't change frequently
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      console.error('WFS request failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch fault data from GNS Science' },
        { status: 502 }
      );
    }

    const data = await response.json();

    // Extract features and calculate distances
    const features = data.features || [];
    
    // Calculate distance from query point to each fault
    const faultsWithDistance = features.map((feature: any) => {
      const faultCoords = feature.geometry?.coordinates;
      let minDistance = Infinity;

      // For LineString geometry, find the closest point on the line
      if (faultCoords && Array.isArray(faultCoords)) {
        for (const coord of faultCoords) {
          const [faultLon, faultLat] = coord;
          const distance = calculateDistance(lat, lon, faultLat, faultLon);
          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }

      return {
        id: feature.id,
        name: feature.properties?.NAME || 'Unknown Fault',
        slipType: feature.properties?.SLIP_TYPE || null,
        slipRate: feature.properties?.SLIP_RATE || null,
        recurrenceInterval: feature.properties?.REC_INT || null,
        displacement: feature.properties?.DISP || null,
        lastEvent: feature.properties?.LAST_EVENT || null,
        senseOfMovement: feature.properties?.SENSE || null,
        distance: Math.round(minDistance * 10) / 10, // Round to 1 decimal
        geometry: feature.geometry,
        properties: feature.properties,
      };
    });

    // Sort by distance and filter by radius
    const nearbyFaults = faultsWithDistance
      .filter((fault: any) => fault.distance <= radius)
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      query: {
        latitude: lat,
        longitude: lon,
        radius,
        limit,
      },
      count: nearbyFaults.length,
      faults: nearbyFaults,
    });

  } catch (error) {
    console.error('Error querying nearby faults:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

