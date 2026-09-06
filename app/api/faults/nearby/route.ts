import { NextRequest, NextResponse } from 'next/server';
import { getFaultSlipTypeName } from '@/lib/fault-data';

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

    if (!Number.isFinite(radius) || radius <= 0) {
      return NextResponse.json(
        { error: 'Radius must be a positive number of kilometres' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(limit) || limit <= 0) {
      return NextResponse.json(
        { error: 'Limit must be a positive integer' },
        { status: 400 }
      );
    }

    // Calculate bounding box from point and radius
    // Approximate: 1 degree latitude ≈ 111 km
    // 1 degree longitude ≈ 111 km * cos(latitude)
    const latDelta = radius / 111;
    const minLat = Math.max(-90, lat - latDelta);
    const maxLat = Math.min(90, lat + latDelta);

    // cos(latitude) collapses towards the poles, so the longitude half-width
    // grows without bound and divides by zero at ±90°: past a half circle the
    // search simply covers every longitude at this latitude.
    const cosLat = Math.cos(lat * Math.PI / 180);
    const lonDelta = cosLat > 0 ? radius / (111 * cosLat) : Infinity;

    // A WFS bbox cannot express a range that runs east across the antimeridian
    // (it would need minLon > maxLon), and sending the raw lon ± delta puts
    // values outside [-180, 180] into the bbox parameter, which the service
    // rejects or answers empty. NZ territory crosses 180° at the Kermadec arc,
    // so wrap the range and issue the crossing case as two boxes.
    const rawWest = lon - lonDelta;
    const rawEast = lon + lonDelta;
    const west = rawWest < -180 ? rawWest + 360 : rawWest;
    const east = rawEast > 180 ? rawEast - 360 : rawEast;
    const lonRanges: Array<[number, number]> =
      lonDelta >= 180
        ? [[-180, 180]]
        : west <= east
          ? [[west, east]]
          : [[west, 180], [-180, east]];

    // Fetch fault data from GNS Science WFS service (one request per bbox).
    const featuresById = new Map<unknown, any>();
    const features: any[] = [];
    for (const [minLon, maxLon] of lonRanges) {
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
      // Extract features (a fault straddling 180° comes back from both boxes).
      for (const feature of data?.features ?? []) {
        if (feature?.id !== undefined && feature?.id !== null) {
          if (featuresById.has(feature.id)) continue;
          featuresById.set(feature.id, feature);
        }
        features.push(feature);
      }
    }

    // Calculate distance from query point to each fault
    const faultsWithDistance = features.map((feature: any) => {
      const faultCoords = feature.geometry?.coordinates;
      let minDistance = Infinity;

      // Fault layers come back as LineString for some feature types and
      // MultiLineString for others (the NZ Active Faults geometries are
      // MultiLineString), so walk the coordinate tree down to [lon, lat]
      // positions instead of assuming a single level of nesting. Destructuring a
      // MultiLineString ring as if it were a position yields two arrays, which
      // makes the distance NaN and silently drops every fault from the result.
      const visitPositions = (node: any): void => {
        if (!Array.isArray(node) || node.length === 0) return;
        if (typeof node[0] === 'number') {
          const [faultLon, faultLat] = node as number[];
          if (!Number.isFinite(faultLon) || !Number.isFinite(faultLat)) return;
          const distance = calculateDistance(lat, lon, faultLat, faultLon);
          if (distance < minDistance) {
            minDistance = distance;
          }
          return;
        }
        for (const child of node) visitPositions(child);
      };
      visitPositions(faultCoords);

      // WFS attribute names are not consistently cased across GNS layers, and the
      // bundled GeoJSON uses lower case, so look each attribute up by any of the
      // names it is published under.
      const prop = (...names: string[]): string | number | null => {
        const props = feature.properties;
        if (!props) return null;
        for (const name of names) {
          const value = props[name] ?? props[name.toLowerCase()] ?? props[name.toUpperCase()];
          if (value !== undefined && value !== null && value !== '') return value;
        }
        return null;
      };

      const name = prop('NAME');
      const slipRate = codedDomain(prop('SLIP_RATE'));
      const recurrence = codedDomain(prop('REC_INT', 'REC_INTERVAL', 'RECURRENCE'), isRomanNumeral);
      const displacement = codedDomain(prop('DISP', 'DISPLACEMENT'));
      const lastEvent = codedDomain(prop('LAST_EVENT'));

      return {
        id: feature.id,
        name: typeof name === 'string' ? name : 'Unknown Fault',
        // slip_type and sub_sliptype are AF250 class codes; decode them to the
        // sense of movement they stand for (0 / out-of-domain -> not recorded).
        slipType: getFaultSlipTypeName(prop('SLIP_TYPE')) ?? null,
        senseOfMovement: getFaultSlipTypeName(prop('SENSE', 'SENSE_OF_MOVEMENT', 'SUB_SLIPTYPE')) ?? null,
        // AF250 publishes slip rate, displacement, last-event age and recurrence
        // interval as coded-domain CLASS CODES too — small integers, and Roman
        // numerals I-VI for the recurrence interval — not as physical
        // measurements (see the property notes in lib/fault-data.ts). Reporting
        // a "5" under `slipRate` invites a client to render it as 5 mm/yr, so a
        // class code is only ever reported under an explicit *Class field and
        // the physical field stays null unless the service published genuinely
        // descriptive text.
        slipRate: slipRate.value,
        slipRateClass: slipRate.classCode,
        recurrenceInterval: recurrence.value,
        recurrenceIntervalClass: recurrence.classCode,
        displacement: displacement.value,
        displacementClass: displacement.classCode,
        lastEvent: lastEvent.value,
        lastEventClass: lastEvent.classCode,
        // Infinity when no readable position was found; the radius filter below
        // then excludes the feature rather than reporting a bogus distance.
        distance: Number.isFinite(minDistance) ? Math.round(minDistance * 10) / 10 : Infinity,
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

/** AF250 encodes the recurrence-interval class as a Roman numeral (I-VI). */
function isRomanNumeral(text: string): boolean {
  return /^[IVXLCDM]+$/i.test(text);
}

/**
 * Split a coded-domain attribute into the part that may be shown as published
 * and the part that is only meaningful as a class code.
 *
 * `value` is non-null only for descriptive text (what non-AF250 fault layers
 * publish, e.g. "1-2 mm/yr"); anything numeric, or matching the layer's class
 * encoding, is returned as `classCode` so no caller can mistake a class for a
 * measurement in mm/yr, metres or years.
 */
function codedDomain(
  raw: string | number | null,
  isClassText: (text: string) => boolean = () => false
): { value: string | null; classCode: number | string | null } {
  if (raw === null || raw === undefined) return { value: null, classCode: null };
  if (typeof raw === 'number') {
    return { value: null, classCode: Number.isFinite(raw) ? raw : null };
  }
  const text = String(raw).trim();
  // The shipped layer writes the literal string '<Null>' for some missing values.
  if (text === '' || text.toLowerCase() === '<null>') return { value: null, classCode: null };
  if (Number.isFinite(Number(text))) return { value: null, classCode: Number(text) };
  if (isClassText(text)) return { value: null, classCode: text };
  return { value: text, classCode: null };
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

