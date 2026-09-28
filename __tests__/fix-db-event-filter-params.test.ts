/**
 * @jest-environment node
 *
 * Contract C4 (event filter parameters) and finding #60 (the filtered-events endpoint
 * passed NaN / truncated numbers into queries and answered 200 with empty or wrong
 * results).
 *
 * The query-builder tests evaluate the generated predicate against in-memory documents
 * with a small matcher that follows MongoDB's semantics for the operators involved
 * (comparison operators never match null/missing; a null equality matches missing;
 * aggregation comparisons use BSON order, where null sorts below every number).
 */

import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({ requireViewer: jest.fn() }));

const collection: any = {};
jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  getCollection: jest.fn(async () => collection),
  COLLECTIONS: { CATALOGUES: 'merged_catalogues', EVENTS: 'merged_events' },
  withTransaction: jest.fn(),
}));

import {
  parseEventFilterParams,
  hasEventFilters,
  eventFiltersToSearchParams,
  QUAKEML_EVENT_TYPES,
  NON_BED_EVENT_TYPES,
  type EventFilters,
} from '@/lib/event-filter-params';
import { buildEventFilterQuery, dbQueries, ALLOWED_EVENT_TYPE } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { GET as getFiltered } from '@/app/api/catalogues/[id]/events/filtered/route';

// ---------------------------------------------------------------------------
// Minimal MongoDB matcher for the operators buildEventFilterQuery emits.
// ---------------------------------------------------------------------------
type Doc = Record<string, any>;

function bsonRank(v: unknown): number {
  if (v === undefined || v === null) return 1;
  if (typeof v === 'number') return 2;
  if (typeof v === 'string') return 3;
  return 4;
}
function aggCompare(a: unknown, b: unknown): number {
  const ra = bsonRank(a), rb = bsonRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 1) return 0;
  return (a as any) < (b as any) ? -1 : (a as any) > (b as any) ? 1 : 0;
}
function evalExpr(expr: any, doc: Doc): any {
  if (typeof expr === 'string' && expr.startsWith('$')) return doc[expr.slice(1)] ?? null;
  if (expr === null || typeof expr !== 'object' || Array.isArray(expr)) return expr;
  const [op, arg] = Object.entries(expr)[0] as [string, any];
  switch (op) {
    case '$lte': return aggCompare(evalExpr(arg[0], doc), evalExpr(arg[1], doc)) <= 0;
    case '$max': {
      const vals = arg.map((a: any) => evalExpr(a, doc)).filter((v: any) => v !== null && v !== undefined);
      return vals.length ? Math.max(...vals) : null;
    }
    case '$multiply': {
      const vals = arg.map((a: any) => evalExpr(a, doc));
      return vals.some((v: any) => v === null || v === undefined) ? null : vals.reduce((p: number, v: number) => p * v, 1);
    }
    case '$cos': { const v = evalExpr(arg, doc); return v === null ? null : Math.cos(v); }
    case '$degreesToRadians': { const v = evalExpr(arg, doc); return v === null ? null : (v * Math.PI) / 180; }
    case '$ifNull': { const v = evalExpr(arg[0], doc); return v === null || v === undefined ? evalExpr(arg[1], doc) : v; }
    default: throw new Error(`matcher: unsupported expression ${op}`);
  }
}
function comparable(a: unknown, b: unknown): boolean {
  return (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string');
}
function matchValue(value: unknown, cond: any): boolean {
  if (cond instanceof RegExp) return typeof value === 'string' && cond.test(value);
  if (cond === null) return value === null || value === undefined;
  if (typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, operand]) => {
      switch (op) {
        case '$gte': return comparable(value, operand) && (value as any) >= (operand as any);
        case '$lte': return comparable(value, operand) && (value as any) <= (operand as any);
        case '$gt': return comparable(value, operand) && (value as any) > (operand as any);
        case '$lt': return comparable(value, operand) && (value as any) < (operand as any);
        default: throw new Error(`matcher: unsupported operator ${op}`);
      }
    });
  }
  return value === cond;
}
function matches(doc: Doc, query: Record<string, any>): boolean {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return (cond as any[]).some((q) => matches(doc, q));
    if (key === '$and') return (cond as any[]).every((q) => matches(doc, q));
    if (key === '$expr') return evalExpr(cond, doc) === true;
    return matchValue(doc[key], cond);
  });
}
const select = (docs: Doc[], filters: EventFilters) => {
  const q = buildEventFilterQuery('cat', filters);
  return docs.filter((d) => matches({ catalogue_id: 'cat', ...d }, q)).map((d) => d.id);
};

const params = (qs: string) => new URLSearchParams(qs);

describe('C4 :: parseEventFilterParams', () => {
  it('parses every supported filter, including uncertainty maxima and minQuality', () => {
    const result = parseEventFilterParams(params(
      'minMagnitude=2.5&maxMagnitude=6&minDepth=-2&maxDepth=40' +
      '&startTime=2024-01-01&endTime=2024-06-30T12:00:00Z' +
      '&eventType=Earthquake&magnitudeType=ML&evaluationStatus=Reviewed&evaluationMode=MANUAL' +
      '&maxAzimuthalGap=180&minUsedPhaseCount=1e1&minUsedStationCount=4&maxStandardError=0.8' +
      '&maxHorizontalUncertainty=5&maxDepthUncertainty=3&maxTimeUncertainty=0.5&maxMagnitudeUncertainty=0.2' +
      '&minQuality=70&minLatitude=-48&maxLatitude=-34&minLongitude=165&maxLongitude=179.5'
    ));
    expect(result).toEqual({
      ok: true,
      filters: {
        minMagnitude: 2.5, maxMagnitude: 6, minDepth: -2, maxDepth: 40,
        startTime: '2024-01-01T00:00:00.000Z', endTime: '2024-06-30T12:00:00.000Z',
        eventType: 'earthquake', magnitudeType: 'ML', evaluationStatus: 'reviewed', evaluationMode: 'manual',
        maxAzimuthalGap: 180, minUsedPhaseCount: 10, minUsedStationCount: 4, maxStandardError: 0.8,
        maxHorizontalUncertainty: 5, maxDepthUncertainty: 3, maxTimeUncertainty: 0.5, maxMagnitudeUncertainty: 0.2,
        minQuality: 70, minLatitude: -48, maxLatitude: -34, minLongitude: 165, maxLongitude: 179.5,
      },
    });
  });

  it.each([
    ['maxMagnitude=4,7', 'maxMagnitude'],           // decimal comma used to become 4
    ['minMagnitude=M4', 'minMagnitude'],            // used to become NaN -> empty 200
    ['minMagnitude=abc', 'minMagnitude'],
    ['minDepth=0x10', 'minDepth'],                  // Number() alone accepts hex
    ['maxDepth=Infinity', 'maxDepth'],
    ['minLatitude=91', 'minLatitude'],
    ['maxLongitude=-181', 'maxLongitude'],
    ['minMagnitude=11', 'minMagnitude'],
    ['maxAzimuthalGap=-1', 'maxAzimuthalGap'],
    ['minUsedPhaseCount=10.5', 'minUsedPhaseCount'], // parseInt used to truncate to 10
    ['maxHorizontalUncertainty=-0.1', 'maxHorizontalUncertainty'],
    ['minQuality=101', 'minQuality'],
    ['startTime=not-a-date', 'startTime'],
    ['eventType=not-a-type', 'eventType'],
    ['evaluationStatus=approved', 'evaluationStatus'],
    ['magnitudeType=ML%3B%20DROP', 'magnitudeType'],
  ])('rejects %s', (qs, name) => {
    const result = parseEventFilterParams(params(qs));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(name);
  });

  it.each([
    ['minMagnitude=5&maxMagnitude=3', 'magnitude'],
    ['minDepth=30&maxDepth=10', 'depth'],
    ['minLatitude=-30&maxLatitude=-40', 'latitude'],
    ['startTime=2024-02-01&endTime=2024-01-01', 'time'],
  ])('rejects the reversed range %s', (qs, label) => {
    const result = parseEventFilterParams(params(qs));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(label);
  });

  it('accepts an antimeridian-crossing longitude box (minLongitude > maxLongitude)', () => {
    expect(parseEventFilterParams(params('minLongitude=177&maxLongitude=-178'))).toEqual({
      ok: true, filters: { minLongitude: 177, maxLongitude: -178 },
    });
  });

  it('reads an offset-less time as UTC', () => {
    const result = parseEventFilterParams(params('startTime=2024-03-05%2010:15'));
    expect(result).toEqual({ ok: true, filters: { startTime: '2024-03-05T10:15:00.000Z' } });
  });

  it('ignores empty and unknown parameters, and rejects conflicting duplicates', () => {
    expect(parseEventFilterParams(params('minMagnitude=&format=csv&metadata=comments'))).toEqual({ ok: true, filters: {} });
    expect(parseEventFilterParams(params('minMagnitude=3&minMagnitude=3'))).toEqual({ ok: true, filters: { minMagnitude: 3 } });
    const conflicting = parseEventFilterParams(params('minMagnitude=3&minMagnitude=4'));
    expect(conflicting.ok).toBe(false);
  });

  it('accepts the documented non-BED volcano labels, which ingest also accepts', () => {
    const result = parseEventFilterParams(params('eventType=Volcano-Tectonic'));
    expect(result).toEqual({ ok: true, filters: { eventType: 'volcano-tectonic' } });
  });

  it('serialises filters canonically so they parse back to the same value', () => {
    const filters: EventFilters = {
      minMagnitude: 3, maxLongitude: -178, minLongitude: 177, minQuality: 50,
      startTime: '2020-01-01T00:00:00.000Z', eventType: 'earthquake', maxHorizontalUncertainty: 2.5,
    };
    const qs = eventFiltersToSearchParams(filters);
    expect(qs.toString()).toBe(
      'minMagnitude=3&startTime=2020-01-01T00%3A00%3A00.000Z&eventType=earthquake' +
      '&maxHorizontalUncertainty=2.5&minQuality=50&minLongitude=177&maxLongitude=-178'
    );
    expect(parseEventFilterParams(qs)).toEqual({ ok: true, filters });
    expect(hasEventFilters(filters)).toBe(true);
    expect(hasEventFilters({})).toBe(false);
  });

  it('shares its event-type vocabulary with ingest validation', () => {
    expect(QUAKEML_EVENT_TYPES).toHaveLength(44);
    expect(Array.from(ALLOWED_EVENT_TYPE).sort()).toEqual([...QUAKEML_EVENT_TYPES, ...NON_BED_EVENT_TYPES].sort());
  });
});

describe('C4 :: buildEventFilterQuery semantics', () => {
  const docs: Doc[] = [
    // Ellipse semi-major axis present: it decides, even though horizontal_uncertainty is small.
    { id: 'ellipse-big', latitude: -41, longitude: 174, max_horizontal_uncertainty: 12, horizontal_uncertainty: 1 },
    { id: 'ellipse-small', latitude: -41, longitude: 174, max_horizontal_uncertainty: 2 },
    { id: 'circular', latitude: -41, longitude: 174, horizontal_uncertainty: 3, max_horizontal_uncertainty: null },
    // 0.02 deg lat = 2.22 km; 0.03 deg lon at 41S = 2.51 km -> 2.51 km.
    { id: 'marginals', latitude: -41, longitude: 174, latitude_uncertainty: 0.02, longitude_uncertainty: 0.03 },
    // Only one marginal: the quality score cannot derive a horizontal value either.
    { id: 'lat-only', latitude: -41, longitude: 174, latitude_uncertainty: 0.001 },
    { id: 'sentinel', latitude: -41, longitude: 174, horizontal_uncertainty: -999 },
    { id: 'none', latitude: -41, longitude: 174 },
  ];

  it('matches horizontal uncertainty the way the quality score reads it', () => {
    expect(select(docs, { maxHorizontalUncertainty: 3 })).toEqual(['ellipse-small', 'circular', 'marginals']);
    expect(select(docs, { maxHorizontalUncertainty: 2.4 })).toEqual(['ellipse-small']);
    expect(select(docs, { maxHorizontalUncertainty: 20 })).toEqual(['ellipse-big', 'ellipse-small', 'circular', 'marginals']);
  });

  it('keeps the horizontal alternatives and an antimeridian box as separate conditions', () => {
    const rows: Doc[] = [
      { id: 'east', latitude: -30, longitude: 178, horizontal_uncertainty: 1 },
      { id: 'west', latitude: -30, longitude: -179, horizontal_uncertainty: 1 },
      { id: 'west-poor', latitude: -30, longitude: -179, horizontal_uncertainty: 9 },
      { id: 'mainland', latitude: -41, longitude: 174, horizontal_uncertainty: 1 },
    ];
    const filters = { maxHorizontalUncertainty: 5, minLongitude: 177, maxLongitude: -178 };
    expect(buildEventFilterQuery('cat', filters).$and).toHaveLength(2);
    expect(select(rows, filters)).toEqual(['east', 'west']);
  });

  it('requires a reported, non-negative value for the other uncertainty maxima', () => {
    const rows: Doc[] = [
      { id: 'good', depth_uncertainty: 1, time_uncertainty: 0.1, magnitude_uncertainty: 0.1, azimuthal_gap: 90, standard_error: 0.3 },
      { id: 'sentinel', depth_uncertainty: -1, time_uncertainty: -1, magnitude_uncertainty: -1, azimuthal_gap: -999, standard_error: -1 },
      { id: 'missing' },
    ];
    for (const f of [
      { maxDepthUncertainty: 2 }, { maxTimeUncertainty: 1 }, { maxMagnitudeUncertainty: 0.5 },
      { maxAzimuthalGap: 180 }, { maxStandardError: 1 },
    ] as EventFilters[]) {
      expect(select(rows, f)).toEqual(['good']);
    }
  });

  it('filters on the stored quality score', () => {
    const rows: Doc[] = [{ id: 'a', quality_score: 71 }, { id: 'b', quality_score: 69 }, { id: 'legacy' }];
    expect(select(rows, { minQuality: 70 })).toEqual(['a']);
  });

  it('matches magnitude types case-insensitively but exactly', () => {
    const rows: Doc[] = [{ id: 'a', magnitude_type: 'ML' }, { id: 'b', magnitude_type: 'Ml' }, { id: 'c', magnitude_type: 'MLv' }];
    expect(select(rows, { magnitudeType: 'ml' })).toEqual(['a', 'b']);
    // Regex metacharacters are literal.
    expect(select([{ id: 'x', magnitude_type: 'Mw(mB)' }, { id: 'y', magnitude_type: 'MwmB' }], { magnitudeType: 'Mw(mB)' })).toEqual(['x']);
  });

  it('refuses a non-finite numeric filter instead of querying with NaN', () => {
    expect(() => buildEventFilterQuery('cat', { minMagnitude: NaN })).toThrow(/minMagnitude/);
  });
});

describe('#60 :: GET /api/catalogues/[id]/events/filtered', () => {
  const context = { params: Promise.resolve({ id: 'cat' }) };
  const get = (qs: string) => getFiltered(new NextRequest(`http://localhost/api/catalogues/cat/events/filtered?${qs}`), context);
  let cursor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (requireViewer as jest.Mock).mockResolvedValue({ user: { id: 'viewer' } });
    cursor = {};
    cursor.sort = jest.fn(() => cursor);
    cursor.skip = jest.fn(() => cursor);
    cursor.limit = jest.fn(() => cursor);
    cursor.toArray = jest.fn(async () => [{ _id: 'x', id: 'e1', magnitude: 4.5 }]);
    collection.find = jest.fn(() => cursor);
  });

  it.each(['maxMagnitude=4,7', 'minMagnitude=M4', 'minLongitude=abc', 'minUsedPhaseCount=10.5'])(
    'answers 400 for %s without querying', async (qs) => {
      const response = await get(qs);
      expect(response.status).toBe(400);
      expect(collection.find).not.toHaveBeenCalled();
    });

  it('queries with the parsed, validated filters', async () => {
    const response = await get('maxMagnitude=4.7&minQuality=60&maxDepthUncertainty=2');
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(collection.find).toHaveBeenCalledWith({
      catalogue_id: 'cat',
      magnitude: { $lte: 4.7 },
      depth_uncertainty: { $gte: 0, $lte: 2 },
      quality_score: { $gte: 60 },
    });
    expect(body.filters).toEqual({ maxMagnitude: 4.7, minQuality: 60, maxDepthUncertainty: 2 });
    expect(body.count).toBe(1);
  });

  it('still requires a viewer', async () => {
    (requireViewer as jest.Mock).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    expect((await get('minMagnitude=3')).status).toBe(401);
  });
});

describe('C4 :: getFilteredEvents paging', () => {
  it('honours an explicit limit and offset and reports truncation', async () => {
    const cursor: any = {};
    cursor.sort = jest.fn(() => cursor);
    cursor.skip = jest.fn(() => cursor);
    cursor.limit = jest.fn(() => cursor);
    cursor.toArray = jest.fn(async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    collection.find = jest.fn(() => cursor);

    const result = await dbQueries!.getFilteredEvents('cat', { minMagnitude: 2 }, { limit: 2, offset: 4 });

    expect(cursor.skip).toHaveBeenCalledWith(4);
    expect(cursor.limit).toHaveBeenCalledWith(3);
    expect(result.events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(2);
  });
});
