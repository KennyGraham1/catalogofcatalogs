import { NextRequest, NextResponse } from 'next/server';
import { getFaultSlipTypeName } from '@/lib/fault-data';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/** Features fetched per bbox before distance ranking; independent of the display limit. */
const WFS_FETCH_CAP = 2000;
/** A box that comes back full is split into quadrants this many times at most (4^3 = 64 boxes). */
const WFS_MAX_SPLIT_DEPTH = 3;
/** A box still full at the deepest split is paged with startIndex this many extra times. */
const WFS_MAX_EXTRA_PAGES = 5;

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

    /**
     * Fetch every feature whose bbox intersects the circle of `searchRadius` km around
     * the point, deduplicated by feature id. Returns an error response on WFS failure.
     */
    const featuresById = new Map<unknown, any>();
    const features: any[] = [];
    const fetchCount = Math.max(limit, WFS_FETCH_CAP);
    let requestCount = 0;
    const collectWithin = async (searchRadius: number): Promise<NextResponse | null> => {
      // Calculate bounding box from point and radius
      // Approximate: 1 degree latitude ≈ 111 km
      // 1 degree longitude ≈ 111 km * cos(latitude)
      const latDelta = searchRadius / 111;
      const minLat = Math.max(-90, lat - latDelta);
      const maxLat = Math.min(90, lat + latDelta);

      // cos(latitude) collapses towards the poles, so the longitude half-width
      // grows without bound and divides by zero at ±90°: past a half circle the
      // search simply covers every longitude at this latitude.
      const cosLat = Math.cos(lat * Math.PI / 180);
      const lonDelta = cosLat > 0 ? searchRadius / (111 * cosLat) : Infinity;

      // A WFS bbox cannot express a range that runs east across the antimeridian
      // (it would need minLon > maxLon), and sending the raw lon ± delta puts
      // values outside [-180, 180] into the bbox parameter, which the service
      // rejects or answers empty. NZ territory crosses 180° at the Kermadec arc,
      // so wrap the range and issue the crossing case as two boxes.
      const rawWest = lon - lonDelta;
      const rawEast = lon + lonDelta;
      const west = rawWest < -180 ? rawWest + 360 : rawWest;
      const east = rawEast > 180 ? rawEast - 360 : rawEast;
      // A cap that reaches a pole contains every longitude at the latitudes beyond
      // it, and the opposite meridian's features are closer over the pole than the
      // lon +- delta box admits; cover the whole longitude range.
      const reachesPole = maxLat >= 90 || minLat <= -90;
      const lonRanges: Array<[number, number]> =
        lonDelta >= 180 || reachesPole
          ? [[-180, 180]]
          : west <= east
            ? [[west, east]]
            : [[west, 180], [-180, east]];

      const fetchPage = async (minLon: number, maxLon: number, boxMinLat: number, boxMaxLat: number, startIndex: number): Promise<NextResponse | { features: any[]; numberMatched: number | null }> => {
        // Construct WFS GetFeature request
        const wfsUrl = new URL('https://maps.gns.cri.nz/gns/wfs');
        wfsUrl.searchParams.set('service', 'WFS');
        wfsUrl.searchParams.set('version', '2.0.0');
        wfsUrl.searchParams.set('request', 'GetFeature');
        wfsUrl.searchParams.set('typeName', 'gns:AF250.FAULTS');
        wfsUrl.searchParams.set('outputFormat', 'application/json');
        wfsUrl.searchParams.set('srsName', 'EPSG:4326');
        wfsUrl.searchParams.set('bbox', `${minLon},${boxMinLat},${maxLon},${boxMaxLat},EPSG:4326`);
        // Fetch the whole bounding box, then rank by distance. Paging the WFS at
        // `limit` returned an arbitrary subset of the box and sorted THAT, so the
        // "nearest" faults were whichever ones the server happened to send first.
        wfsUrl.searchParams.set('count', String(fetchCount));
        if (startIndex > 0) wfsUrl.searchParams.set('startIndex', String(startIndex));
        requestCount++;

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
        const numberMatched = Number.isSafeInteger(data?.numberMatched) && data.numberMatched >= 0
          ? data.numberMatched : null;
        return { features: data?.features ?? [], numberMatched };
      };
      const fetchBox = async (minLon: number, maxLon: number, boxMinLat: number, boxMaxLat: number, depth: number): Promise<NextResponse | null> => {
        const first = await fetchPage(minLon, maxLon, boxMinLat, boxMaxLat, 0);
        if (first instanceof NextResponse) return first;
        let returned: any[] = first.features;
        // GeoServer reports numberMatched; when present it decides exactly whether the
        // box was cut, otherwise a full page is taken as cut.
        const truncated = first.numberMatched !== null
          ? first.numberMatched > returned.length
          : returned.length >= fetchCount;
        if (truncated && depth < WFS_MAX_SPLIT_DEPTH) {
          const midLon = (minLon + maxLon) / 2;
          const midLat = (boxMinLat + boxMaxLat) / 2;
          const quadrants: Array<[number, number, number, number]> = [
            [minLon, midLon, boxMinLat, midLat], [midLon, maxLon, boxMinLat, midLat],
            [minLon, midLon, midLat, boxMaxLat], [midLon, maxLon, midLat, boxMaxLat],
          ];
          const results = await Promise.all(quadrants.map(([a, b, c, d]) => fetchBox(a, b, c, d, depth + 1)));
          return results.find((r) => r !== null) ?? null;
        }
        if (truncated) {
          // Too dense to separate by splitting (many traces at one spot): page on.
          let complete = false;
          for (let page = 1; page <= WFS_MAX_EXTRA_PAGES; page++) {
            const next = await fetchPage(minLon, maxLon, boxMinLat, boxMaxLat, page * fetchCount);
            if (next instanceof NextResponse) return next;
            returned = returned.concat(next.features);
            const numberMatched = next.numberMatched ?? first.numberMatched;
            complete = numberMatched !== null
              ? returned.length >= numberMatched
              : next.features.length < fetchCount;
            if (complete || next.features.length === 0) break;
          }
          if (!complete) {
            // A request budget limits work, not the set over which "nearest" is
            // true. Never rank a known or potentially incomplete final box.
            return NextResponse.json(
              { error: 'The fault data service returned an incomplete search; nearest faults could not be determined.', code: 'FAULT_DATA_INCOMPLETE' },
              { status: 502 }
            );
          }
        }
        // Extract features (a fault straddling a box edge comes back from both boxes).
        for (const feature of returned) {
          if (feature?.id !== undefined && feature?.id !== null) {
            if (featuresById.has(feature.id)) continue;
            featuresById.set(feature.id, feature);
          }
          features.push(feature);
        }
        return null;
      };
      const results = await Promise.all(lonRanges.map(([minLon, maxLon]) => fetchBox(minLon, maxLon, minLat, maxLat, 0)));
      return results.find((r) => r !== null) ?? null;
    };

    // Calculate distance from query point to each fault
    const rankFeatures = (list: any[]): any[] => {
    return list.map((feature: any) => {
      const faultCoords = feature.geometry?.coordinates;
      let minDistance = Infinity;

      // Fault layers come back as LineString for some feature types and
      // MultiLineString for others (the NZ Active Faults geometries are
      // MultiLineString), so walk the coordinate tree down to the position
      // arrays instead of assuming a single level of nesting. Distance is
      // measured to each SEGMENT, not just to its vertices: a trace that passes
      // through the query point has distance 0 even when its nearest vertex is
      // 11 km away.
      const visitLines = (node: any): void => {
        if (!Array.isArray(node) || node.length === 0) return;
        if (Array.isArray(node[0]) && typeof node[0][0] === 'number') {
          const positions = (node as number[][]).filter(
            (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
          );
          for (let i = 0; i < positions.length; i++) {
            const d = i === 0
              ? calculateDistance(lat, lon, positions[0][1], positions[0][0])
              : distanceToSegment(lat, lon, positions[i - 1], positions[i]);
            if (d < minDistance) minDistance = d;
          }
          return;
        }
        if (typeof node[0] === 'number') {
          const d = calculateDistance(lat, lon, node[1], node[0]);
          if (Number.isFinite(d) && d < minDistance) minDistance = d;
          return;
        }
        for (const child of node) visitLines(child);
      };
      visitLines(faultCoords);

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
        rawDistance: minDistance,
        geometry: feature.geometry,
        properties: feature.properties,
      };
    });
    };

    // Nearest-first ranking only needs the box that holds the `limit` nearest faults.
    // The popup asks for 3 faults within 50 km, and a 50 km box over the Taupo
    // Volcanic Zone holds ~1,800 full geometries; a 5 km box holds a handful. A fault
    // outside a box of radius r is more than r away, so once `limit` faults lie
    // within r the ranking is final and the box need not grow.
    const ladder = Array.from(new Set([Math.min(radius, 5), Math.min(radius, 20), radius])).sort((a, b) => a - b);
    let faultsWithDistance: any[] = [];
    for (const searchRadius of ladder) {
      const failure = await collectWithin(searchRadius);
      if (failure) return failure;
      faultsWithDistance = rankFeatures(features);
      // The Euclidean box in degrees is a superset of the r-circle, but its edges are
      // only approximately r away; keep a margin before declaring the ranking final.
      if (faultsWithDistance.filter((f) => f.rawDistance <= searchRadius * 0.9).length >= limit) break;
    }

    // Filter by radius on the unrounded distance (1.04 km is outside a 1 km
    // radius even though it displays as 1.0), then sort and trim.
    const nearbyFaults = faultsWithDistance
      .filter((fault: any) => fault.rawDistance <= radius)
      .sort((a: any, b: any) => a.rawDistance - b.rawDistance)
      .slice(0, limit)
      .map(({ rawDistance: _raw, ...fault }: any) => fault);

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

/**
 * Great-circle distance (km) from a point to a fault segment, via the
 * cross-track / along-track construction on the sphere. When the foot of the
 * perpendicular falls outside the segment the nearer endpoint is used.
 */
function distanceToSegment(lat: number, lon: number, a: number[], b: number[]): number {
  const R = 6371;
  const dA = calculateDistance(lat, lon, a[1], a[0]);
  const dB = calculateDistance(lat, lon, b[1], b[0]);
  const segment = calculateDistance(a[1], a[0], b[1], b[0]);
  if (segment < 1e-9) return Math.min(dA, dB);

  const bearingAP = initialBearing(a[1], a[0], lat, lon);
  const bearingAB = initialBearing(a[1], a[0], b[1], b[0]);
  // Signed turn from the segment direction to the point direction, in [-pi, pi].
  const turn = Math.atan2(Math.sin(bearingAP - bearingAB), Math.cos(bearingAP - bearingAB));
  const d13 = dA / R;
  const crossTrack = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(turn))));
  const alongTrack = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.max(Math.cos(crossTrack), 1e-12))));
  // Foot of the perpendicular lies behind A or beyond B: an endpoint is nearest.
  if (Math.abs(turn) > Math.PI / 2) return Math.min(dA, dB);
  if (alongTrack * R > segment) return Math.min(dA, dB);
  return Math.abs(crossTrack) * R;
}

function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = toRadians(lat1), phi2 = toRadians(lat2), dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return Math.atan2(y, x);
}
