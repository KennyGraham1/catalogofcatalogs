// Two data-loss paths in the GeoNet importer.
// Scaffolding mirrors __tests__/geonet-import-boundary.test.ts.

jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => (fn: () => unknown) => fn(),
}));

jest.mock('@/lib/geonet-client', () => ({
  __esModule: true,
  geonetClient: { fetchEventsText: jest.fn(), fetchEventById: jest.fn() },
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

const row = (id: string, depthKm: number, mag = 3.0) => ({
  EventID: id, Time: '2024-01-01T00:00:00.000Z', Latitude: -41, Longitude: 174,
  'Depth/km': depthKm, Magnitude: mag, MagType: 'ML', EventType: 'earthquake',
  Author: 'GeoNet', EventLocationName: 'Wellington',
});

beforeEach(() => {
  jest.clearAllMocks();
  db.getCatalogueById.mockResolvedValue({ id: 'cat-1', name: 'GeoNet', status: 'complete' });
  db.getEventsBySourceIds.mockResolvedValue(new Map());
  db.getEventCoordinatesByIds.mockResolvedValue([]);
  db.bulkInsertEvents.mockImplementation(async (rows: unknown[]) => rows.length);
  db.countEventsByCatalogue.mockResolvedValue(0);
  db.updateEvent.mockResolvedValue(undefined);
  db.updateCatalogueStatus.mockResolvedValue(undefined);
  db.updateCatalogueEventCount.mockResolvedValue(undefined);
  db.updateCatalogueGeoBounds.mockResolvedValue(undefined);
  db.insertImportHistory.mockResolvedValue(undefined);
});

describe('GeoNet import resilience', () => {
  it('skips only the row the DB would reject and still stores every later batch', async () => {
    // 2001 rows across three 1000-row batches; row 1001 has depth 1001 km, outside the
    // DB validator's [-5, 1000] range. The importer's own prevalidation never checked depth,
    // so the row reached bulkInsertEvents, rejected its whole batch, and the surrounding
    // catch abandoned the final batch too: 1000 stored of 2000 valid.
    const feed = Array.from({ length: 2001 }, (_, i) => row('e' + i, i === 1000 ? 1001 : 10));
    client.fetchEventsText.mockResolvedValue(feed);

    const result = await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1' });

    const inserted = db.bulkInsertEvents.mock.calls.flatMap((c) => c[0] as Array<{ source_id: string }>);
    expect(inserted).toHaveLength(2000);
    expect(inserted.some((e) => e.source_id === 'e1000')).toBe(false);
    expect(db.getEventCoordinatesByIds).not.toHaveBeenCalled();
    // By contract `success` is false whenever anything was skipped, so a partial import
    // is never announced as clean; what must NOT happen is one bad row condemning the
    // catalogue. The skip is reported by ID and the catalogue stays 'complete'.
    expect(JSON.stringify(result)).toMatch(/e1000/);
    const statuses = db.updateCatalogueStatus.mock.calls.map((c) => c[0]);
    expect(statuses).not.toContain('error');
  });

  it('does not erase a stored focal mechanism when the detail re-fetch fails', async () => {
    const existing = '[{"nodalPlane1":{"strike":10,"dip":20,"rake":30}}]';
    db.getEventsBySourceIds.mockResolvedValue(
      new Map([['e', { id: 'db-e', source_id: 'e', magnitude: 5.1, focal_mechanisms: existing }]])
    );
    client.fetchEventsText.mockResolvedValue([row('e', 10, 5.1)]);
    client.fetchEventById.mockRejectedValue(new Error('synthetic GeoNet detail timeout'));

    await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1', updateExisting: true });

    expect(db.updateEvent).toHaveBeenCalled();
    const patch = db.updateEvent.mock.calls[0][1] as Record<string, unknown>;
    // A failed lookup must leave the field untouched, not write null over stored data.
    expect('focal_mechanisms' in patch).toBe(false);
    expect(client.fetchEventById).toHaveBeenCalledTimes(1);
  });

  it('does not fetch enrichment twice when the response contains no focal mechanism', async () => {
    db.getEventsBySourceIds.mockResolvedValue(new Map([['e', 'db-e']]));
    client.fetchEventsText.mockResolvedValue([row('e', 10, 5.1)]);
    client.fetchEventById.mockResolvedValue(null);
    await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1', updateExisting: true });
    expect(client.fetchEventById).toHaveBeenCalledTimes(1);
    expect(db.updateEvent).toHaveBeenCalledWith('db-e', expect.not.objectContaining({ focal_mechanisms: expect.anything() }));
    expect(db.updateEvent.mock.calls[0][1]).not.toHaveProperty('focal_mechanisms');
  });

  it('computes catalogue bounds from the rows it stored, not the rows it fetched', async () => {
    // One valid NZ event plus one with an invalid timestamp far away. Only the first is
    // stored, so the extent must be that one point, not [-41,80] x [0,174].
    client.fetchEventsText.mockResolvedValue([
      row('ok', 10),
      { ...row('bad', 10), Time: 'not-a-time', Latitude: 80, Longitude: 0 },
    ]);
    await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1' });
    expect(db.updateCatalogueGeoBounds).toHaveBeenCalled();
    const [, minLat, maxLat, minLon, maxLon] = db.updateCatalogueGeoBounds.mock.calls[0];
    expect([minLat, maxLat, minLon, maxLon]).toEqual([-41, -41, 174, 174]);
  });

  it('reports the committed counts when a failure happens after the writes', async () => {
    client.fetchEventsText.mockResolvedValue([row('a', 10), row('b', 10)]);
    db.countEventsByCatalogue.mockResolvedValue(2);
    db.insertImportHistory.mockRejectedValue(new Error('history collection unavailable'));
    const result = await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1' });
    expect(result.success).toBe(false);
    // Two rows were fetched and written before the history insert failed; the result
    // used to hard-code all of these to 0.
    expect(result.totalFetched).toBe(2);
    expect(result.newEvents).toBe(2);
  });

  it.each(['repeated source ID', 'concurrent collision'])('uses only stored coordinates after a %s', async (scenario) => {
    const duplicate = scenario === 'repeated source ID';
    client.fetchEventsText.mockResolvedValue(duplicate ? [
      row('collision', 10),
      { ...row('collision', 10), Latitude: 80, Longitude: 0 },
    ] : [
      { ...row('collision', 10), Latitude: 80, Longitude: 0 },
      row('new', 10),
    ]);
    db.bulkInsertEvents.mockResolvedValue(1);
    db.getEventCoordinatesByIds.mockImplementation(async (_catalogue, ids: string[]) => {
      const submitted = db.bulkInsertEvents.mock.calls[0][0];
      expect(ids).toEqual(submitted.map((event: { id: string }) => event.id));
      expect(new Set(ids).size).toBe(2);
      expect(ids).not.toContain('collision');
      // In-batch dedup keeps the first row; the concurrent-collision case rejects
      // the first row against a different document with the same source_id.
      return [{ id: submitted[duplicate ? 0 : 1].id, latitude: -41, longitude: 174 }];
    });
    const result = await new GeoNetImportService().importEvents({ catalogueId: 'cat-1' });
    expect(result.success).toBe(true);
    expect(result.newEvents).toBe(1);
    expect(db.getEventCoordinatesByIds).toHaveBeenCalledTimes(1);
    expect(db.updateCatalogueGeoBounds).toHaveBeenCalledWith('cat-1', -41, -41, 174, 174);
  });

  it('does not extend bounds or query coordinates when all insertions collide', async () => {
    client.fetchEventsText.mockResolvedValue([{ ...row('collision', 10), Latitude: 80, Longitude: 0 }]);
    db.bulkInsertEvents.mockResolvedValue(0);
    const result = await new GeoNetImportService().importEvents({ catalogueId: 'cat-1' });
    expect(result.newEvents).toBe(0);
    expect(db.getEventCoordinatesByIds).not.toHaveBeenCalled();
    expect(db.updateCatalogueGeoBounds).not.toHaveBeenCalled();
  });

  it('preserves counts and bounds for rows committed in a later batch that throws', async () => {
    client.fetchEventsText.mockResolvedValue(Array.from({ length: 2001 }, (_, i) => ({
      ...row('partial-' + i, 10), Latitude: i < 1000 ? -41 : i === 1000 ? -40 : 80,
    })));
    db.bulkInsertEvents
      .mockImplementationOnce(async (rows: unknown[]) => rows.length)
      .mockRejectedValueOnce(new Error('document validation failed after partial write'));
    db.getEventCoordinatesByIds.mockImplementation(async (_catalogue, ids: string[]) => {
      const submitted = db.bulkInsertEvents.mock.calls[1][0];
      expect(ids).toEqual(submitted.map((event: { id: string }) => event.id));
      return [{ id: submitted[0].id, latitude: -40, longitude: 174 }];
    });
    db.countEventsByCatalogue.mockResolvedValue(1001);
    const result = await new GeoNetImportService().importEvents({ catalogueId: 'cat-1' });
    expect(db.bulkInsertEvents).toHaveBeenCalledTimes(2);
    expect(db.getEventCoordinatesByIds).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.newEvents).toBe(1001);
    expect(result.errors).toEqual(['Bulk insert failed: document validation failed after partial write']);
    expect(db.insertImportHistory.mock.calls[0][5]).toBe(1001);
    expect(db.updateCatalogueGeoBounds).toHaveBeenCalledWith('cat-1', -41, -40, 174, 174);
    expect(db.updateCatalogueStatus).toHaveBeenLastCalledWith('error', 'cat-1');
  });
});
