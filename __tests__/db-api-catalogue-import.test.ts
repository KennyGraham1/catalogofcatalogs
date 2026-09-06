/**
 * @jest-environment node
 *
 * Regression tests for POST /api/catalogues: the geographic bounds it stores and
 * the event count it reports.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'editor', email: 'e@example.com' } })),
}));

jest.mock('@/lib/db', () => ({
  ...jest.requireActual('@/lib/db'),
  dbQueries: {
    insertCatalogue: jest.fn(),
    bulkInsertEvents: jest.fn(),
    updateCatalogueStatus: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    getCatalogueById: jest.fn(),
    deleteCatalogue: jest.fn(),
  },
}));

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

import { POST } from '@/app/api/catalogues/route';
import { dbQueries } from '@/lib/db';

const mockDb = dbQueries as unknown as Record<string, jest.Mock>;

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/catalogues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

const event = (longitude: number, i: number, extra: Record<string, unknown> = {}) => ({
  time: `2024-03-0${i + 1}T00:00:00.000Z`,
  latitude: -30 - i * 0.1,
  longitude,
  magnitude: 4,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.insertCatalogue.mockResolvedValue(undefined);
  mockDb.updateCatalogueStatus.mockResolvedValue(undefined);
  mockDb.updateCatalogueEventCount.mockResolvedValue(undefined);
  mockDb.updateCatalogueGeoBounds.mockResolvedValue(undefined);
  mockDb.deleteCatalogue.mockResolvedValue(undefined);
  mockDb.getCatalogueById.mockResolvedValue({ id: 'cat', name: 'Test' });
  mockDb.bulkInsertEvents.mockImplementation(async (rows: any[]) => rows.length);
});

describe('db-api :: POST /api/catalogues geographic bounds', () => {
  it('stores the smallest covering arc for a catalogue that spans the antimeridian', async () => {
    // Kermadec-style longitudes. The events occupy 177.9°E .. 177.8°W going east
    // across 180° — a 4.3° wide box. RFC 7946 §5.2 writes that as west > east.
    // A plain min/max stores (-179.6, 179.4): the 359.0° complement arc, which
    // then matches region searches anywhere on Earth.
    const longitudes = [177.9, 178.6, 179.4, -179.6, -178.3, -177.8];
    const response = await post({
      name: 'Kermadec',
      events: longitudes.map((lon, i) => event(lon, i)),
    });

    expect(response.status).toBe(201);
    expect(mockDb.updateCatalogueGeoBounds).toHaveBeenCalledTimes(1);
    const [, minLat, maxLat, minLon, maxLon] = mockDb.updateCatalogueGeoBounds.mock.calls[0] as any[];
    expect(minLat).toBeCloseTo(-30.5, 10);
    expect(maxLat).toBeCloseTo(-30, 10);
    expect(minLon).toBeCloseTo(177.9, 10);
    expect(maxLon).toBeCloseTo(-177.8, 10);
    expect(minLon).toBeGreaterThan(maxLon);

    // The same bounds must reach the catalogue metadata written up front.
    const metadata = (mockDb.insertCatalogue.mock.calls[0] as any[])[6];
    expect(metadata.min_longitude).toBeCloseTo(177.9, 10);
    expect(metadata.max_longitude).toBeCloseTo(-177.8, 10);
  });

  it('leaves a mainland catalogue with an ordinary west-to-east box', async () => {
    // Nothing near 180°: the tightest arc is the plain min/max, west < east.
    const longitudes = [166.4, 172.1, 174.8, 178.2];
    await post({ name: 'Mainland', events: longitudes.map((lon, i) => event(lon, i)) });

    const [, , , minLon, maxLon] = mockDb.updateCatalogueGeoBounds.mock.calls[0] as any[];
    expect(minLon).toBeCloseTo(166.4, 10);
    expect(maxLon).toBeCloseTo(178.2, 10);
  });
});

describe('db-api :: POST /api/catalogues event accounting', () => {
  it('reports and stores the rows MongoDB actually wrote, not the rows submitted', async () => {
    // 10 valid rows submitted, 3 dropped as duplicate source IDs -> 7 stored.
    mockDb.bulkInsertEvents.mockImplementation(async (rows: any[]) => rows.length - 3);

    const response = await post({
      name: 'With duplicates',
      events: Array.from({ length: 10 }, (_, i) => event(174 + i * 0.01, 0)),
    });
    const body = await response.json();

    expect(mockDb.updateCatalogueEventCount).toHaveBeenCalledWith(expect.any(String), 7);
    expect(body.validationReport.successfullyImported).toBe(7);
    expect(body.validationReport.duplicatesSkipped).toBe(3);
    expect(body.validationReport.totalSubmitted).toBe(10);
    expect(body.validationReport.successRate).toBe(70);
    expect(body.partialImport).toBe(true);
    expect(body.importMessage).toContain('3 duplicate events skipped.');
  });

  it('keeps the plain success message when every submitted row is stored', async () => {
    const response = await post({
      name: 'Clean',
      events: Array.from({ length: 4 }, (_, i) => event(174 + i * 0.01, i)),
    });
    const body = await response.json();

    expect(mockDb.updateCatalogueEventCount).toHaveBeenCalledWith(expect.any(String), 4);
    expect(body.partialImport).toBe(false);
    expect(body.importMessage).toBe('Successfully imported all 4 events.');
    expect(body.validationReport.duplicatesSkipped).toBe(0);
  });

  it('counts stored rows even when some submitted rows failed validation', async () => {
    // 3 rows in: one has an out-of-range latitude, and of the 2 valid rows one is
    // a duplicate, so 1 row reaches the collection.
    mockDb.bulkInsertEvents.mockImplementation(async (rows: any[]) => rows.length - 1);

    const body = await (await post({
      name: 'Mixed',
      events: [event(174, 0), event(174.1, 1), { ...event(174.2, 2), latitude: 999 }],
    })).json();

    expect(body.validationReport.totalSubmitted).toBe(3);
    expect(body.validationReport.failedValidation).toBe(1);
    expect(body.validationReport.successfullyImported).toBe(1);
    expect(body.validationReport.duplicatesSkipped).toBe(1);
    expect(mockDb.updateCatalogueEventCount).toHaveBeenCalledWith(expect.any(String), 1);
    expect(body.importMessage).toContain('1 event failed validation.');
    expect(body.importMessage).toContain('1 duplicate event skipped.');
  });
});
