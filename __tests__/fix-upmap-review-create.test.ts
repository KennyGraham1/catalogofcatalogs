/**
 * @jest-environment node
 *
 * Regressions found by the post-fix review of the upload mapping flow, driven from a real
 * parse through the manifest the upload page builds into the real POST /api/catalogues
 * (DB, auth and the pending store are stubbed).
 *
 *  - review #1: an untouched upload overwrote the parser's per-row magnitude type (a
 *    magtype column re-read onto every row, typing Mw values as ML).
 *  - review #2: an origin time assembled from date + time columns was re-read from the
 *    date column alone, truncating every time to midnight.
 *  - review #3: an explicit remap from a column named like a canonical field read the
 *    parser's value in that key (the Mw magnitude, a depth already in km), not the cell.
 *  - review #5: a re-sourced depth column in metres whose name states no unit was read
 *    in km, and depths left empty as out of range were not reported.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'user-7', email: 'u@example.com', role: 'editor' } })),
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

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/catalogues/route';
import { dbQueries } from '@/lib/db';
import { iteratePendingUploadEventBatches } from '@/lib/pending-uploads';
import { parseCSV } from '@/lib/parsers';
import { computeFileMappingChanges, resolveParserFieldSources } from '@/lib/field-definitions';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const iterate = iteratePendingUploadEventBatches as unknown as jest.Mock;
let stored: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  stored = [];
  db.bulkInsertEvents.mockImplementation(async (rows: any[]) => { stored.push(...rows); return rows.length; });
  db.countEventsByCatalogue.mockImplementation(async () => stored.length);
  db.getCatalogueById.mockResolvedValue({ id: 'cat', name: 'Test' });
});

/**
 * Parse the CSV, build the manifest entry the upload page would send for the explicit
 * mapping the schema step reported, and create the catalogue.
 */
async function createFrom(csv: string, explicit: Record<string, string>) {
  const parsed = parseCSV(csv, ',', 'International');
  iterate.mockImplementation(async function* (id: string, size: number, owner?: string) {
    if (id !== 'tok' || owner !== 'user-7') return;
    for (let i = 0; i < parsed.events.length; i += size) yield parsed.events.slice(i, i + size);
  });
  const fields = parsed.detectedFields;
  const mapping = computeFileMappingChanges(fields, resolveParserFieldSources(fields, parsed.resolvedFieldSources), explicit);
  const decisions = parsed.fileDecisions as { dateFormat?: string; depthUnit?: string };
  const response = await POST(new NextRequest('http://localhost/api/catalogues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Review',
      pendingUploads: [{
        id: 'tok',
        expectedCount: parsed.events.length,
        fileName: 'a.csv',
        format: 'CSV',
        ...(Object.keys(mapping.set).length || mapping.unset.length ? { mapping } : {}),
        fileDecisions: { dateFormat: decisions.dateFormat, depthUnit: decisions.depthUnit },
      }],
    }),
  }));
  return { response, body: await response.json(), mapping, parsed };
}

const bySourceId = () => Object.fromEntries(stored.map(row => [row.source_id, row]));

const mwMagnitudeMagtype = [
  'eventid,time,latitude,longitude,depth,mw,magnitude,magtype',
  'e1,2024-01-01T00:00:00Z,-41,174,10,6.1,5.8,ML',
  'e2,2024-01-02T00:00:00Z,-41,174,10,5.9,5.6,ML',
  'e3,2024-01-03T00:00:00Z,-41,174,10,,4.2,ML',
].join('\n');

describe('review #1: the parser keeps each row\'s magnitude type', () => {
  it('an untouched upload stores Mw rows as Mw and the generic rows with their stated type', async () => {
    const { response, mapping } = await createFrom(mwMagnitudeMagtype, {});
    expect(response.status).toBe(201);
    expect(mapping).toEqual({ set: {}, unset: [] });
    const rows = bySourceId();
    expect([rows.e1.magnitude, rows.e1.magnitude_type]).toEqual([6.1, 'Mw']);
    expect([rows.e2.magnitude, rows.e2.magnitude_type]).toEqual([5.9, 'Mw']);
    expect([rows.e3.magnitude, rows.e3.magnitude_type]).toEqual([4.2, 'ML']);
  });

  it('the parser names the type column as the source of a generic magnitude\'s type', () => {
    const parsed = parseCSV([
      'eventid,time,latitude,longitude,depth,ml,magnitude,magtype',
      'e1,2024-01-01T00:00:00Z,-41,174,10,3.1,3.3,Mw',
      'e2,2024-01-02T00:00:00Z,-41,174,10,2.9,3.0,Mw',
      'e3,2024-01-03T00:00:00Z,-41,174,10,2.2,,',
    ].join('\n'), ',', 'International');
    expect(parsed.resolvedFieldSources.magnitude).toBe('magnitude');
    expect(parsed.resolvedFieldSources.magnitude_type).toBe('magtype');
  });
});

describe('review #2: an assembled origin time is kept', () => {
  it.each([
    ['date + time', 'eventid,date,time,latitude,longitude,depth,mag\ni1,2024-03-04,10:15:30.50,-41.1,174.1,12,4.1', '2024-03-04T10:15:30.500Z'],
    ['date + hour/minute/second', 'eventid,date,hour,minute,second,latitude,longitude,depth,mag\ni1,2024-03-04,10,15,30.5,-41.1,174.1,12,4.1', '2024-03-04T10:15:30.500Z'],
  ])('%s', async (_name, csv, expected) => {
    const { response, mapping } = await createFrom(csv, {});
    expect(response.status).toBe(201);
    expect(mapping).toEqual({ set: {}, unset: [] });
    expect(stored[0].time).toBe(expected);
  });
});

describe('review #3: an explicit remap reads the cell as the file wrote it', () => {
  it('picking the generic magnitude over Mw stores the generic value with its stated type', async () => {
    const { response, mapping } = await createFrom(mwMagnitudeMagtype, { magnitude: 'magnitude' });
    expect(response.status).toBe(201);
    expect(mapping.set).toEqual({ magnitude: 'magnitude', magnitude_type: 'magtype' });
    const rows = bySourceId();
    expect([rows.e1.magnitude, rows.e1.magnitude_type]).toEqual([5.8, 'ML']);
    expect(JSON.parse(rows.e1.magnitudes)).toContainEqual({ type: 'Mw', mag: { value: 6.1 } });
    expect([rows.e3.magnitude, rows.e3.magnitude_type]).toEqual([4.2, 'ML']);
  });

  it('re-sourcing depth from a column literally named depth reads its kilometres, not the converted alias', async () => {
    const csv = [
      'eventid,time,latitude,longitude,mag,depth_m,depth',
      'e1,2024-01-01T00:00:00Z,-41,174,4,12000,12.5',
      'e2,2024-01-02T00:00:00Z,-41,174,4,800,0.9',
    ].join('\n');
    const { response } = await createFrom(csv, { depth: 'depth' });
    expect(response.status).toBe(201);
    const rows = bySourceId();
    expect([rows.e1.depth, rows.e2.depth]).toEqual([12.5, 0.9]);
  });
});

describe('review #5: a re-sourced length column in metres', () => {
  const hypoDepth = [
    'eventid,time,latitude,longitude,mag,hypo_depth',
    'e1,2024-01-01T00:00:00Z,-41,174,4,12000',
    'e2,2024-01-02T00:00:00Z,-41,174,4,800',
    'e3,2024-01-03T00:00:00Z,-41,174,4,5000',
  ].join('\n');

  it('is converted by the column\'s own evidence, as the parser does for a depth column', async () => {
    const { response } = await createFrom(hypoDepth, { hypo_depth: 'depth' });
    expect(response.status).toBe(201);
    const rows = bySourceId();
    expect([rows.e1.depth, rows.e2.depth, rows.e3.depth]).toEqual([12, 0.8, 5]);
    // The same reading as the parser gives the column when it recognises it as depth.
    const same = parseCSV(hypoDepth.replace('hypo_depth', 'depth'), ',', 'International');
    expect(same.events.map(e => e.depth)).toEqual([12, 0.8, 5]);
  });

  it('a re-sourced depth of plausible kilometres is not divided again by another column\'s metre decision', async () => {
    const csv = [
      'eventid,time,latitude,longitude,mag,depth,alt_depth',
      ...Array.from({ length: 20 }, (_, i) => `e${i},2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z,-41,174,4,${15000 + i},${10 + i}`),
    ].join('\n');
    const { response, parsed } = await createFrom(csv, { alt_depth: 'depth' });
    expect(parsed.fileDecisions.depthUnit).toBe('m');
    expect(response.status).toBe(201);
    expect(bySourceId().e0.depth).toBe(10);
  });

  it('reports values left empty as out of range', async () => {
    const csv = [
      'eventid,time,latitude,longitude,mag,hypo_depth',
      'e1,2024-01-01T00:00:00Z,-41,174,4,12',
      'e2,2024-01-02T00:00:00Z,-41,174,4,1500',
      'e3,2024-01-03T00:00:00Z,-41,174,4,14',
    ].join('\n');
    const { response, body } = await createFrom(csv, { hypo_depth: 'depth' });
    expect(response.status).toBe(201);
    expect(bySourceId().e2.depth).toBeUndefined();
    expect(body.validationReport.droppedValues).toEqual({ depth: 1 });
    expect(body.importMessage).toContain('1 depth value was unreadable or out of range and left empty.');
    const mergeConfig = JSON.parse(db.insertCatalogue.mock.calls[0][3]);
    expect(mergeConfig.validationSummary.droppedValues).toEqual({ depth: 1 });
  });
});
