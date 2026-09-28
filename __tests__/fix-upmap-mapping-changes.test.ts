/**
 * @jest-environment node
 *
 * The schema step's explicit mapping, from a real parse to the stored row.
 *
 *  - #32/#43/#50/gt#1: the mapping must start from the parser's resolution (so an
 *    untouched mapping changes nothing), 'Do not map' must remove the target, a remap
 *    must move the value, and every file's columns count.
 *  - #44: a named magnitude column is not forced onto `magnitude`; an explicit pick is.
 *  - gc#2/gc#4: the saved Settings configuration is validated in full, and the warning
 *    reports genuine conflicts instead of every field fed by several aliases.
 */

import { NextRequest } from 'next/server';
import { parseCSV } from '@/lib/parsers';
import {
  computeFileMappingChanges,
  effectiveColumnMapping,
  findBuiltInAliasOverrides,
  findConflictingMappingRules,
  missingRequiredFields,
  parseFieldMappingsConfig,
  resolveParserFieldSources,
} from '@/lib/field-definitions';

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'user-7', email: 'u@example.com', role: 'editor' } })),
  requireAdmin: jest.fn(async () => ({ user: { id: 'admin-1', email: 'a@example.com', role: 'admin' } })),
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
    getCatalogueById: jest.fn(async () => ({ id: 'cat' })),
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
const settingsStore: { doc: any } = { doc: null };
jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      findOne: jest.fn(async () => settingsStore.doc),
      updateOne: jest.fn(async (_filter: unknown, update: any) => { settingsStore.doc = update.$set; return {}; }),
    }),
  })),
  getCollection: jest.fn(),
  COLLECTIONS: {},
}));

import { POST as createCatalogue } from '@/app/api/catalogues/route';
import { PUT as putSettings } from '@/app/api/settings/field-mappings/route';
import { dbQueries } from '@/lib/db';
import { iteratePendingUploadEventBatches } from '@/lib/pending-uploads';

const db = dbQueries as unknown as Record<string, jest.Mock>;

/** A parsed file as the upload response describes it. */
function upload(csv: string, dateFormat?: 'US' | 'International') {
  const result = parseCSV(csv, ',', dateFormat);
  return {
    result,
    fields: result.detectedFields,
    sources: resolveParserFieldSources(result.detectedFields, result.resolvedFieldSources),
  };
}

const magnitudeCsv = 'eventid,time,latitude,longitude,depth,mw,mb,ms,rms\ne1,2024-01-01T00:00:00Z,-41,174,10,9.1,7.2,8.8,0.4';
const herrCsv = [
  'eventid,datetime,lat,lon,dep,mag,herr,seh',
  'e1,03/25/2024 10:00:00,-29.3,182.1,12000,4.1,2500,900',
  'e2,03/04/2024 10:00:00,-29.3,182.1,800,3.9,50,70',
  ...Array.from({ length: 20 }, (_, i) => `f${i},03/${String(5 + (i % 20)).padStart(2, '0')}/2024 10:00:00,-29.4,181.9,${15000 + i},3.0,80,90`),
].join('\n');

describe('the parser resolution is the starting point', () => {
  it('an untouched mapping changes nothing, for every kind of file', () => {
    const files = [
      upload(herrCsv),
      upload(magnitudeCsv, 'International'),
      upload('year,month,day,hour,min,sec,latitude,longitude,depth_m,magnitude\n2019,6,1,3,45,1.0,-38.7,176.1,800,2.1', 'International'),
      upload('time,latitude,longitude,mag,magtype,ml,type\n2024-01-01T00:00:00Z,-41,174,4,mb,3.9,earthquake', 'International'),
    ];
    for (const file of files) {
      expect(computeFileMappingChanges(file.fields, file.sources, {})).toEqual({ set: {}, unset: [] });
    }
  });

  it('shows a scale-named magnitude column as the magnitude, never its derived type', () => {
    const { fields, sources } = upload(magnitudeCsv, 'International');
    const mapping = effectiveColumnMapping(fields, sources, {});
    expect(mapping.mw).toBe('magnitude');
    expect(Object.values(mapping)).not.toContain('magnitude_type');
    expect(mapping.mb).toBeUndefined();
    expect(mapping.ms).toBeUndefined();
    expect(mapping.rms).toBe('standard_error');
  });

  it('knows a time assembled from split columns is supplied', () => {
    const { fields, sources } = upload('year,month,day,hour,min,sec,latitude,longitude,magnitude\n2019,6,1,3,45,1,-38.7,176.1,2.1', 'International');
    expect(missingRequiredFields(fields, sources, {})).toEqual([]);
  });
});

describe('explicit changes', () => {
  it("'Do not map' removes the column's field", () => {
    const { fields, sources } = upload(herrCsv);
    expect(computeFileMappingChanges(fields, sources, { herr: '' })).toEqual({ set: {}, unset: ['horizontal_uncertainty'] });
  });

  it('a remap moves the value instead of duplicating it', () => {
    const { fields, sources } = upload(herrCsv);
    expect(computeFileMappingChanges(fields, sources, { herr: 'depth_uncertainty' }))
      .toEqual({ set: { depth_uncertainty: 'herr' }, unset: ['horizontal_uncertainty'] });
  });

  it('a column taking over a field keeps the parser column untouched elsewhere', () => {
    const { fields, sources } = upload(herrCsv);
    expect(computeFileMappingChanges(fields, sources, { seh: 'horizontal_uncertainty' }))
      .toEqual({ set: { horizontal_uncertainty: 'seh' }, unset: [] });
  });

  it('an explicit magnitude pick re-sources the magnitude; its type follows server-side', () => {
    const { fields, sources } = upload(magnitudeCsv, 'International');
    expect(computeFileMappingChanges(fields, sources, { mb: 'magnitude' })).toEqual({ set: { magnitude: 'mb' }, unset: [] });
  });

  it('moving the magnitude to a generic column re-reads the file magnitude-type column with it', () => {
    const { fields, sources } = upload('time,latitude,longitude,mag,mag2,magtype\n2024-01-01T00:00:00Z,-41,174,4,4.2,mb', 'International');
    expect(computeFileMappingChanges(fields, sources, { mag2: 'magnitude' }))
      .toEqual({ set: { magnitude: 'mag2', magnitude_type: 'magtype' }, unset: [] });
  });

  it('a mapping for a column of another file leaves this file alone', () => {
    const first = upload('time,latitude,longitude,mag\n2024-01-01T00:00:00Z,-41,174,4', 'International');
    // 'err_h' is not an alias, so only an explicit mapping brings it in.
    const second = upload('time,latitude,longitude,mag,err_h\n2024-01-01T00:00:00Z,-41,174,4,1.5', 'International');
    const explicit = { err_h: 'horizontal_uncertainty' };
    expect(computeFileMappingChanges(first.fields, first.sources, explicit)).toEqual({ set: {}, unset: [] });
    expect(computeFileMappingChanges(second.fields, second.sources, explicit))
      .toEqual({ set: { horizontal_uncertainty: 'err_h' }, unset: [] });
  });

  it('reports required fields a file would lose, and the event ID only under strict validation', () => {
    const { fields, sources } = upload('time,latitude,longitude,mag\n2024-01-01T00:00:00Z,-41,174,4', 'International');
    expect(missingRequiredFields(fields, sources, { mag: '' })).toEqual(['magnitude']);
    expect(missingRequiredFields(fields, sources, {})).toEqual([]);
    expect(missingRequiredFields(fields, sources, {}, true)).toEqual(['id']);
  });
});

describe('end to end: raw CSV, explicit mapping, stored row (gt#1)', () => {
  const run = async (csv: string, explicit: Record<string, string>, dateFormat?: 'US' | 'International') => {
    const file = upload(csv, dateFormat);
    const stored: any[] = [];
    db.bulkInsertEvents.mockImplementation(async (rows: any[]) => { stored.push(...rows); return rows.length; });
    db.countEventsByCatalogue.mockImplementation(async () => stored.length);
    (iteratePendingUploadEventBatches as jest.Mock).mockImplementation(async function* () { yield file.result.events; });
    const mapping = computeFileMappingChanges(file.fields, file.sources, explicit);
    const response = await createCatalogue(new NextRequest('http://localhost/api/catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E',
        pendingUploads: [{
          id: 'tok',
          expectedCount: file.result.events.length,
          fileDecisions: file.result.fileDecisions,
          ...(Object.keys(mapping.set).length || mapping.unset.length ? { mapping } : {}),
        }],
      }),
    }));
    expect(response.status).toBe(201);
    return stored;
  };

  beforeEach(() => jest.clearAllMocks());

  it('keeps the parser\'s Mw 9.1 when the schema step is left alone', async () => {
    const [row] = await run(magnitudeCsv, {}, 'International');
    expect([row.magnitude, row.magnitude_type, row.standard_error]).toEqual([9.1, 'Mw', 0.4]);
  });

  it('stores the metre depths, wrapped longitudes and US dates the parser read', async () => {
    const rows = await run(herrCsv, {});
    const e2 = rows.find(r => r.source_id === 'e2');
    expect([e2.time, e2.depth, e2.longitude]).toEqual(['2024-03-04T10:00:00.000Z', 0.8, expect.closeTo(-177.9, 10)]);
  });

  it("'Do not map' and a remap reach the stored row", async () => {
    const rows = await run(herrCsv, { herr: '', seh: 'depth_uncertainty' });
    const e2 = rows.find(r => r.source_id === 'e2');
    expect(e2.horizontal_uncertainty).toBeUndefined();
    expect(e2.depth_uncertainty).toBeCloseTo(0.07, 10);   // 70 m under the file's metre decision
  });

  it('an explicit mb pick is stored as mb with Mw kept as an alternative', async () => {
    const [row] = await run(magnitudeCsv, { mb: 'magnitude' }, 'International');
    expect([row.magnitude, row.magnitude_type]).toEqual([7.2, 'mb']);
    expect(JSON.parse(row.magnitudes)).toContainEqual({ type: 'Mw', mag: { value: 9.1 } });
  });
});

describe('gc#2 the saved Settings configuration is validated in full', () => {
  const valid = {
    autoDetectEnabled: true,
    strictValidation: false,
    fuzzyMatchThreshold: 0.6,
    formats: {
      csv: { enabled: true, mappings: [{ id: 'c1', sourcePattern: 'lat', targetField: 'latitude', isRegex: false, priority: 100 }] },
      json: { enabled: true, mappings: [] },
      quakeml: { enabled: true, mappings: [] },
      geojson: { enabled: true, mappings: [] },
    },
    customMappings: [{ id: 'x1', sourcePattern: '^prof', targetField: 'depth', isRegex: true, priority: 75 }],
  };

  it('accepts a well-formed configuration', () => {
    expect(parseFieldMappingsConfig(valid).ok).toBe(true);
  });

  it.each([
    ['a threshold outside the slider range', { ...valid, fuzzyMatchThreshold: 7 }],
    ['a priority sent as a string', { ...valid, customMappings: [{ ...valid.customMappings[0], priority: '90' }] }],
    ['a rule without a pattern', { ...valid, customMappings: [{ id: 'c1', targetField: 'magnitude', isRegex: false, priority: 50 }] }],
    ['an unknown target', { ...valid, customMappings: [{ ...valid.customMappings[0], targetField: 'not_a_field' }] }],
    ['an invalid regular expression', { ...valid, customMappings: [{ ...valid.customMappings[0], sourcePattern: '(unclosed' }] }],
    ['a JSON structure as a target', { ...valid, customMappings: [{ ...valid.customMappings[0], targetField: 'origins' }] }],
  ])('rejects %s', (_label, config) => {
    expect(parseFieldMappingsConfig(config).ok).toBe(false);
  });

  it('PUT /api/settings/field-mappings stores only a validated configuration', async () => {
    const put = (body: unknown) => putSettings(new NextRequest('http://localhost/api/settings/field-mappings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

    const bad = await put({ ...valid, fuzzyMatchThreshold: 7, customMappings: [{ id: 'c1', sourcePattern: 'mag', targetField: 'not_a_field' }] });
    expect(bad.status).toBe(400);
    expect(settingsStore.doc).toBeNull();

    const good = await put(valid);
    expect(good.status).toBe(200);
    expect(settingsStore.doc.config.customMappings[0]).toMatchObject({ sourcePattern: '^prof', priority: 75 });
  });
});

describe('gc#4 the warning reports genuine conflicts', () => {
  it('several patterns feeding one field are not a conflict', () => {
    const config = {
      formats: {
        csv: {
          enabled: true,
          mappings: [
            { sourcePattern: 'lat', targetField: 'latitude' },
            { sourcePattern: 'Lat', targetField: 'latitude' },
            { sourcePattern: 'evla', targetField: 'latitude' },
          ],
        },
      },
      customMappings: [],
    };
    expect(findConflictingMappingRules(config)).toEqual([]);
  });

  it('one pattern sent to different fields is', () => {
    const config = {
      formats: { json: { enabled: true, mappings: [{ sourcePattern: 'type', targetField: 'event_type' }] } },
      customMappings: [{ sourcePattern: 'Type', targetField: 'magnitude_type' }],
    };
    expect(findConflictingMappingRules(config)).toEqual([
      expect.objectContaining({ targets: expect.arrayContaining(['event_type', 'magnitude_type']) }),
    ]);
  });

  it('flags a rule that overrides the parser alias for a column', () => {
    expect(findBuiltInAliasOverrides([{ sourcePattern: 'type', targetField: 'magnitude_type' }]))
      .toEqual([{ pattern: 'type', target: 'magnitude_type', builtInTarget: 'event_type' }]);
    expect(findBuiltInAliasOverrides([{ sourcePattern: 'lat', targetField: 'latitude' }])).toEqual([]);
  });
});
