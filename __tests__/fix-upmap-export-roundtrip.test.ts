/**
 * @jest-environment node
 *
 * The platform's own CSV export re-imports with its identity, lineage and uncertainty
 * columns (hand-off from the exporters cluster): SourceID, PublicID, the preferred
 * origin/magnitude/focal-mechanism IDs, the error ellipse and its confidence level.
 * Before, SourceID fuzzy-matched to event_public_id in the schema step and none of
 * these reached the stored row, so a re-imported catalogue lost its duplicate keys.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'user-7', email: 'u@example.com', role: 'editor' } })),
}));
jest.mock('@/lib/db', () => ({
  ...jest.requireActual('@/lib/db'),
  dbQueries: {
    insertCatalogue: jest.fn(),
    bulkInsertEvents: jest.fn(async (rows: unknown[]) => rows.length),
    countEventsByCatalogue: jest.fn(async () => 1),
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

import { POST as createCatalogue } from '@/app/api/catalogues/route';
import { dbQueries } from '@/lib/db';
import { iteratePendingUploadEventBatches } from '@/lib/pending-uploads';
import { eventsToCSV } from '@/lib/exporters';
import { parseCSV } from '@/lib/parsers';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { detectFieldMapping, resolveParserFieldSources, computeFileMappingChanges } from '@/lib/field-definitions';

const lineage = [
  { source: 'GeoNet', catalogueId: 'cat-a', eventId: '2024p000001', selected: true },
  { source: 'ISC', catalogueId: 'cat-b', eventId: '6000001' },
];

const stored = {
  id: 'row-1',
  catalogue_id: 'cat-1',
  time: '2024-01-01T00:00:00.000Z',
  latitude: -41.2,
  longitude: 174.7,
  depth: 12.5,
  magnitude: 4.3,
  magnitude_type: 'MLv',
  event_type: 'earthquake',
  source_event_type: 'earthquake',
  source_events: JSON.stringify(lineage),
  depth_type: 'from modeling of broad-band P waveforms',
  source_id: 'smi:nz.org.geonet/2024p000001',
  event_public_id: 'smi:nz.org.geonet/2024p000001',
  preferred_origin_id: 'smi:nz.org.geonet/Origin#1',
  preferred_magnitude_id: 'smi:nz.org.geonet/Magnitude#1',
  preferred_focal_mechanism_id: 'smi:nz.org.geonet/FocalMechanism#1',
  horizontal_uncertainty: 1.2,
  min_horizontal_uncertainty: 0.8,
  max_horizontal_uncertainty: 2.1,
  azimuth_max_horizontal_uncertainty: 35,
  confidence_level: 68,
  depth_uncertainty: 2.5,
};

describe('CSV export -> upload round trip', () => {
  const csv = eventsToCSV([stored as any], undefined, { metadataComments: false, neutralizeFormulas: false });
  const parsed = parseCSV(csv, ',', 'International');

  it('parses the exported row', () => {
    expect(parsed.events).toHaveLength(1);
  });

  it('keeps identity, lineage and the error ellipse on the stored row', () => {
    const fields = parsedEventToDbFields(parsed.events[0]);
    expect(fields).toMatchObject({
      source_id: stored.source_id,
      event_public_id: stored.event_public_id,
      preferred_origin_id: stored.preferred_origin_id,
      preferred_magnitude_id: stored.preferred_magnitude_id,
      preferred_focal_mechanism_id: stored.preferred_focal_mechanism_id,
      source_event_type: stored.source_event_type,
      min_horizontal_uncertainty: 0.8,
      max_horizontal_uncertainty: 2.1,
      azimuth_max_horizontal_uncertainty: 35,
      confidence_level: 68,
      horizontal_uncertainty: 1.2,
      depth_uncertainty: 2.5,
      magnitude_type: 'MLv',
      event_type: 'earthquake',
    });
  });

  it('the schema step resolves the export headers as the parser does and changes nothing', () => {
    expect(detectFieldMapping('SourceID').targetField).toBe('source_id');
    expect(detectFieldMapping('PublicID').targetField).toBe('event_public_id');
    expect(detectFieldMapping('PreferredFocalMechanismID').targetField).toBe('preferred_focal_mechanism_id');
    expect(detectFieldMapping('ConfidenceLevel').targetField).toBe('confidence_level');
    const sources = resolveParserFieldSources(parsed.detectedFields, parsed.resolvedFieldSources);
    expect(sources.source_id).toBe('sourceid');
    expect(computeFileMappingChanges(parsed.detectedFields, sources, {})).toEqual({ set: {}, unset: [] });
  });
});

describe('re-imported lineage and depth type reach the stored row', () => {
  // Both tests read the first bulkInsertEvents call: clear the record before each, so
  // neither depends on the order the tests run in (jest --randomize).
  beforeEach(() => (dbQueries as any).bulkInsertEvents.mockClear());

  it('keeps the exported source_events lineage and the QuakeML depth-type spelling', async () => {
    const csv = eventsToCSV([stored as any], undefined, { metadataComments: false, neutralizeFormulas: false });
    const parsed = parseCSV(csv, ',', 'International');
    (iteratePendingUploadEventBatches as jest.Mock).mockImplementation(async function* () { yield parsed.events; });

    const response = await createCatalogue(new NextRequest('http://localhost/api/catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Re-import', pendingUploads: [{ id: 'tok', expectedCount: 1 }] }),
    }));
    expect(response.status).toBe(201);

    const [row] = (dbQueries as any).bulkInsertEvents.mock.calls[0][0];
    expect(JSON.parse(row.source_events)).toEqual(lineage);
    expect(row.depth_type).toBe('from modeling of broad-band P waveforms');
    expect(row.source_id).toBe(stored.source_id);
  });

  it('an ordinary upload still records the upload as its source', async () => {
    const parsed = parseCSV('eventid,time,latitude,longitude,mag\ne9,2024-01-01T00:00:00Z,-41,174,3', ',', 'International');
    (iteratePendingUploadEventBatches as jest.Mock).mockImplementation(async function* () { yield parsed.events; });

    await createCatalogue(new NextRequest('http://localhost/api/catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Plain', pendingUploads: [{ id: 'tok', expectedCount: 1 }] }),
    }));

    const [row] = (dbQueries as any).bulkInsertEvents.mock.calls[0][0];
    expect(JSON.parse(row.source_events)).toEqual([{ source: 'upload', eventId: 'e9' }]);
  });
});
