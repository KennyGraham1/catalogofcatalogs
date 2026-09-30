/**
 * @jest-environment node
 *
 * Regression tests for the db-api cluster fixes in the catalogue API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET as getEvents } from '@/app/api/catalogues/[id]/events/route';
import { GET as getStatistics } from '@/app/api/catalogues/[id]/statistics/route';
import { dbQueries } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { eventCache } from '@/lib/cache';
import { statisticsCache } from '@/lib/cache';

// Statistics are cached per catalogue generation; tests reuse catalogue ids.
beforeEach(() => statisticsCache.clearAll());

jest.mock('@/lib/auth/middleware', () => ({ requireViewer: jest.fn() }));
jest.mock('@/lib/db', () => ({
  dbQueries: {
    getEventsByCatalogueId: jest.fn(),
    getEventsByCatalogueIdCursor: jest.fn(),
    getCatalogueById: jest.fn(),
    getCatalogueEventStatistics: jest.fn(),
  },
}));

const db = dbQueries!;

beforeEach(() => {
  jest.clearAllMocks();
  eventCache.clearAll();
  (requireViewer as jest.Mock).mockResolvedValue({ user: { id: 'viewer' } });
});

describe('db-api :: GET /api/catalogues/[id]/events', () => {
  const request = (query: string) =>
    new NextRequest(`http://localhost/api/catalogues/cat/events?${query}`);
  const context = { params: Promise.resolve({ id: 'cat' }) };

  beforeEach(() => {
    (db.getEventsByCatalogueId as jest.Mock).mockResolvedValue({
      data: [],
      pagination: { page: 2, pageSize: 100, totalItems: 500, totalPages: 5 },
    });
  });

  it('passes the requested offset straight through as an absolute skip', async () => {
    // The documented contract is "offset = number of items to skip", so
    // limit=100&offset=150 must return rows 150..249. Converting the offset to
    // page = floor(150/100) + 1 returned rows 100..199 instead: half the window
    // repeated from the previous page and half never returned at all.
    await getEvents(request('limit=100&offset=150'), context);

    expect(db.getEventsByCatalogueId).toHaveBeenCalledWith('cat', { offset: 150, pageSize: 100 });
    expect((db.getEventsByCatalogueId as jest.Mock).mock.calls[0][1]).not.toHaveProperty('page');
  });

  it.each([
    ['limit=50&offset=75', 75, 50],
    ['limit=10&offset=15', 15, 10],
    ['offset=33', 33, 100],
  ])('%s skips %i with page size %i', async (query, offset, pageSize) => {
    await getEvents(request(query), context);
    expect(db.getEventsByCatalogueId).toHaveBeenCalledWith('cat', { offset, pageSize });
  });

  it('leaves explicit page/pageSize requests on the page path', async () => {
    await getEvents(request('page=3&pageSize=25'), context);
    expect(db.getEventsByCatalogueId).toHaveBeenCalledWith('cat', { page: 3, pageSize: 25 });
  });
});

describe('db-api :: GET /api/catalogues/[id]/statistics', () => {
  const request = () => new NextRequest('http://localhost/api/catalogues/cat/statistics');
  const context = { params: Promise.resolve({ id: 'cat' }) };

  beforeEach(() => {
    (db.getCatalogueById as jest.Mock).mockResolvedValue({ id: 'cat', name: 'Test' });
  });

  it('reports the aggregated statistics without ever loading the events', async () => {
    // Reducing in Node meant Math.min(...magnitudes), which throws RangeError
    // above ~125,263 elements on Node 20 — an HTTP 500 for any catalogue past
    // that size, and several New Zealand catalogues are over 200,000 events.
    (db.getCatalogueEventStatistics as jest.Mock).mockResolvedValue({
      eventCount: 200000,
      earliestTime: '2000-01-01T00:00:00.000Z',
      latestTime: '2000-01-11T00:00:00.000Z',
      magnitudeCount: 200000,
      minMagnitude: 0,
      maxMagnitude: 6.99,
      averageMagnitude: 3.4925,
      medianMagnitude: 3.49,
      depthCount: 200000,
      minDepth: 0,
      maxDepth: 299,
      averageDepth: 149.5,
      magnitudeTypes: [{ type: 'ML', count: 200000 }],
      averageAzimuthalGap: 120,
      averageStationCount: 8,
      eventsWithUncertainty: 5,
      eventsWithHorizontalUncertainty: 4,
      eventsWithDepthUncertainty: 3,
      eventsWithFocalMechanism: 1,
      qualityScoreCount: 200000,
      averageQualityScore: 64.2,
      qualityGrades: [{ grade: 'A', count: 50000 }, { grade: 'C', count: 150000 }],
    });

    const response = await getStatistics(request(), context);
    const body = await response.json();

    expect((db as any).getEventsByCatalogueId).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body.eventCount).toBe(200000);
    expect(body.magnitudeRange).toEqual({ min: 0, max: 6.99, average: 3.4925, median: 3.49 });
    expect(body.depthRange).toEqual({ min: 0, max: 299, average: 149.5 });
    // 2000-01-01 to 2000-01-11 is exactly 10 days.
    expect(body.dateRange).toEqual({
      earliest: '2000-01-01T00:00:00.000Z',
      latest: '2000-01-11T00:00:00.000Z',
      spanDays: 10,
    });
    expect(body.qualityMetrics).toEqual({
      averageAzimuthalGap: 120,
      averageStationCount: 8,
      eventsWithUncertainty: 5,
      eventsWithHorizontalUncertainty: 4,
      eventsWithDepthUncertainty: 3,
      eventsWithFocalMechanism: 1,
      eventsWithQualityScore: 200000,
      averageQualityScore: 64.2,
      gradeDistribution: [{ grade: 'A', count: 50000 }, { grade: 'C', count: 150000 }],
    });
    // Catalogues stored before versioning report 1.0.0 (contract C3).
    expect(body.version).toBe('1.0.0');
  });

  it('keeps the historical empty-catalogue envelope', async () => {
    (db.getCatalogueEventStatistics as jest.Mock).mockResolvedValue({
      eventCount: 0,
      earliestTime: null,
      latestTime: null,
      magnitudeCount: 0,
      minMagnitude: null,
      maxMagnitude: null,
      averageMagnitude: null,
      medianMagnitude: null,
      depthCount: 0,
      minDepth: null,
      maxDepth: null,
      averageDepth: null,
      magnitudeTypes: [],
      averageAzimuthalGap: null,
      averageStationCount: null,
      eventsWithUncertainty: 0,
      eventsWithHorizontalUncertainty: 0,
      eventsWithDepthUncertainty: 0,
      eventsWithFocalMechanism: 0,
      qualityScoreCount: 0,
      averageQualityScore: null,
      qualityGrades: [],
    });

    const body = await (await getStatistics(request(), context)).json();

    expect(body).toEqual({
      catalogueId: 'cat',
      version: '1.0.0',
      eventCount: 0,
      dateRange: null,
      magnitudeRange: null,
      depthRange: null,
      magnitudeTypes: [],
      qualityMetrics: null,
    });
  });

  it('reports no depth range when no event carries a depth', async () => {
    (db.getCatalogueEventStatistics as jest.Mock).mockResolvedValue({
      eventCount: 3,
      earliestTime: '2020-01-01T00:00:00.000Z',
      latestTime: '2020-01-01T12:00:00.000Z',
      magnitudeCount: 3,
      minMagnitude: 1,
      maxMagnitude: 3,
      averageMagnitude: 2,
      medianMagnitude: 2,
      depthCount: 0,
      minDepth: null,
      maxDepth: null,
      averageDepth: null,
      magnitudeTypes: [],
      averageAzimuthalGap: null,
      averageStationCount: null,
      eventsWithUncertainty: 0,
      eventsWithHorizontalUncertainty: 0,
      eventsWithDepthUncertainty: 0,
      eventsWithFocalMechanism: 0,
      qualityScoreCount: 0,
      averageQualityScore: null,
      qualityGrades: [],
    });

    const body = await (await getStatistics(request(), context)).json();

    // Null, as for magnitudes: 0 km is a real depth, so a zeroed range claimed every
    // event sat at the datum (gap finding gt#6).
    expect(body.depthRange).toBeNull();
    // Half a day still counts as one day of span.
    expect(body.dateRange.spanDays).toBe(1);
    expect(body.qualityMetrics.averageAzimuthalGap).toBeUndefined();
  });

  it('requires authentication', async () => {
    (requireViewer as jest.Mock).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    expect((await getStatistics(request(), context)).status).toBe(401);
    expect(db.getCatalogueEventStatistics).not.toHaveBeenCalled();
  });
});
