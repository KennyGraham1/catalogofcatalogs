/**
 * @jest-environment node
 *
 * POST /api/catalogues creating a catalogue from pending uploads (the upload page's
 * only path, contract C15).
 *
 *  - #32/#43/#50/gt#1 (H2): the mapping step copied raw source cells over the parser's
 *    normalised values (US dates flipped, 0-360 longitudes rejected, metre depths stored
 *    as km, Mw replaced by mb), 'Do not map' left the value stored, and the server then
 *    re-derived depth units per event. Rows are now the parser's events; only explicit
 *    per-file changes apply, re-read through normalizeMappedField.
 *  - #44: an explicit pick of a scale-named magnitude column also sets magnitude_type,
 *    and the parser's own choice is kept as an alternative.
 *  - #45/#127: files are identified by a manifest in file order with expected counts,
 *    checked per file; inline rows are joined by (file, row) and must be the same event.
 *  - #47: the catalogue is created with the reconciled counts, not the browser's.
 *  - #54: provenance comes from the session; C13 audit record; C9 owner-scoped reads.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'user-7', email: 'uploader@example.com', role: 'editor' } })),
}));

jest.mock('@/lib/db', () => ({
  ...jest.requireActual('@/lib/db'),
  dbQueries: {
    insertCatalogue: jest.fn(),
    bulkInsertEvents: jest.fn(),
    countEventsByCatalogue: jest.fn(),
    updateCatalogueStatus: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    getCatalogueById: jest.fn(),
    deleteCatalogue: jest.fn(),
    getCatalogues: jest.fn(),
  },
}));

jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));

jest.mock('@/lib/rate-limiter', () => ({
  applyRateLimit: jest.fn(() => ({ success: true, headers: {} })),
  readRateLimiter: {},
  apiRateLimiter: {},
}));

jest.mock('@/lib/pending-uploads', () => ({
  deletePendingUpload: jest.fn(async () => undefined),
  getPendingUploadEvents: jest.fn(async () => null),
  iteratePendingUploadEventBatches: jest.fn(),
}));

import { GET, POST } from '@/app/api/catalogues/route';
import { AppError } from '@/lib/errors';
import { invalidateCatalogueListCaches, registerCacheGenerationSource } from '@/lib/cache';
import { dbQueries } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { getPendingUploadEvents, iteratePendingUploadEventBatches } from '@/lib/pending-uploads';
import { parseCSV, parseQuakeML } from '@/lib/parsers';
import type { ParsedEvent } from '@/types/upload';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const iterate = iteratePendingUploadEventBatches as unknown as jest.Mock;
const getPending = getPendingUploadEvents as unknown as jest.Mock;

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/catalogues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

/** The pending store: token -> the parser's events, read only by their owner. */
function usePendingStore(store: Record<string, ParsedEvent[]>, owner = 'user-7') {
  iterate.mockImplementation(async function* (id: string, _batchSize: number, ownerId?: string) {
    if (ownerId !== owner || !store[id]) return;
    yield store[id];
  });
  getPending.mockImplementation(async (id: string, ownerId?: string) =>
    ownerId === owner && store[id] ? store[id] : null);
}

const storedRows = (): any[] => db.bulkInsertEvents.mock.calls.flatMap(call => call[0]);

beforeEach(() => {
  jest.clearAllMocks();
  const stored: any[] = [];
  db.bulkInsertEvents.mockImplementation(async (rows: any[]) => { stored.push(...rows); return rows.length; });
  db.countEventsByCatalogue.mockImplementation(async () => stored.length);
  db.getCatalogueById.mockResolvedValue({ id: 'cat', name: 'Test' });
  iterate.mockImplementation(async function* () { /* nothing pending */ });
});

describe('H2: rows keep the parser\'s normalised values', () => {
  // US dates, 0-360 longitudes and a metre depth column, as in the finding.
  const csv = [
    'eventid,datetime,lat,lon,dep,mag,herr',
    'e1,03/25/2024 10:00:00,-29.3,182.1,12000,4.1,2500',
    'e2,03/04/2024 10:00:00,-29.3,182.1,800,3.9,50',
    ...Array.from({ length: 20 }, (_, i) => `f${i},03/${String(5 + (i % 20)).padStart(2, '0')}/2024 10:00:00,-29.4,181.9,${15000 + i},3.0,80`),
  ].join('\n');

  it('stores the parser\'s date, longitude and depth when no column is re-mapped', async () => {
    const parsed = parseCSV(csv, ',');
    expect(parsed.fileDecisions.dateFormat).toBe('US');
    usePendingStore({ tok: parsed.events });

    const response = await post({
      name: 'Kermadec',
      pendingUploads: [{ id: 'tok', expectedCount: parsed.events.length, fileName: 'k.csv', fileDecisions: parsed.fileDecisions }],
    });
    expect(response.status).toBe(201);

    const byId = Object.fromEntries(storedRows().map(row => [row.source_id, row]));
    expect(byId.e2.time).toBe('2024-03-04T10:00:00.000Z');
    expect(byId.e2.longitude).toBeCloseTo(-177.9, 10);
    expect(byId.e2.depth).toBeCloseTo(0.8, 10);   // 800 m, not 800 km
    expect(byId.e1.depth).toBeCloseTo(12, 10);
    expect(byId.e2.horizontal_uncertainty).toBeCloseTo(0.05, 10);
  });

  it('removes a field the user chose not to map, and re-sources a remapped one', async () => {
    const parsed = parseCSV(csv, ',');
    usePendingStore({ tok: parsed.events });

    await post({
      name: 'Kermadec',
      pendingUploads: [{
        id: 'tok',
        expectedCount: parsed.events.length,
        fileDecisions: parsed.fileDecisions,
        mapping: { set: { depth_uncertainty: 'herr' }, unset: ['horizontal_uncertainty'] },
      }],
    });

    const row = storedRows().find(r => r.source_id === 'e2');
    expect(row.horizontal_uncertainty).toBeUndefined();
    // Re-read from the raw cell with the file's metre decision: 50 m -> 0.05 km.
    expect(row.depth_uncertainty).toBeCloseTo(0.05, 10);
  });

  it('re-reads an explicitly re-mapped time with the file\'s date format', async () => {
    const parsed = parseCSV('eventid,time,alt_time,latitude,longitude,magnitude\ne1,2024-01-01T00:00:00Z,03/04/2024 10:00:00,-41,174,3', ',', 'US');
    usePendingStore({ tok: parsed.events });

    await post({
      name: 'T',
      pendingUploads: [{ id: 'tok', expectedCount: 1, fileDecisions: { dateFormat: 'US' }, mapping: { set: { time: 'alt_time' }, unset: [] } }],
    });

    expect(storedRows()[0].time).toBe('2024-03-04T10:00:00.000Z');
  });

  it('never reinterprets a depth per event on the server', async () => {
    await post({ name: 'Inline', events: [{ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 3, depth: 1500 }] });
    expect(storedRows()[0].depth).toBeUndefined();
  });

  it('rejects the old raw-copy fieldMappings payload', async () => {
    const response = await post({ name: 'Old', pendingUploadIds: ['tok'], fieldMappings: { lon: 'longitude' } });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('LEGACY_FIELD_MAPPINGS');
    expect(db.insertCatalogue).not.toHaveBeenCalled();
  });

  it('refuses a mapping that would leave a required field unmapped', async () => {
    const response = await post({ name: 'Bad', pendingUploads: [{ id: 'tok', expectedCount: 1, mapping: { set: {}, unset: ['magnitude'] } }] });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_PENDING_UPLOADS');
  });
});

describe('#44 explicit magnitude choice', () => {
  const csv = 'eventid,time,latitude,longitude,depth,mw,mb,ms\ne1,2024-01-01T00:00:00Z,-41,174,10,9.1,7.2,8.8';

  it('keeps the parser\'s Mw when nothing is re-mapped', async () => {
    const parsed = parseCSV(csv, ',', 'International');
    usePendingStore({ tok: parsed.events });
    await post({ name: 'M', pendingUploads: [{ id: 'tok', expectedCount: 1 }] });
    const row = storedRows()[0];
    expect([row.magnitude, row.magnitude_type]).toEqual([9.1, 'Mw']);
    expect(row.standard_error).toBeUndefined();
  });

  it('an explicit pick of mb stores mb with its scale and keeps Mw as an alternative', async () => {
    const parsed = parseCSV(csv, ',', 'International');
    usePendingStore({ tok: parsed.events });
    await post({ name: 'M', pendingUploads: [{ id: 'tok', expectedCount: 1, mapping: { set: { magnitude: 'mb' }, unset: [] } }] });
    const row = storedRows()[0];
    expect([row.magnitude, row.magnitude_type]).toEqual([7.2, 'mb']);
    expect(JSON.parse(row.magnitudes)).toEqual(expect.arrayContaining([{ type: 'Mw', mag: { value: 9.1 } }]));
  });
});

describe('#45/#127 files are identified by a manifest, never by position', () => {
  const quakeml = (id: string, time: string, lat: number) => parseQuakeML(
    `<?xml version="1.0"?><q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"><eventParameters publicID="smi:x/ep"><event publicID="smi:nz.org.geonet/${id}"><origin publicID="smi:x/o/${id}"><time><value>${time}</value></time><latitude><value>${lat}</value></latitude><longitude><value>174</value></longitude></origin><magnitude publicID="smi:x/m/${id}"><mag><value>4</value></mag></magnitude><preferredOriginID>smi:x/o/${id}</preferredOriginID></event></eventParameters></q:quakeml>`,
  ).events;

  it('rejects a file whose stored rows differ from the count its upload reported, before writing', async () => {
    usePendingStore({ a: quakeml('A1', '2024-01-01T00:00:00Z', -41), b: quakeml('B1', '2023-06-01T00:00:00Z', -37) });
    const response = await post({ name: 'X', pendingUploads: [{ id: 'a', expectedCount: 2 }, { id: 'b', expectedCount: 1 }] });
    expect(response.status).toBe(409);
    expect(db.insertCatalogue).not.toHaveBeenCalled();
    expect(db.bulkInsertEvents).not.toHaveBeenCalled();
  });

  it('reads pending uploads for the session user only (C9)', async () => {
    usePendingStore({ a: quakeml('A1', '2024-01-01T00:00:00Z', -41) }, 'someone-else');
    const response = await post({ name: 'X', pendingUploads: [{ id: 'a', expectedCount: 1 }] });
    expect(response.status).toBe(404);
    expect(iterate).toHaveBeenCalledWith('a', expect.any(Number), 'user-7');
  });

  it('refuses inline rows whose files are out of order instead of cross-attaching QuakeML identity', async () => {
    const a = quakeml('A1', '2024-01-01T00:00:00Z', -41);
    const b = quakeml('B1', '2023-06-01T00:00:00Z', -37);
    usePendingStore({ tokA: a, tokB: b });
    const row = (e: ParsedEvent) => ({ time: e.time, latitude: e.latitude, longitude: e.longitude, magnitude: e.magnitude });

    const swapped = await post({ name: 'X', events: [row(a[0]), row(b[0])], pendingUploadIds: ['tokB', 'tokA'] });
    expect(swapped.status).toBe(409);
    expect(db.insertCatalogue).not.toHaveBeenCalled();

    const ordered = await post({
      name: 'X',
      events: [row(a[0]), row(b[0])],
      pendingUploads: [{ id: 'tokA', expectedCount: 1 }, { id: 'tokB', expectedCount: 1 }],
    });
    expect(ordered.status).toBe(201);
    const rows = storedRows();
    expect(rows.find(r => r.latitude === -41).source_id).toBe('smi:nz.org.geonet/A1');
    expect(rows.find(r => r.latitude === -37).source_id).toBe('smi:nz.org.geonet/B1');
  });
});

describe('#47/#54/C13 the catalogue records what the server stored and who created it', () => {
  it('writes reconciled counts and session provenance, and audits the creation', async () => {
    const parsed = parseCSV([
      'eventid,time,latitude,longitude,magnitude',
      'dup,2024-01-01T00:00:00Z,-41,174,3',
      'dup,2024-01-01T00:00:00Z,-41,174,3',
      'u1,2024-01-02T00:00:00Z,-41,174,3.5',
    ].join('\n'), ',', 'International');
    usePendingStore({ tok: parsed.events });

    const response = await post({
      name: 'Dup',
      pendingUploads: [{ id: 'tok', expectedCount: 3, fileName: 'dup.csv' }],
      metadata: {
        description: 'd',
        created_by: 'GNS Science / other-user-id',
        modified_by: 'someone-else',
        modified_at: '1999-01-01T00:00:00Z',
        validation_summary: JSON.stringify({ totalEvents: 3, validEvents: 3, invalidEvents: 0 }),
      },
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.importMessage).toBe('Imported 2 of 3 events. 1 duplicate event skipped.');
    expect(body.validationReport).toMatchObject({ totalSubmitted: 3, successfullyImported: 2, duplicatesSkipped: 1 });

    const [, , , mergeConfig, eventCount, , metadata] = db.insertCatalogue.mock.calls[0];
    expect(eventCount).toBe(2);
    const config = JSON.parse(mergeConfig);
    expect(config.validationSummary).toMatchObject({ totalSubmitted: 3, successfullyImported: 2, duplicatesSkipped: 1 });
    expect(config.partialImport).toBe(true);
    expect(JSON.stringify(config)).not.toContain('tok');      // pending tokens are not persisted
    const summary = JSON.parse(metadata.validation_summary);
    expect(summary.validEvents).toBe(2);
    expect(summary.import.successfullyImported).toBe(2);

    // Provenance travels in insertCatalogue's trusted argument, never in the metadata.
    expect(db.insertCatalogue.mock.calls[0][8]).toEqual({ createdBy: 'user-7' });
    expect(metadata.created_by).toBeUndefined();
    expect(metadata.modified_by).toBeUndefined();
    expect(metadata.modified_at).toBeUndefined();
    expect(metadata.description).toBe('d');

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'catalogue.create', actor_id: 'user-7', target_type: 'catalogue' }),
      expect.anything(),
    );
  });
});

describe('catalogue refused by the database (DB follow-up)', () => {
  it('a catalogue being deleted surfaces as 409 without retrying or cleaning up', async () => {
    const parsed = parseCSV('eventid,time,latitude,longitude,magnitude\ne1,2024-01-01T00:00:00Z,-41,174,3', ',', 'International');
    usePendingStore({ tok: parsed.events });
    db.bulkInsertEvents.mockImplementation(async () => {
      throw new AppError('Catalogue x does not exist or is being deleted; its events cannot be written', 409, 'CATALOGUE_NOT_WRITABLE');
    });

    const response = await post({ name: 'Racing delete', pendingUploads: [{ id: 'tok', expectedCount: 1 }] });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('CATALOGUE_NOT_WRITABLE');
    expect(db.bulkInsertEvents).toHaveBeenCalledTimes(1);
    expect(db.deleteCatalogue).not.toHaveBeenCalled();
    expect(db.updateCatalogueStatus).not.toHaveBeenCalled();
  });
});

describe('GET /api/catalogues list cache (DB follow-up)', () => {
  const get = () => GET(new NextRequest('http://localhost/api/catalogues'));

  it('is keyed by the cache generation, so a catalogue change is seen at once', async () => {
    let shared = 1;
    registerCacheGenerationSource(async () => shared);
    db.getCatalogues.mockResolvedValueOnce([{ id: 'a' }]).mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    expect(await (await get()).json()).toEqual([{ id: 'a' }]);
    expect(await (await get()).json()).toEqual([{ id: 'a' }]);        // served from cache
    expect(db.getCatalogues).toHaveBeenCalledTimes(1);

    shared = 2;                                                        // another instance wrote
    expect(await (await get()).json()).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(db.getCatalogues).toHaveBeenCalledTimes(2);

    invalidateCatalogueListCaches();                                   // a local write
    db.getCatalogues.mockResolvedValueOnce([{ id: 'c' }]);
    expect(await (await get()).json()).toEqual([{ id: 'c' }]);
  });

  it('bypasses the cache when the shared generation cannot be read', async () => {
    registerCacheGenerationSource(async () => { throw new Error('database unavailable'); });
    db.getCatalogues.mockResolvedValue([{ id: 'x' }]);
    await get();
    await get();
    expect(db.getCatalogues).toHaveBeenCalledTimes(2);
  });
});
