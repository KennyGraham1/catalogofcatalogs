/**
 * @jest-environment node
 *
 * Regression tests for GET /api/catalogues/[id]/statistics (cluster: server2).
 *
 * The endpoint answers with nulls for a catalogue it has no ranges for — an empty
 * catalogue, or one whose events carry no magnitude at all, since MongoDB's
 * $min/$max/$avg skip missing fields and return null. Those nulls used to be cast
 * into an interface that declared the fields non-nullable, so a consumer following
 * the exported type would dereference null.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(async () => ({ user: { id: 'viewer', email: 'v@example.com' } })),
}));

jest.mock('@/lib/db', () => ({
  __esModule: true,
  dbQueries: {
    getCatalogueById: jest.fn(),
    getCatalogueEventStatistics: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { GET, type CatalogueStatistics } from '@/app/api/catalogues/[id]/statistics/route';
import { dbQueries } from '@/lib/db';

const mockDb = dbQueries as unknown as Record<string, jest.Mock>;

const get = () =>
  GET(new NextRequest('http://localhost/api/catalogues/cat-1/statistics'), {
    params: Promise.resolve({ id: 'cat-1' }),
  });

/** What getCatalogueEventStatistics returns for a catalogue with no events at all. */
const emptyAggregate = {
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
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getCatalogueById.mockResolvedValue({ id: 'cat-1', name: 'Test' });
});

describe('server2 :: catalogue statistics nullability', () => {
  it('declares the ranges nullable on the exported type', () => {
    // Compile-time assertion (checked by `tsc --noEmit`): these must be assignable,
    // otherwise the type promises a consumer something the endpoint does not send.
    const dateRange: CatalogueStatistics['dateRange'] = null;
    const magnitudeRange: CatalogueStatistics['magnitudeRange'] = null;
    const depthRange: CatalogueStatistics['depthRange'] = null;
    const qualityMetrics: CatalogueStatistics['qualityMetrics'] = null;

    expect([dateRange, magnitudeRange, depthRange, qualityMetrics]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('returns nulls, not zeroes, for a catalogue with no events', async () => {
    mockDb.getCatalogueEventStatistics.mockResolvedValue(emptyAggregate);

    const body = await (await get()).json();

    expect(body.eventCount).toBe(0);
    expect(body.dateRange).toBeNull();
    expect(body.magnitudeRange).toBeNull();
    expect(body.depthRange).toBeNull();
    expect(body.qualityMetrics).toBeNull();
  });

  it('reports no magnitude range when no event carries a magnitude', async () => {
    mockDb.getCatalogueEventStatistics.mockResolvedValue({
      ...emptyAggregate,
      eventCount: 4,
      earliestTime: '2016-11-13T11:02:56.100Z',
      latestTime: '2016-11-14T23:02:56.100Z',
      // $min/$max/$avg over a field no document has -> null, not 0.
      magnitudeCount: 0,
      eventsWithUncertainty: 1,
    });

    const body = await (await get()).json();

    expect(body.magnitudeRange).toBeNull();
    // 2016-11-13T11:02:56.100Z .. 2016-11-14T23:02:56.100Z is 36 h = 1.5 days -> ceil 2.
    expect(body.dateRange).toEqual({
      earliest: '2016-11-13T11:02:56.100Z',
      latest: '2016-11-14T23:02:56.100Z',
      spanDays: 2,
    });
    // No event carries a depth either: no depth range, exactly as for magnitudes.
    // (The old {min: 0, max: 0, average: 0} placeholder claimed every event sat at
    // 0 km, which is a real depth — gap finding gt#6.)
    expect(body.depthRange).toBeNull();
  });

  it('reports the ranges when the aggregation has them', async () => {
    mockDb.getCatalogueEventStatistics.mockResolvedValue({
      ...emptyAggregate,
      eventCount: 3,
      earliestTime: '2016-11-13T11:02:56.100Z',
      latestTime: '2016-11-14T23:02:56.100Z',
      magnitudeCount: 3,
      minMagnitude: 2.4,
      maxMagnitude: 7.9,
      averageMagnitude: 4.6,
      medianMagnitude: 3.5,
      depthCount: 3,
      minDepth: 5,
      maxDepth: 33,
      averageDepth: 15,
      magnitudeTypes: [{ type: 'Mw', count: 3 }],
      averageAzimuthalGap: 62.5,
      averageStationCount: 31,
      eventsWithUncertainty: 2,
      eventsWithHorizontalUncertainty: 2,
      eventsWithDepthUncertainty: 1,
      eventsWithFocalMechanism: 1,
      qualityScoreCount: 3,
      averageQualityScore: 61.5,
      qualityGrades: [{ grade: 'B', count: 1 }, { grade: 'C', count: 2 }],
    });

    const body = await (await get()).json();

    expect(body.magnitudeRange).toEqual({ min: 2.4, max: 7.9, average: 4.6, median: 3.5 });
    expect(body.depthRange).toEqual({ min: 5, max: 33, average: 15 });
    expect(body.qualityMetrics).toEqual({
      averageAzimuthalGap: 62.5,
      averageStationCount: 31,
      eventsWithUncertainty: 2,
      eventsWithHorizontalUncertainty: 2,
      eventsWithDepthUncertainty: 1,
      eventsWithFocalMechanism: 1,
      eventsWithQualityScore: 3,
      averageQualityScore: 61.5,
      gradeDistribution: [{ grade: 'B', count: 1 }, { grade: 'C', count: 2 }],
    });
  });
});
