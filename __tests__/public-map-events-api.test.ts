/** @jest-environment node */
/**
 * Maps are public: GET /api/catalogues/[id]/events?view=map answers without a session, with
 * only EVENT_MAP_PROJECTION's fields, for catalogues the public list shows, rate-limited per
 * address for signed-out clients only. The summary and full views still need a session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GET } from '@/app/api/catalogues/[id]/events/route';
import { EVENT_MAP_PROJECTION, EVENT_SUMMARY_PROJECTION, dbQueries, toEventMapRow, type EventMapRow } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { eventCache, registerCacheGenerationSource } from '@/lib/cache';
import { GUEST_MAP_RATE_LIMIT } from '@/lib/rate-limiter';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import type { CatalogueMapEvent } from '@/lib/catalogue-event-loader';
import type { CircleMapEvent } from '@/components/map/EarthquakeCircleMap';
import type { PopupEvent } from '@/components/map/OptimizedEventPopup';
import type { OverlayEvent } from '@/components/map/MapOverlays';
import type { EventCardFields } from '@/lib/map-event-card';

jest.mock('@/lib/mongodb', () => ({ getCollection: jest.fn(), COLLECTIONS: { EVENTS: 'merged_events', CATALOGUES: 'merged_catalogues' } }));
jest.mock('@/lib/auth/middleware', () => ({ requireViewer: jest.fn() }));
jest.mock('@/lib/db', () => ({
  ...jest.requireActual('@/lib/db'),
  dbQueries: { getEventsByCatalogueIdCursor: jest.fn(), getEventsByCatalogueId: jest.fn(), getCatalogueById: jest.fn() },
}));

// Compile-time: every event field the map components declare is in the map view, except
// `catalogue` (stamped by the loader) and source_events (provenance; the source-catalogue
// colour mode falls back to source_catalogue_ids, as it does on summary rows).
type MapComponentField = keyof CircleMapEvent | keyof PopupEvent | keyof OverlayEvent | keyof EventCardFields;
type NotInMapView = Exclude<MapComponentField, keyof CatalogueMapEvent | 'source_events'>;
const everyMapFieldIsServed: [NotInMapView] extends [never] ? true : NotInMapView = true;

const db = dbQueries as unknown as Record<'getEventsByCatalogueIdCursor' | 'getEventsByCatalogueId' | 'getCatalogueById', jest.Mock>;
const MAP_FIELDS = Object.keys(EVENT_MAP_PROJECTION).filter(field => field !== '_id').sort();

const FOCAL_MECHANISMS = JSON.stringify([{
  publicID: 'smi:fm/1',
  nodalPlanes: { nodalPlane1: { strike: { value: 30 }, dip: { value: 60 }, rake: { value: 90 } }, preferredPlane: 1 },
  momentTensor: { scalarMoment: { value: 1.2e17 }, tensor: { Mrr: { value: 1 } } },
  creationInfo: { author: 'analyst@example.org', agencyID: 'GNS' },
}]);

/** A stored row with every kind of field: what the map reads, and what it must not get. */
const FULL_ROW = {
  id: 'e1', catalogue_id: 'cat', time: '2024-03-01T10:00:00.000Z', latitude: -41.2, longitude: 174.8,
  depth: 12, magnitude: 4.1, magnitude_type: 'ML', depth_uncertainty: 1.5, depth_type: 'from location',
  source_id: '2024p123456', event_public_id: 'smi:nz.org.geonet/2024p123456', region: 'Wellington',
  event_type: 'earthquake', used_station_count: 20, agency_id: 'WEL', azimuthal_gap: 80, quality_score: 71, quality_grade: 'B',
  time_uncertainty: 0.2, used_phase_count: 40, standard_error: 0.3, magnitude_uncertainty: 0.1,
  magnitude_station_count: 12, evaluation_mode: 'manual', evaluation_status: 'reviewed',
  source_catalogue_ids: ['geonet'], horizontal_uncertainty: 2, min_horizontal_uncertainty: 1,
  max_horizontal_uncertainty: 3, azimuth_max_horizontal_uncertainty: 45, confidence_level: 68,
  latitude_uncertainty: 0.01, longitude_uncertainty: 0.02, focal_mechanisms: FOCAL_MECHANISMS,
  preferred_focal_mechanism_id: 'smi:fm/1',
  // Never in the map view:
  source_events: '[{"catalogueId":"geonet","selected":true}]', picks: '[{"station":"WEL"}]', arrivals: '[]',
  origins: '[]', magnitudes: '[]', amplitudes: '[]', station_magnitudes: '[]', event_descriptions: '[]',
  comments: '[]', creation_info: '{"author":"someone"}', origin_quality: '{}', merge_strategy: 'priority',
  merge_parameters: '{}', review_status: 'resolved', review_reasons: ['conflict'], reviewed_by: 'user-7',
  reviewed_at: '2024-04-01T00:00:00Z', review_choice: 'keep', created_at: '2024-03-02T00:00:00Z',
  location_name: 'Somewhere', author: 'A. Analyst', earth_model_id: 'nz3d', method_id: 'NonLinLoc',
};

const page = (rows: unknown[]) => ({ data: rows, pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 500 } });
const context = { params: Promise.resolve({ id: 'cat' }) };
let address = 0;
/** A request from its own client address, so tests do not share a rate-limit budget. */
function client(ip = `198.51.100.${++address}`) {
  return (query: string) => new NextRequest(`http://localhost/api/catalogues/cat/events?${query}`, { headers: { 'x-forwarded-for': ip } });
}
const signedOut = () => (requireViewer as jest.Mock).mockResolvedValue(NextResponse.json({ error: 'Authentication required' }, { status: 401 }));
const signedIn = () => (requireViewer as jest.Mock).mockResolvedValue({ session: {}, user: { id: 'viewer', role: 'viewer' } });

beforeAll(() => registerCacheGenerationSource(null));
beforeEach(() => {
  jest.clearAllMocks();
  eventCache.clearAll();
  db.getCatalogueById.mockResolvedValue({ id: 'cat', name: 'Catalogue', status: 'complete' });
  db.getEventsByCatalogueIdCursor.mockResolvedValue(page([FULL_ROW]));
  signedOut();
});

describe('the map projection', () => {
  it('is checked against the map components at compile time', () => {
    expect(everyMapFieldIsServed).toBe(true);
  });

  it('keeps only fields the summary view keeps (map rows are cut from summary rows)', () => {
    for (const field of MAP_FIELDS) expect(EVENT_SUMMARY_PROJECTION).not.toHaveProperty(field);
  });

  it.each([
    'source_events', 'picks', 'arrivals', 'origins', 'magnitudes', 'amplitudes', 'station_magnitudes',
    'event_descriptions', 'comments', 'creation_info', 'origin_quality', 'merge_strategy', 'merge_parameters',
    'review_status', 'review_reasons', 'reviewed_by', 'reviewed_at', 'review_choice', 'created_at', 'catalogue_id',
    'author',
  ])('leaves out %s', (field) => {
    expect(EVENT_MAP_PROJECTION).not.toHaveProperty(field);
  });

  it('cuts focal mechanisms to the nodal planes the beach balls draw, drawing the same mechanism', () => {
    const row = toEventMapRow(FULL_ROW as never) as EventMapRow;
    const served = JSON.parse(row.focal_mechanisms as string);
    expect(served).toEqual([{ publicID: 'smi:fm/1', nodalPlanes: JSON.parse(FOCAL_MECHANISMS)[0].nodalPlanes }]);
    expect(parseFocalMechanism(row.focal_mechanisms, row.preferred_focal_mechanism_id))
      .toEqual(parseFocalMechanism(FOCAL_MECHANISMS, 'smi:fm/1'));
    expect(toEventMapRow({ ...FULL_ROW, focal_mechanisms: 'not json' } as never).focal_mechanisms).toBeNull();
  });
});

describe('GET /api/catalogues/[id]/events?view=map', () => {
  it('answers without a session, with exactly the projection\'s fields', async () => {
    const response = await GET(client()('view=map&limit=500'), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.data[0]).sort()).toEqual(MAP_FIELDS);
    expect(body.data[0]).toMatchObject({ id: 'e1', magnitude: 4.1, quality_score: 71, source_catalogue_ids: ['geonet'], agency_id: 'WEL' });
    expect(body.pagination).toEqual(page([]).pagination);
  });

  it('serves a signed-in user the same fields', async () => {
    signedIn();
    const body = await (await GET(client()('view=map&limit=500'), context)).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(MAP_FIELDS);
  });

  it('keeps the summary pagination: cursor pages, the same caps, the same cursor checks', async () => {
    await GET(client()('view=map&limit=50000'), context);
    expect(db.getEventsByCatalogueIdCursor).toHaveBeenCalledWith('cat', expect.objectContaining({ limit: 10000, summary: true, direction: 'desc' }));
    expect((await GET(client()('view=map&cursor=not-a-cursor'), context)).status).toBe(400);
    expect((await GET(client()('view=map&limit=0'), context)).status).toBe(400);
    expect(db.getEventsByCatalogueId).not.toHaveBeenCalled();
  });

  it('maps only catalogues the public list shows', async () => {
    db.getCatalogueById.mockResolvedValue(undefined);
    const response = await GET(client()('view=map'), context);
    expect(response.status).toBe(404);
    expect(db.getCatalogueById).toHaveBeenCalledWith('cat');
    expect(db.getEventsByCatalogueIdCursor).not.toHaveBeenCalled();
  });

  it('rate-limits signed-out requests per client address, with a clear 429', async () => {
    const send = client('203.0.113.9');
    for (let i = 0; i < GUEST_MAP_RATE_LIMIT.requests; i++) {
      expect((await GET(send('view=map&limit=5000'), context)).status).toBe(200);
    }
    const refused = await GET(send('view=map&limit=5000'), context);
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toMatch(/^Too many map requests from your network\. Wait a few minutes/);
    expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(refused.headers.get('X-RateLimit-Limit')).toBe(String(GUEST_MAP_RATE_LIMIT.requests));

    // Another address has its own budget; a signed-in viewer at the same address has none.
    expect((await GET(client('203.0.113.10')('view=map'), context)).status).toBe(200);
    signedIn();
    for (let i = 0; i < 5; i++) expect((await GET(send('view=map&limit=5000'), context)).status).toBe(200);
  });

  it('does not limit signed-in map requests', async () => {
    signedIn();
    const send = client('203.0.113.20');
    for (let i = 0; i < GUEST_MAP_RATE_LIMIT.requests + 5; i++) {
      expect((await GET(send('view=map&limit=5000'), context)).status).toBe(200);
    }
  });
});

describe('the other views still need a session', () => {
  it.each(['view=summary&limit=500', 'limit=500', 'page=1&pageSize=50', '', 'view=bogus'])('refuses a guest: %s', async (query) => {
    const response = await GET(client()(query), context);
    expect(response.status).toBe(401);
    expect(db.getEventsByCatalogueIdCursor).not.toHaveBeenCalled();
    expect(db.getEventsByCatalogueId).not.toHaveBeenCalled();
  });

  it('serves a signed-in summary page as before: every summary field, no catalogue lookup', async () => {
    signedIn();
    const summaryRow = { ...FULL_ROW, source_events: undefined, picks: undefined };
    db.getEventsByCatalogueIdCursor.mockResolvedValue(page([summaryRow]));
    const body = await (await GET(client()('view=summary&limit=500'), context)).json();
    expect(body.data[0]).toMatchObject({ review_status: 'resolved', created_at: '2024-03-02T00:00:00Z', focal_mechanisms: FOCAL_MECHANISMS });
    expect(db.getCatalogueById).not.toHaveBeenCalled();
    expect((await GET(client()('view=bogus'), context)).status).toBe(400);
  });
});
