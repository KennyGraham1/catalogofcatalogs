/**
 * Regression tests for the GeoNet importer's reporting (cluster: server2).
 *
 * Covers:
 *  - a single malformed source record no longer condemning the whole catalogue: the
 *    catalogue status is derived from the failures that make the STORED catalogue wrong
 *    (a truncated GeoNet window, a failed bulk insert), not from per-event skips;
 *  - ImportResult.newEvents reporting what MongoDB actually inserted rather than the
 *    number of documents submitted, which overstates by every de-duplicated event.
 */

// p-limit v7 is ESM-only and jest does not transform node_modules here, so stub it
// with a pass-through limiter (concurrency is not what these tests exercise).
jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => (fn: () => unknown) => fn(),
}));

jest.mock('@/lib/geonet-client', () => ({
  __esModule: true,
  geonetClient: {
    fetchEventsText: jest.fn(),
    fetchEventById: jest.fn(),
  },
}));

jest.mock('@/lib/db', () => {
  const actual = jest.requireActual('@/lib/db');
  return {
    __esModule: true,
    ...actual,
    dbQueries: {
      getCatalogueById: jest.fn(),
      insertCatalogue: jest.fn(),
      getEventsBySourceIds: jest.fn(),
      getEventCoordinatesByIds: jest.fn(),
      bulkInsertEvents: jest.fn(),
      insertEvent: jest.fn(),
      updateEvent: jest.fn(),
      updateCatalogueStatus: jest.fn(),
      updateCatalogueEventCount: jest.fn(),
      updateCatalogueGeoBounds: jest.fn(),
      countEventsByCatalogue: jest.fn(),
      insertImportHistory: jest.fn(),
      getImportHistory: jest.fn(),
    },
  };
});

import { GeoNetImportService } from '@/lib/geonet-import-service';
import { dbQueries } from '@/lib/db';
import { geonetClient } from '@/lib/geonet-client';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const client = geonetClient as unknown as Record<string, jest.Mock>;

/** A realistic GeoNet FDSN `format=text` row (pipe-delimited columns, already parsed). */
function geonetRow(overrides: Record<string, unknown> = {}) {
  return {
    EventID: '2016p858055',
    Time: '2016-11-13T11:32:07',
    Latitude: -42.246,
    Longitude: 173.673,
    'Depth/km': 15,
    Author: 'WEL(GNS_Primary)',
    Catalog: 'NZ',
    Contributor: 'WEL(GNS_Primary)',
    ContributorID: '2016p858055',
    MagType: 'M',
    Magnitude: 2.4, // below the M5.0 focal-mechanism threshold: no QuakeML fetches
    MagAuthor: 'WEL(GNS_Primary)',
    EventLocationName: '15 km north of Kaikoura',
    EventType: 'earthquake',
    ...overrides,
  } as any;
}

beforeAll(() => {
  // lib/id.ts requires crypto.randomUUID; jsdom does not always provide it.
  if (!globalThis.crypto?.randomUUID) {
    let counter = 0;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        ...(globalThis.crypto || {}),
        randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
      },
    });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  db.getCatalogueById.mockResolvedValue({
    id: 'cat-1',
    min_latitude: null,
    max_latitude: null,
    min_longitude: null,
    max_longitude: null,
  });
  db.getEventsBySourceIds.mockResolvedValue(new Map());
  db.getEventCoordinatesByIds.mockResolvedValue([]);
  // The real bulkInsertEvents returns the number of documents MongoDB wrote.
  db.bulkInsertEvents.mockImplementation(async (rows: unknown[]) => rows.length);
  db.countEventsByCatalogue.mockResolvedValue(0);
  db.updateCatalogueStatus.mockResolvedValue(undefined);
  db.updateCatalogueEventCount.mockResolvedValue(undefined);
  db.updateCatalogueGeoBounds.mockResolvedValue(undefined);
  db.insertImportHistory.mockResolvedValue(undefined);
  client.fetchEventById.mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('server2 :: GeoNet import catalogue status', () => {
  it('stays complete when one source record is skipped as invalid', async () => {
    // 3 good rows + 1 with a latitude outside [-90, 90], which validateEvent rejects.
    client.fetchEventsText.mockResolvedValue([
      geonetRow({ EventID: 'ok-1', ContributorID: 'ok-1' }),
      geonetRow({ EventID: 'bad-1', ContributorID: 'bad-1', Latitude: 991 }),
      geonetRow({ EventID: 'ok-2', ContributorID: 'ok-2' }),
      geonetRow({ EventID: 'ok-3', ContributorID: 'ok-3' }),
    ]);

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    // The three valid rows are stored; the catalogue is exactly what it claims to be.
    expect(result.newEvents).toBe(3);
    const statuses = db.updateCatalogueStatus.mock.calls.map((c) => c[0]);
    expect(statuses).toEqual(['processing', 'complete']);
    expect(statuses).not.toContain('error');

    // The run still reports the skip (a partial import is not a clean one) — but the
    // stored catalogue is not branded broken because of one bad source record.
    expect(result.success).toBe(false);
    expect(result.skippedEvents).toBe(0);

    // The skip is reported to the caller and stored in the import history.
    expect(result.errors).toEqual(['Skipped event bad-1: invalid data']);
    const historyErrors = JSON.parse(db.insertImportHistory.mock.calls[0][8]);
    expect(historyErrors).toEqual(['Skipped event bad-1: invalid data']);
  });

  it('still marks the catalogue error when the insert itself fails', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow()]);
    db.bulkInsertEvents.mockRejectedValue(new Error('connection reset'));

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    expect(result.success).toBe(false);
    const statuses = db.updateCatalogueStatus.mock.calls.map((c) => c[0]);
    expect(statuses).toEqual(['processing', 'error']);
    expect(result.errors[0]).toContain('Bulk insert failed');
  });
});

describe('server2 :: GeoNet import new-event accounting', () => {
  it('reports the number of events inserted, not the number submitted', async () => {
    // Five rows are submitted; MongoDB writes three (the other two collide with the
    // partial-unique (catalogue_id, source_id) index from an earlier run and are
    // skipped by the ordered:false insert).
    client.fetchEventsText.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        geonetRow({ EventID: `ev-${i}`, ContributorID: `ev-${i}` })
      )
    );
    db.bulkInsertEvents.mockResolvedValue(3);
    db.getEventCoordinatesByIds.mockImplementation(async () => db.bulkInsertEvents.mock.calls[0][0].slice(0, 3));

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    expect(db.bulkInsertEvents).toHaveBeenCalledTimes(1);
    expect(db.bulkInsertEvents.mock.calls[0][0]).toHaveLength(5);
    expect(result.newEvents).toBe(3);
    expect(result.success).toBe(true);
    // The import history records the same figure.
    expect(db.insertImportHistory.mock.calls[0][5]).toBe(3);
  });

  it('sums the inserted counts across insertMany batches', async () => {
    // 2500 rows -> batches of 1000, 1000, 500. Each batch loses one row to a duplicate.
    client.fetchEventsText.mockResolvedValue(
      Array.from({ length: 2500 }, (_, i) =>
        geonetRow({ EventID: `ev-${i}`, ContributorID: `ev-${i}` })
      )
    );
    db.bulkInsertEvents.mockImplementation(async (rows: unknown[]) => rows.length - 1);
    db.getEventCoordinatesByIds.mockImplementation(async () => {
      const calls = db.bulkInsertEvents.mock.calls;
      return calls[calls.length - 1][0].slice(0, -1);
    });

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    const submitted = db.bulkInsertEvents.mock.calls.map((c) => c[0].length);
    expect(submitted).toEqual([1000, 1000, 500]);
    expect(result.newEvents).toBe(999 + 999 + 499);
    expect(result.success).toBe(true);
    expect(db.getEventCoordinatesByIds).toHaveBeenCalledTimes(3);
  });
});
