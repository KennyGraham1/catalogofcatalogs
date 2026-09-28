/**
 * GeoNet import service regressions (cluster G).
 *
 *  #103  importing into an existing catalogue: the target must exist and be a GeoNet
 *        import catalogue, and "update existing events" then really updates.
 *  #104  GeoNet's own event classification is kept (source_event_type, C8); records it
 *        flags duplicate / not existing / not locatable are not imported, and counted.
 *  #69   every GeoNet row carries event_public_id smi:nz.org.geonet/<EventID> and the
 *        bare EventID as source_id.
 *  #107  focal mechanisms: every mechanism with its publicID, the preferred one by
 *        preferredFocalMechanismID, preferredPlane and the moment tensor are kept.
 *  #109  the result's counts add up to what GeoNet returned, and "updated" means changed.
 *  #110  a second import into a catalogue with an import running is refused.
 *
 * Only external boundaries are replaced: the GeoNet HTTP client and the database layer.
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
    fetchEventQuakeMLText: jest.fn(),
    getLastFetchDiagnostics: jest.fn(() => ({ skippedRows: 0, truncatedTail: false })),
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
      getEventBySourceId: jest.fn(),
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

import {
  GeoNetImportService,
  GeoNetImportTargetError,
  geonetEventPublicId,
} from '@/lib/geonet-import-service';
import { dbQueries } from '@/lib/db';
import { geonetClient } from '@/lib/geonet-client';
import { parseFocalMechanism, selectPlaneNumber } from '@/lib/focal-mechanism-utils';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const client = geonetClient as unknown as Record<string, jest.Mock>;

/** A GeoNet FDSN `format=text` row, already parsed by the client. */
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
    Magnitude: 2.4,
    MagAuthor: 'WEL(GNS_Primary)',
    EventLocationName: '15 km north of Kaikoura',
    EventType: 'earthquake',
    ...overrides,
  } as any;
}

const GEONET_CATALOGUE = {
  id: 'cat-geonet',
  name: 'GeoNet - Daily',
  merge_config: JSON.stringify({ source: 'GeoNet', importDate: '2026-01-01T00:00:00.000Z' }),
  min_latitude: null,
  max_latitude: null,
  min_longitude: null,
  max_longitude: null,
};

/** In-memory events collection honouring the per-catalogue source_id uniqueness. */
let stored: Array<Record<string, any>>;

function insertedDocs(): any[] {
  return db.bulkInsertEvents.mock.calls.flatMap((call) => call[0]);
}

beforeAll(() => {
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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  stored = [];

  db.getCatalogueById.mockImplementation(async (id: string) => (id === GEONET_CATALOGUE.id ? GEONET_CATALOGUE : undefined));
  db.insertCatalogue.mockResolvedValue(undefined);
  db.getEventsBySourceIds.mockImplementation(async (catalogueId: string, ids: string[]) => {
    const found = new Map<string, string>();
    for (const row of stored) {
      if (row.catalogue_id === catalogueId && ids.includes(row.source_id)) found.set(row.source_id, row.id);
    }
    return found;
  });
  db.getEventBySourceId.mockImplementation(async (catalogueId: string, sourceId: string) =>
    stored.find((row) => row.catalogue_id === catalogueId && row.source_id === sourceId)
  );
  db.bulkInsertEvents.mockImplementation(async (rows: any[]) => {
    let inserted = 0;
    for (const row of rows) {
      if (stored.some((s) => s.catalogue_id === row.catalogue_id && s.source_id === row.source_id)) continue;
      stored.push({ ...row });
      inserted++;
    }
    return inserted;
  });
  db.updateEvent.mockImplementation(async (id: string, patch: Record<string, unknown>) => {
    const row = stored.find((s) => s.id === id);
    if (row) Object.assign(row, patch);
  });
  db.getEventCoordinatesByIds.mockImplementation(async (_c: string, ids: string[]) =>
    stored.filter((row) => ids.includes(row.id)).map(({ id, latitude, longitude }) => ({ id, latitude, longitude }))
  );
  db.countEventsByCatalogue.mockImplementation(async (catalogueId: string) =>
    stored.filter((row) => row.catalogue_id === catalogueId).length
  );
  db.updateCatalogueStatus.mockResolvedValue(undefined);
  db.updateCatalogueEventCount.mockResolvedValue(undefined);
  db.updateCatalogueGeoBounds.mockResolvedValue(undefined);
  db.insertImportHistory.mockResolvedValue(undefined);
  client.fetchEventQuakeMLText.mockResolvedValue(null);
  client.getLastFetchDiagnostics.mockReturnValue({ skippedRows: 0, truncatedTail: false });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Every fetched row must be in exactly one bucket. */
function expectCountsAddUp(result: any) {
  expect(
    result.newEvents + result.updatedEvents + result.skippedEvents + result.collidedEvents +
    result.invalidEvents + result.excludedEvents + result.failedEvents
  ).toBe(result.totalFetched);
}

describe('#103 importing into an existing catalogue', () => {
  it('adds to the chosen catalogue and applies GeoNet revisions on the next run', async () => {
    const service = new GeoNetImportService();
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: '2026p000001', Magnitude: 2.1 })]);
    const first = await service.importEvents({ hours: 24, catalogueId: 'cat-geonet', updateExisting: true });

    // GeoNet revises the magnitude; the same daily import runs again.
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: '2026p000001', Magnitude: 2.4 })]);
    const second = await service.importEvents({ hours: 24, catalogueId: 'cat-geonet', updateExisting: true });

    expect(db.insertCatalogue).not.toHaveBeenCalled();
    expect([first.catalogueId, second.catalogueId]).toEqual(['cat-geonet', 'cat-geonet']);
    // The existing catalogue's own name is reported, not the form's default.
    expect(second.catalogueName).toBe('GeoNet - Daily');
    expect([first.newEvents, second.newEvents, second.updatedEvents]).toEqual([1, 0, 1]);
    expect(stored).toHaveLength(1);
    expect(stored[0].magnitude).toBe(2.4);
  });

  it('refuses a catalogue that does not exist instead of creating another one', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow()]);
    const attempt = new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'missing' });
    await expect(attempt).rejects.toBeInstanceOf(GeoNetImportTargetError);
    await expect(new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'missing' }))
      .rejects.toMatchObject({ status: 404 });
    expect(db.insertCatalogue).not.toHaveBeenCalled();
    expect(client.fetchEventsText).not.toHaveBeenCalled();
  });

  it('refuses a catalogue the GeoNet importer did not create', async () => {
    db.getCatalogueById.mockResolvedValue({
      id: 'cat-upload',
      name: 'ISC upload',
      merge_config: JSON.stringify({ source: 'upload' }),
    });
    await expect(new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-upload' }))
      .rejects.toMatchObject({ status: 400 });
    expect(client.fetchEventsText).not.toHaveBeenCalled();
  });
});

describe('#110 overlapping imports into one catalogue', () => {
  it('refuses a second run while the first is going, and accepts one afterwards', async () => {
    let release!: (rows: unknown[]) => void;
    client.fetchEventsText.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const service = new GeoNetImportService();

    const first = service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });
    try {
      await expect(service.importEvents({ hours: 1, catalogueId: 'cat-geonet' }))
        .rejects.toMatchObject({ name: 'GeoNetImportTargetError', status: 409 });
      // A different catalogue is not blocked.
      client.fetchEventsText.mockResolvedValueOnce([]);
      await expect(service.importEvents({ hours: 1 })).resolves.toMatchObject({ success: true });
    } finally {
      // Let the first run reach its GeoNet request, then answer it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      release([geonetRow()]);
    }
    await expect(first).resolves.toMatchObject({ newEvents: 1 });

    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: 'next' })]);
    await expect(service.importEvents({ hours: 1, catalogueId: 'cat-geonet' })).resolves.toMatchObject({ newEvents: 1 });
  });

  it('claims and releases the catalogue status with one run token per run', async () => {
    // Across server processes the in-process guard cannot see the other run; the
    // token lets lib/db.ts apply only the latest claimant's outcome.
    const service = new GeoNetImportService();
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: 'r1' })]);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: 'r2' })]);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    const calls = db.updateCatalogueStatus.mock.calls.map(([status, id, , options]) => ({ status, id, runId: options?.runId }));
    expect(calls.map((c) => c.status)).toEqual(['processing', 'complete', 'processing', 'complete']);
    expect(calls.every((c) => c.id === 'cat-geonet' && typeof c.runId === 'string')).toBe(true);
    expect(calls[0].runId).toBe(calls[1].runId);
    expect(calls[2].runId).toBe(calls[3].runId);
    expect(calls[0].runId).not.toBe(calls[2].runId);
    // Bounds are extended atomically in the database, not read-merged-written here.
    expect(db.updateCatalogueGeoBounds.mock.calls.every((c) => c[6]?.merge === true)).toBe(true);
  });
});

describe("#104 GeoNet's event classification", () => {
  it('keeps the raw type and does not import records GeoNet flags as not real events', async () => {
    client.fetchEventsText.mockResolvedValue([
      geonetRow({ EventID: 'real', EventType: 'earthquake' }),
      geonetRow({ EventID: 'far', EventType: 'outside of network interest' }),
      geonetRow({ EventID: 'dup', EventType: 'duplicate' }),
      geonetRow({ EventID: 'dup2', EventType: 'duplicate' }),
      geonetRow({ EventID: 'fake', EventType: 'not existing' }),
      geonetRow({ EventID: 'where', EventType: 'not locatable' }),
      geonetRow({ EventID: 'untyped', EventType: '' }),
    ]);

    const result = await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    const docs = new Map(insertedDocs().map((d) => [d.source_id, d]));
    expect(Array.from(docs.keys()).sort()).toEqual(['far', 'real', 'untyped']);
    expect(result.excludedEvents).toBe(4);
    expect(result.excludedEventTypes).toEqual({ duplicate: 2, 'not existing': 1, 'not locatable': 1 });
    // Deliberate exclusions are not failures.
    expect(result.success).toBe(true);
    expectCountsAddUp(result);

    // The agency's classification survives: QuakeML type plus the raw string (C8).
    expect(docs.get('far')).toMatchObject({ event_type: 'other event', source_event_type: 'outside of network interest' });
    expect(JSON.parse(docs.get('far').source_events)[0].eventType).toBe('outside of network interest');
    expect(docs.get('real')).toMatchObject({ event_type: 'earthquake', source_event_type: 'earthquake' });
    // A row GeoNet did not type stays distinguishable from a flagged one.
    expect(docs.get('untyped')).toMatchObject({ event_type: null, source_event_type: null });
  });

  it('flags a stored event that GeoNet later re-types as a duplicate', async () => {
    const service = new GeoNetImportService();
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: 'x1' })]);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: 'x1', EventType: 'duplicate' })]);
    const result = await service.importEvents({ hours: 1, catalogueId: 'cat-geonet', updateExisting: true });

    expect(result.updatedEvents).toBe(1);
    expect(stored[0]).toMatchObject({ event_type: 'other event', source_event_type: 'duplicate' });
  });
});

describe('#69 GeoNet event identity', () => {
  it('stores the GeoNet QuakeML publicID and the bare EventID on insert and update', async () => {
    const service = new GeoNetImportService();
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: '2016p858000' })]);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });
    expect(insertedDocs()[0]).toMatchObject({
      source_id: '2016p858000',
      event_public_id: 'smi:nz.org.geonet/2016p858000',
    });

    // A row stored before this fix (no event_public_id) gains it on update.
    delete stored[0].event_public_id;
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: '2016p858000' })]);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet', updateExisting: true });
    expect(db.updateEvent.mock.calls[0][1]).toEqual({ event_public_id: 'smi:nz.org.geonet/2016p858000' });
    expect(stored[0].source_id).toBe('2016p858000');
  });

  it('the single-event insert path builds the same row', async () => {
    const service = new GeoNetImportService() as any;
    await service.insertEvent(geonetRow({ EventID: '2020p000001' }), 'cat-geonet');
    expect(db.insertEvent.mock.calls[0][0]).toMatchObject({
      source_id: '2020p000001',
      event_public_id: geonetEventPublicId('2020p000001'),
      time: '2016-11-13T11:32:07.000Z',
    });
  });
});

// Two mechanisms; the event prefers the SECOND, which carries a moment tensor, states
// plane 2 as the fault plane (an attribute, as QuakeML-BED declares it) and writes its
// rakes on 0-360.
const FOCAL_QUAKEML = `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:nz.org.geonet/EventParameters">
    <event publicID="smi:nz.org.geonet/2016p858000">
      <focalMechanism publicID="smi:nz.org.geonet/fm/first-motion">
        <nodalPlanes>
          <nodalPlane1><strike><value>100</value></strike><dip><value>45</value></dip><rake><value>-90</value></rake></nodalPlane1>
          <nodalPlane2><strike><value>280</value></strike><dip><value>45</value></dip><rake><value>-90</value></rake></nodalPlane2>
        </nodalPlanes>
      </focalMechanism>
      <focalMechanism publicID="smi:nz.org.geonet/fm/mt">
        <nodalPlanes preferredPlane="2">
          <nodalPlane1><strike><value>40</value></strike><dip><value>85</value></dip><rake><value>5</value></rake></nodalPlane1>
          <nodalPlane2><strike><value>309.6</value></strike><dip><value>85</value></dip><rake><value>175</value></rake></nodalPlane2>
        </nodalPlanes>
        <momentTensor publicID="smi:nz.org.geonet/mt/1">
          <derivedOriginID>smi:nz.org.geonet/origin/mt</derivedOriginID>
          <scalarMoment><value>2.6e20</value></scalarMoment>
          <tensor>
            <Mrr><value>1.0e19</value></Mrr><Mtt><value>-2.0e20</value></Mtt><Mpp><value>1.9e20</value></Mpp>
            <Mrt><value>3.0e18</value></Mrt><Mrp><value>-4.0e18</value></Mrp><Mtp><value>1.1e20</value></Mtp>
          </tensor>
        </momentTensor>
      </focalMechanism>
      <focalMechanism publicID="smi:nz.org.geonet/fm/zero-360">
        <nodalPlanes>
          <nodalPlane1><strike><value>0</value></strike><dip><value>45</value></dip><rake><value>270</value></rake></nodalPlane1>
        </nodalPlanes>
      </focalMechanism>
      <preferredFocalMechanismID>smi:nz.org.geonet/fm/mt</preferredFocalMechanismID>
    </event>
  </eventParameters>
</q:quakeml>`;

describe('#107 GeoNet focal mechanisms', () => {
  it('keeps every mechanism, the preferred one, its preferred plane and moment tensor', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow({ EventID: '2016p858000', Magnitude: 7.8 })]);
    client.fetchEventQuakeMLText.mockResolvedValue(FOCAL_QUAKEML);

    await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    const doc = insertedDocs()[0];
    expect(doc.preferred_focal_mechanism_id).toBe('smi:nz.org.geonet/fm/mt');
    const mechanisms = JSON.parse(doc.focal_mechanisms);
    // All three kept with their publicIDs; the preferred one first.
    expect(mechanisms.map((m: any) => m.publicID)).toEqual([
      'smi:nz.org.geonet/fm/mt',
      'smi:nz.org.geonet/fm/first-motion',
      'smi:nz.org.geonet/fm/zero-360',
    ]);
    expect(mechanisms[0].nodalPlanes.preferredPlane).toBe(2);
    expect(mechanisms[0].momentTensor.scalarMoment.value).toBeCloseTo(2.6e20);
    expect(mechanisms[0].momentTensor.tensor.Mtp.value).toBeCloseTo(1.1e20);
    // Rake normalised to (-180, 180]: 270 is a pure normal fault, -90.
    expect(mechanisms[2].nodalPlanes.nodalPlane1.rake.value).toBe(-90);

    // What the UI reads back: the preferred mechanism, with plane 2 as the fault plane.
    const parsed = parseFocalMechanism(doc.focal_mechanisms, doc.preferred_focal_mechanism_id);
    expect(parsed?.nodalPlane2).toEqual({ strike: 309.6, dip: 85, rake: 175 });
    expect(parsed && selectPlaneNumber(parsed)).toBe(2);
  });

  it('does not overwrite a stored mechanism when the QuakeML lookup fails on update', async () => {
    const service = new GeoNetImportService();
    client.fetchEventsText.mockResolvedValue([geonetRow({ EventID: '2016p858000', Magnitude: 7.8 })]);
    client.fetchEventQuakeMLText.mockResolvedValueOnce(FOCAL_QUAKEML);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });
    const before = stored[0].focal_mechanisms;

    client.fetchEventQuakeMLText.mockRejectedValueOnce(new Error('GeoNet detail timeout'));
    const result = await service.importEvents({ hours: 1, catalogueId: 'cat-geonet', updateExisting: true });

    expect(stored[0].focal_mechanisms).toBe(before);
    // Nothing else changed either, so nothing was written or reported as updated.
    expect(result.updatedEvents).toBe(0);
    expect(result.skippedEvents).toBe(1);
  });
});

describe('#109 import accounting', () => {
  it('reports unchanged events as skipped and writes nothing for them', async () => {
    const service = new GeoNetImportService();
    const rows = [geonetRow({ EventID: 'a' }), geonetRow({ EventID: 'b' }), geonetRow({ EventID: 'c' })];
    client.fetchEventsText.mockResolvedValue(rows);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    const rerun = await service.importEvents({ hours: 1, catalogueId: 'cat-geonet', updateExisting: true });

    expect(rerun.updatedEvents).toBe(0);
    expect(rerun.skippedEvents).toBe(3);
    expect(db.updateEvent).not.toHaveBeenCalled();
    expectCountsAddUp(rerun);
  });

  it('writes only the fields GeoNet changed', async () => {
    const service = new GeoNetImportService();
    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: 'a' })]);
    await service.importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    client.fetchEventsText.mockResolvedValueOnce([geonetRow({ EventID: 'a', Latitude: -42.3, 'Depth/km': 12.5 })]);
    const result = await service.importEvents({ hours: 1, catalogueId: 'cat-geonet', updateExisting: true });

    expect(result.updatedEvents).toBe(1);
    expect(db.updateEvent).toHaveBeenCalledTimes(1);
    expect(db.updateEvent.mock.calls[0][1]).toEqual({ latitude: -42.3, depth: 12.5 });
  });

  it('counts collided and invalid rows so the totals add up', async () => {
    client.fetchEventsText.mockResolvedValue([
      geonetRow({ EventID: 'ok-1' }),
      geonetRow({ EventID: 'ok-2' }),
      geonetRow({ EventID: 'bad-lat', Latitude: 91 }),
      geonetRow({ EventID: 'too-deep', 'Depth/km': 1001 }),
    ]);
    // A concurrent import stored ok-2 between the duplicate lookup and the insert.
    db.bulkInsertEvents.mockImplementationOnce(async (rows: any[]) => {
      stored.push({ ...rows[1] });
      stored.push({ ...rows[0] });
      return 1;
    });

    const result = await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    expect(result).toMatchObject({ totalFetched: 4, newEvents: 1, collidedEvents: 1, invalidEvents: 2 });
    expectCountsAddUp(result);
  });

  it('counts the rows a failed insert never wrote', async () => {
    client.fetchEventsText.mockResolvedValue(
      Array.from({ length: 2500 }, (_, i) => geonetRow({ EventID: `ev-${i}` }))
    );
    db.bulkInsertEvents
      .mockImplementationOnce(async (rows: any[]) => rows.length)
      .mockRejectedValueOnce(new Error('connection reset'));
    db.getEventCoordinatesByIds.mockResolvedValue([]);

    const result = await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    // 1000 stored, the failed batch of 1000 and the 500 never attempted are failed.
    expect(result).toMatchObject({ newEvents: 1000, failedEvents: 1500, success: false });
    expectCountsAddUp(result);
  });

  it('reports rows GeoNet returned but could not be used, even when none were usable', async () => {
    client.fetchEventsText.mockResolvedValue([]);
    client.getLastFetchDiagnostics.mockReturnValue({ skippedRows: 3, truncatedTail: false });

    const result = await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-geonet' });

    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toMatch(/3 unusable row/);
    expect(result).toMatchObject({ totalFetched: 3, invalidEvents: 3, newEvents: 0 });
    expectCountsAddUp(result);
    // The run is recorded in the target catalogue's history.
    expect(db.insertImportHistory).toHaveBeenCalledTimes(1);
    expect(db.insertImportHistory.mock.calls[0][4]).toBe(3);
  });

  it('does not silently drop a start date given without an end date', async () => {
    client.fetchEventsText.mockResolvedValue([]);
    const start = new Date('2024-10-24T00:00:00Z');
    await new GeoNetImportService().importEvents({ startDate: start });
    // The window starts where asked, not 24 hours ago.
    expect(client.fetchEventsText.mock.calls[0][0].starttime).toBe('2024-10-24T00:00:00.000Z');
  });
});
