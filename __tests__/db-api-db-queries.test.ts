/**
 * @jest-environment node
 *
 * Regression tests for the db-api cluster fixes in lib/db.ts.
 *
 * MongoDB is mocked: these assert the query/sort/skip/pipeline the layer emits
 * and the pure arithmetic around it. The same behaviours were additionally run
 * against a real MongoDB 7.0 while the fixes were written (see each test's
 * comment for the independently derived expectation).
 */

const collection: any = {};

jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  getCollection: jest.fn(async () => collection),
  COLLECTIONS: { CATALOGUES: 'catalogues', EVENTS: 'events' },
  withTransaction: jest.fn(),
}));

jest.mock('@/lib/cache', () => ({
  invalidateCatalogueCache: jest.fn(),
}));

import { dbQueries } from '@/lib/db';

type Cursor = {
  sort: jest.Mock;
  skip: jest.Mock;
  limit: jest.Mock;
  toArray: jest.Mock;
};

function makeCursor(docs: any[]): Cursor {
  const cursor: any = {};
  cursor.sort = jest.fn(() => cursor);
  cursor.skip = jest.fn(() => cursor);
  cursor.limit = jest.fn(() => cursor);
  cursor.toArray = jest.fn(async () => docs);
  return cursor;
}

describe('db-api :: lib/db.ts', () => {
  let cursor: Cursor;
  let aggregateResults: any[][];
  let aggregateCalls: Array<{ pipeline: any[]; options: any }>;

  beforeEach(() => {
    jest.clearAllMocks();
    cursor = makeCursor([]);
    aggregateResults = [];
    aggregateCalls = [];
    collection.find = jest.fn(() => cursor);
    collection.countDocuments = jest.fn(async () => 0);
    collection.insertMany = jest.fn(async (docs: any[]) => ({ insertedCount: docs.length }));
    collection.aggregate = jest.fn((pipeline: any[], options: any) => {
      aggregateCalls.push({ pipeline, options });
      const next = aggregateResults.shift() ?? [];
      return { toArray: async () => next };
    });
  });

  describe('limit/offset pagination', () => {
    it('skips the absolute offset instead of rounding it down to a page boundary', async () => {
      // offset=150, limit=100 must return rows 150..249. Deriving the skip from
      // page = floor(150/100) + 1 = 2 gave skip = 100, i.e. rows 100..199.
      await dbQueries!.getEventsByCatalogueId('cat', { offset: 150, pageSize: 100 });

      expect(cursor.skip).toHaveBeenCalledWith(150);
      expect(cursor.limit).toHaveBeenCalledWith(100);
    });

    it.each([
      [150, 100, 150, 2],
      [75, 50, 75, 2],
      [15, 10, 15, 2],
      [0, 25, 0, 1],
      [250, 100, 250, 3],
    ])('offset=%i pageSize=%i skips %i and reports page %i', async (offset, pageSize, skip, page) => {
      const result = await dbQueries!.getEventsByCatalogueId('cat', { offset, pageSize });

      expect(cursor.skip).toHaveBeenCalledWith(skip);
      expect((result as any).pagination.page).toBe(page);
      expect((result as any).pagination.pageSize).toBe(pageSize);
    });

    it('still honours page when no offset is supplied', async () => {
      await dbQueries!.getEventsByCatalogueId('cat', { page: 3, pageSize: 40 });

      expect(cursor.skip).toHaveBeenCalledWith(80);
      expect(cursor.limit).toHaveBeenCalledWith(40);
    });

    it('applies the same absolute offset to catalogue listings', async () => {
      await dbQueries!.getCatalogues({ offset: 7, pageSize: 5 });

      expect(cursor.skip).toHaveBeenCalledWith(7);
      expect(cursor.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('stable event ordering', () => {
    // `time` is not unique: a date-only origin time normalises to exact midnight,
    // so a day-precision historical catalogue has whole blocks sharing one value.
    // Without a unique tiebreaker, skip/limit over the tie group may repeat a
    // document on one page and drop it from another.
    it('breaks ties on id when paging events', async () => {
      await dbQueries!.getEventsByCatalogueId('cat', { page: 2, pageSize: 10 });
      expect(cursor.sort).toHaveBeenCalledWith({ time: -1, id: -1 });
    });

    it('breaks ties on id when returning events unpaginated', async () => {
      await dbQueries!.getEventsByCatalogueId('cat');
      expect(cursor.sort).toHaveBeenCalledWith({ time: -1, id: -1 });
    });

    it('breaks ties on id when returning filtered events', async () => {
      await dbQueries!.getFilteredEvents('cat', {});
      expect(cursor.sort).toHaveBeenCalledWith({ time: -1, id: -1 });
    });
  });

  describe('getFilteredEvents longitude predicate', () => {
    it('splits a dateline-crossing range into the two arcs either side of 180', async () => {
      // minLongitude > maxLongitude is the RFC 7946 §5.2 crossing convention.
      // {$gte: 179, $lte: -179} is unsatisfiable, so the endpoint reported zero
      // events for the whole Kermadec arc.
      await dbQueries!.getFilteredEvents('cat', { minLongitude: 179, maxLongitude: -179 });

      const query = collection.find.mock.calls[0][0];
      expect(query.longitude).toBeUndefined();
      expect(query.$or).toEqual([
        { longitude: { $gte: 179 } },
        { longitude: { $lte: -179 } },
      ]);
    });

    it('keeps a plain range for a box that does not cross the dateline', async () => {
      await dbQueries!.getFilteredEvents('cat', { minLongitude: 166, maxLongitude: 179 });

      const query = collection.find.mock.calls[0][0];
      expect(query.longitude).toEqual({ $gte: 166, $lte: 179 });
      expect(query.$or).toBeUndefined();
    });

    it('leaves one-sided longitude bounds as a plain range', async () => {
      await dbQueries!.getFilteredEvents('cat', { minLongitude: 179 });

      const query = collection.find.mock.calls[0][0];
      expect(query.longitude).toEqual({ $gte: 179 });
      expect(query.$or).toBeUndefined();
    });
  });

  describe('bulkInsertEvents insert accounting', () => {
    const event = (id: string, sourceId?: string) => ({
      id,
      catalogue_id: 'cat',
      time: '2024-03-01T00:00:00.000Z',
      latitude: -41,
      longitude: 174,
      magnitude: 3,
      source_events: '[]',
      ...(sourceId ? { source_id: sourceId } : {}),
    });

    it('reports rows written, not rows submitted, when a batch repeats a source_id', async () => {
      // 4 rows in, one repeating source_id 's2' -> 3 documents handed to Mongo.
      const inserted = await dbQueries!.bulkInsertEvents([
        event('a', 's1'), event('b', 's2'), event('c', 's2'), event('d', 's3'),
      ] as any);

      expect(collection.insertMany.mock.calls[0][0]).toHaveLength(3);
      expect(inserted).toBe(3);
    });

    it('reports the partial insert count when the unique index rejects duplicates', async () => {
      // ordered:false lets Mongo write the non-colliding rows and report E11000
      // for the rest; the driver still carries the partial result on the error.
      collection.insertMany = jest.fn(async () => {
        const err: any = new Error('E11000 duplicate key error');
        err.code = 11000;
        err.writeErrors = [{ code: 11000 }, { code: 11000 }];
        err.result = { insertedCount: 8 };
        throw err;
      });

      const rows = Array.from({ length: 10 }, (_, i) => event(`e${i}`, `s${i}`));
      await expect(dbQueries!.bulkInsertEvents(rows as any)).resolves.toBe(8);
    });

    it('still rethrows write errors that are not duplicate keys', async () => {
      collection.insertMany = jest.fn(async () => {
        const err: any = new Error('not primary');
        err.code = 10107;
        throw err;
      });

      await expect(dbQueries!.bulkInsertEvents([event('a', 's1')] as any)).rejects.toThrow('not primary');
    });

    it('returns zero for an empty batch', async () => {
      await expect(dbQueries!.bulkInsertEvents([] as any)).resolves.toBe(0);
      expect(collection.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('getCatalogueEventStatistics', () => {
    const facet = (overall: Record<string, unknown>, magnitudeTypes: any[] = []) => ([{
      overall: [{
        eventCount: 10,
        earliestTime: '2020-01-01T00:00:00.000Z',
        latestTime: '2020-01-10T00:00:00.000Z',
        magnitudeCount: 10,
        minMagnitude: 1,
        maxMagnitude: 6,
        averageMagnitude: 3.5,
        depthCount: 10,
        minDepth: 0,
        maxDepth: 100,
        averageDepth: 33,
        averageAzimuthalGap: 120,
        averageStationCount: 8,
        eventsWithUncertainty: 4,
        eventsWithFocalMechanism: 2,
        ...overall,
      }],
      magnitudeTypes,
    }]);

    it('aggregates in MongoDB rather than materialising the events', async () => {
      aggregateResults = [facet({}), [{ magnitude: 3 }, { magnitude: 4 }]];

      await dbQueries!.getCatalogueEventStatistics('cat');

      // No find() at all: a 200k-event catalogue must never be pulled into Node
      // (Math.min(...array) also throws RangeError above ~125,263 elements).
      expect(collection.find).not.toHaveBeenCalled();
      expect(aggregateCalls[0].pipeline[0]).toEqual({ $match: { catalogue_id: 'cat' } });
      expect(aggregateCalls[0].options).toEqual({ allowDiskUse: true });
    });

    it('averages the two central magnitudes for an even count', async () => {
      // 10 magnitudes -> indices 4 and 5 are the two central values.
      aggregateResults = [facet({ magnitudeCount: 10 }), [{ magnitude: 3.2 }, { magnitude: 3.6 }]];

      const stats = await dbQueries!.getCatalogueEventStatistics('cat');

      const medianPipeline = aggregateCalls[1].pipeline;
      expect(medianPipeline).toContainEqual({ $skip: 4 });
      expect(medianPipeline).toContainEqual({ $limit: 2 });
      expect(stats.medianMagnitude).toBeCloseTo(3.4, 10);
    });

    it('takes the single central magnitude for an odd count', async () => {
      // 11 magnitudes -> index 5 is the median position.
      aggregateResults = [facet({ magnitudeCount: 11 }), [{ magnitude: 2.9 }]];

      const stats = await dbQueries!.getCatalogueEventStatistics('cat');

      expect(aggregateCalls[1].pipeline).toContainEqual({ $skip: 5 });
      expect(aggregateCalls[1].pipeline).toContainEqual({ $limit: 1 });
      expect(stats.medianMagnitude).toBe(2.9);
    });

    it('collapses blank and missing magnitude types into Unknown, most common first', async () => {
      aggregateResults = [
        facet({ magnitudeCount: 0 }, [
          { _id: 'ML', count: 5 },
          { _id: null, count: 3 },
          { _id: '', count: 4 },
          { _id: 'Mw', count: 5 },
        ]),
      ];

      const stats = await dbQueries!.getCatalogueEventStatistics('cat');

      expect(stats.magnitudeTypes).toEqual([
        { type: 'Unknown', count: 7 },
        { type: 'ML', count: 5 },
        { type: 'Mw', count: 5 },
      ]);
      expect(stats.medianMagnitude).toBeNull();
    });

    it('returns an all-empty result for a catalogue with no events', async () => {
      aggregateResults = [[{ overall: [], magnitudeTypes: [] }]];

      const stats = await dbQueries!.getCatalogueEventStatistics('cat');

      expect(stats.eventCount).toBe(0);
      expect(stats.minMagnitude).toBeNull();
      expect(stats.maxMagnitude).toBeNull();
      expect(stats.medianMagnitude).toBeNull();
      expect(stats.magnitudeTypes).toEqual([]);
      expect(aggregateCalls).toHaveLength(1);
    });
  });
});
