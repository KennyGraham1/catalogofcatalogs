/**
 * Regression tests for the GeoNet ingest boundary (cluster: geonet).
 *
 * Covers:
 *  - origin times stored with an explicit UTC designator (FDSN `format=text` Time is
 *    UTC but offset-less, and ECMA-262 parses an offset-less date-TIME as LOCAL time);
 *  - the FDSN text columns that used to be parsed and discarded reaching the database;
 *  - both database steps being issued in batches so neither the `$in` duplicate-detection
 *    query nor the insertMany payload can exceed MongoDB's 16 MiB command limit;
 *  - a failed insert leaving the catalogue marked `error`, never `complete`.
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

import { GeoNetImportService } from '@/lib/geonet-import-service';
import { dbQueries } from '@/lib/db';
import { geonetClient } from '@/lib/geonet-client';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const client = geonetClient as unknown as Record<string, jest.Mock>;

/** A realistic GeoNet FDSN `format=text` row (pipe-delimited columns, already parsed). */
function geonetRow(overrides: Record<string, unknown> = {}) {
  return {
    EventID: '2016p858055',
    Time: '2016-11-13T11:32:07', // FDSN text Time column: UTC, but no designator
    Latitude: -42.246,
    Longitude: 173.673,
    'Depth/km': 15,
    Author: 'WEL(GNS_Primary)',
    Catalog: 'NZ',
    Contributor: 'WEL(GNS_Primary)',
    ContributorID: '2016p858055',
    MagType: 'M',
    Magnitude: 6.2,
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
  // An existing catalogue created by the GeoNet importer (the only kind it adds to).
  db.getCatalogueById.mockResolvedValue({
    id: 'cat-1',
    name: 'GeoNet - Automated Import',
    merge_config: JSON.stringify({ source: 'GeoNet' }),
    min_latitude: null,
    max_latitude: null,
    min_longitude: null,
    max_longitude: null,
  });
  db.getEventsBySourceIds.mockResolvedValue(new Map());
  db.getEventCoordinatesByIds.mockResolvedValue([]);
  // bulkInsertEvents resolves to the number of rows actually inserted (it drops
  // in-batch source_id repeats and lets the partial-unique index skip collisions),
  // and the importer accumulates that into ImportResult.newEvents. Resolving
  // undefined here made `newEventsCount += undefined` produce NaN.
  db.bulkInsertEvents.mockImplementation(async (rows: unknown[]) => rows.length);
  db.countEventsByCatalogue.mockResolvedValue(0);
  db.updateCatalogueStatus.mockResolvedValue(undefined);
  db.updateCatalogueEventCount.mockResolvedValue(undefined);
  db.updateCatalogueGeoBounds.mockResolvedValue(undefined);
  db.insertImportHistory.mockResolvedValue(undefined);
  client.fetchEventById.mockResolvedValue(null);
  client.fetchEventQuakeMLText.mockResolvedValue(null);
});

/** All documents handed to bulkInsertEvents across every batch, in order. */
function insertedDocs(): any[] {
  return db.bulkInsertEvents.mock.calls.flatMap((call) => call[0]);
}

describe('GeoNet origin times', () => {
  it('stores an offset-less FDSN time as explicit UTC', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow()]);

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    expect(result.success).toBe(true);
    const docs = insertedDocs();
    expect(docs).toHaveLength(1);

    // Expected value derived from the FDSN fdsnws-event spec, not from the code:
    // the text-format Time column is the origin time in UTC, so 2016-11-13T11:32:07
    // is 11:32:07 UTC and must be stored with a designator that says so.
    expect(docs[0].time).toBe('2016-11-13T11:32:07.000Z');
    expect(new Date(docs[0].time).getTime()).toBe(Date.UTC(2016, 10, 13, 11, 32, 7));
    expect(/(Z|[+-]\d{2}:?\d{2})$/.test(docs[0].time)).toBe(true);
  });

  it('leaves an already-UTC time unchanged in instant, and rejects an unparseable one', async () => {
    client.fetchEventsText.mockResolvedValue([
      geonetRow({ EventID: 'withZ', Time: '2016-11-13T11:32:07.123Z' }),
      geonetRow({ EventID: 'bad', Time: 'not-a-time' }),
    ]);

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    const docs = insertedDocs();
    expect(docs).toHaveLength(1);
    expect(docs[0].source_id).toBe('withZ');
    expect(new Date(docs[0].time).getTime()).toBe(
      Date.UTC(2016, 10, 13, 11, 32, 7, 123)
    );
    // The unparseable row is reported, so the run is not a silent success.
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('bad');
  });
});

describe('GeoNet provenance columns', () => {
  it('keeps the FDSN text columns that used to be discarded', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow()]);

    await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1' });

    const doc = insertedDocs()[0];
    expect(doc.author).toBe('WEL(GNS_Primary)');
    expect(doc.location_name).toBe('15 km north of Kaikoura');

    const sourceEvents = JSON.parse(doc.source_events);
    expect(sourceEvents[0].source).toBe('GeoNet');
    expect(sourceEvents[0].eventId).toBe('2016p858055');
    expect(sourceEvents[0].catalog).toBe('NZ');
    expect(sourceEvents[0].contributor).toBe('WEL(GNS_Primary)');
    expect(sourceEvents[0].magnitudeAuthor).toBe('WEL(GNS_Primary)');
    // GeoNet's raw MagType is preserved verbatim, both as the column and as
    // provenance: bare "M" is GeoNet's SeisComP summary magnitude, and relabelling
    // it would fabricate a scale it may not be on for large events.
    expect(doc.magnitude_type).toBe('M');
    expect(sourceEvents[0].magnitudeType).toBe('M');
  });
});

describe('GeoNet import batching', () => {
  it('splits the insertMany payload and the $in lookup into bounded batches', async () => {
    // Below the M5.0 focal-mechanism threshold (this test is about batch sizes) and
    // below GeoNet's 10,000-event cap, so the chunker issues a single window.
    const rows = Array.from({ length: 9500 }, (_, i) =>
      geonetRow({ EventID: `ev-${i}`, ContributorID: `ev-${i}`, Magnitude: 2.4 })
    );
    client.fetchEventsText.mockResolvedValue(rows);

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    expect(result.newEvents).toBe(9500);

    // Duplicate detection: 9500 ids at 5000 per $in -> 5000 + 4500.
    const lookupSizes = db.getEventsBySourceIds.mock.calls.map((c) => c[1].length);
    expect(lookupSizes).toEqual([5000, 4500]);

    // Inserts: 9500 documents at 1000 per insertMany -> 9 full batches + 500.
    const insertSizes = db.bulkInsertEvents.mock.calls.map((c) => c[0].length);
    expect(insertSizes).toHaveLength(10);
    expect(insertSizes.slice(0, 9)).toEqual(Array(9).fill(1000));
    expect(insertSizes[9]).toBe(500);
    expect(insertSizes.reduce((a: number, b: number) => a + b, 0)).toBe(9500);
  });
});

describe('GeoNet import catalogue status', () => {
  it('marks the catalogue processing then complete on a clean run', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow()]);

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    expect(result.success).toBe(true);
    const statuses = db.updateCatalogueStatus.mock.calls.map((c) => c[0]);
    expect(statuses).toEqual(['processing', 'complete']);
  });

  it('marks the catalogue error - not complete - when the insert fails', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow()]);
    db.bulkInsertEvents.mockRejectedValue(new Error('E11000 unrelated write failure'));

    const result = await new GeoNetImportService().importEvents({
      hours: 1,
      catalogueId: 'cat-1',
    });

    expect(result.success).toBe(false);
    const statuses = db.updateCatalogueStatus.mock.calls.map((c) => c[0]);
    expect(statuses).toEqual(['processing', 'error']);
    expect(statuses).not.toContain('complete');

    // The DB recount runs even though nothing was inserted, so event_count cannot be
    // left stale on a catalogue this run just touched.
    expect(db.countEventsByCatalogue).toHaveBeenCalledWith('cat-1');
    expect(db.updateCatalogueEventCount).toHaveBeenCalledWith('cat-1', 0);
  });

  it('creates a new catalogue as processing, not complete', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow()]);
    db.getCatalogueById.mockResolvedValue(undefined);

    await new GeoNetImportService().importEvents({ hours: 1 });

    expect(db.insertCatalogue).toHaveBeenCalledTimes(1);
    // insertCatalogue(id, name, sources, metadata, eventCount, status, extra)
    expect(db.insertCatalogue.mock.calls[0][5]).toBe('processing');
  });
});

describe('GeoNet origin quality', () => {
  it('lifts origin quality out of the QuakeML already fetched for M5.0+ events', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow({ Magnitude: 6.2 })]);
    // GeoNet's QuakeML for the event (format=xml), as served.
    client.fetchEventQuakeMLText.mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:nz.org.geonet/EventParameters">
    <event publicID="smi:nz.org.geonet/2016p858055">
      <origin publicID="smi:nz.org.geonet/origin/1">
        <time><value>2016-11-13T11:32:07.000Z</value></time>
        <latitude><value>-42.2</value></latitude>
        <longitude><value>173.6</value></longitude>
        <quality><azimuthalGap>300</azimuthalGap></quality>
      </origin>
      <origin publicID="smi:nz.org.geonet/origin/2">
        <time><value>2016-11-13T11:32:07.000Z</value></time>
        <latitude><value>-42.246</value></latitude>
        <longitude><value>173.673</value></longitude>
        <depth><value>15000</value><uncertainty>2400</uncertainty></depth>
        <quality>
          <usedPhaseCount>54</usedPhaseCount>
          <usedStationCount>31</usedStationCount>
          <standardError>0.21</standardError>
          <azimuthalGap>62.5</azimuthalGap>
          <minimumDistance>0.18</minimumDistance>
        </quality>
        <originUncertainty>
          <horizontalUncertainty>1500</horizontalUncertainty>
          <confidenceLevel>68</confidenceLevel>
        </originUncertainty>
      </origin>
      <preferredOriginID>smi:nz.org.geonet/origin/2</preferredOriginID>
      <type>earthquake</type>
    </event>
  </eventParameters>
</q:quakeml>`);

    await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1' });

    const doc = insertedDocs()[0];
    // Preferred origin wins over the first origin in document order.
    expect(doc.azimuthal_gap).toBe(62.5);
    expect(doc.used_phase_count).toBe(54);
    expect(doc.used_station_count).toBe(31);
    expect(doc.standard_error).toBe(0.21);
    // QuakeML OriginQuality.minimumDistance is in degrees; stored in degrees.
    expect(doc.minimum_distance).toBe(0.18);
    // QuakeML lengths are metres; the DB stores km, so 1500 m -> 1.5 km and
    // 2400 m -> 2.4 km.
    expect(doc.horizontal_uncertainty).toBe(1.5);
    expect(doc.depth_uncertainty).toBe(2.4);
    // OriginUncertainty.confidenceLevel, percent (contract C16).
    expect(doc.confidence_level).toBe(68);
  });

  it('stores nothing rather than guessing when the QuakeML carries no quality', async () => {
    client.fetchEventsText.mockResolvedValue([geonetRow({ Magnitude: 5.4 })]);
    client.fetchEventQuakeMLText.mockResolvedValue(
      '<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"><eventParameters publicID="smi:nz.org.geonet/EventParameters"></eventParameters></q:quakeml>'
    );

    await new GeoNetImportService().importEvents({ hours: 1, catalogueId: 'cat-1' });

    const doc = insertedDocs()[0];
    expect(doc.azimuthal_gap).toBeUndefined();
    expect(doc.standard_error).toBeUndefined();
  });
});
