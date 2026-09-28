/**
 * @jest-environment node
 *
 * Integration tests for Catalogue API endpoints
 *
 * These tests verify the complete CRUD operations for catalogues:
 * - List catalogues (GET /api/catalogues)
 * - Create catalogue (POST /api/catalogues)
 * - Get single catalogue (GET /api/catalogues/[id])
 * - Update catalogue (PATCH /api/catalogues/[id])
 * - Delete catalogue (DELETE /api/catalogues/[id])
 * - Export catalogue (GET /api/catalogues/[id]/export)
 *
 * The route handlers and lib/db.ts run for real; MongoDB collections and the session
 * lookup are mocked. This suite must run in the node environment: under the repo's
 * default jsdom environment `Request` is undefined, and an earlier version of this file
 * skipped itself on that condition, so it silently never ran anywhere (gap finding
 * gt#3).
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { getCollection } from '@/lib/mongodb';
import { catalogueCache } from '@/lib/cache';

// Mock definitions - these are hoisted by Jest and run before any imports
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  getCollection: jest.fn(),
  withTransaction: jest.fn((callback) => callback({})),
  COLLECTIONS: jest.requireActual('@/lib/mongodb').COLLECTIONS,
}));

// The real cache module, with the list cache replaced so a test can serve a hit.
jest.mock('@/lib/cache', () => ({
  ...jest.requireActual('@/lib/cache'),
  catalogueCache: {
    get: jest.fn(),
    set: jest.fn(),
    clearAll: jest.fn(),
    invalidateByPrefix: jest.fn(() => 0),
    invalidateBySubstring: jest.fn(() => 0),
  },
}));

jest.mock('@/lib/rate-limiter', () => ({
  ...jest.requireActual('@/lib/rate-limiter'),
  applyRateLimit: jest.fn(() => ({ success: true, headers: {} })),
  readRateLimiter: {},
  apiRateLimiter: {},
}));

/** Split a CSV export into its header columns and data rows (RFC 4180, no prologue). */
function csvTable(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith('#'));
  const [header = '', ...rows] = lines;
  return { header: header.split(','), rows: rows.map((line) => line.split(',')) };
}

describe('Catalogue API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/catalogues', () => {
    const mockFind = jest.fn();
    const mockToArray = jest.fn();
    const mockSort = jest.fn();

    beforeEach(() => {
      mockSort.mockReturnValue({ toArray: mockToArray });
      mockFind.mockReturnValue({ sort: mockSort });
      (getCollection as jest.Mock).mockResolvedValue({
        find: mockFind,
        // The list cache is keyed by the shared cache generation (lib/cache.ts), which
        // lib/db reads from the cache_generations collection; without it the route
        // (correctly) neither reads nor writes the cache.
        findOne: jest.fn(async () => ({ generation: 0 })),
      });
    });

    it('should return list of catalogues', async () => {
      // Arrange
      const mockCatalogues = [
        {
          id: 'cat-1',
          name: 'Test Catalogue 1',
          event_count: 100,
          created_at: new Date().toISOString(),
        },
        {
          id: 'cat-2',
          name: 'Test Catalogue 2',
          event_count: 200,
          created_at: new Date().toISOString(),
        },
      ];
      mockToArray.mockResolvedValue(mockCatalogues);
      (catalogueCache.get as jest.Mock).mockReturnValue(null);

      // Act
      const { GET } = await import('@/app/api/catalogues/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues');
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('Test Catalogue 1');
    });

    it('should return cached data when available', async () => {
      // Arrange
      const cachedCatalogues = [
        { id: 'cached-1', name: 'Cached Catalogue', event_count: 50 },
      ];
      (catalogueCache.get as jest.Mock).mockReturnValue(cachedCatalogues);

      // Act
      const { GET } = await import('@/app/api/catalogues/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues');
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body).toEqual(cachedCatalogues);
      expect(mockFind).not.toHaveBeenCalled(); // Should not hit database
    });
  });

  describe('POST /api/catalogues', () => {
    const mockInsertOne = jest.fn();
    const mockInsertMany = jest.fn();
    const mockFindOne = jest.fn();

    beforeEach(() => {
      (getCollection as jest.Mock).mockResolvedValue({
        insertOne: mockInsertOne,
        insertMany: mockInsertMany,
        findOne: mockFindOne,
        // The upload recounts the rows it stored and then completes the catalogue.
        countDocuments: jest.fn().mockResolvedValue(2),
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
        bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
      });
    });

    it('should create a new catalogue with valid data', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'user-123', email: 'editor@example.com', role: 'editor' },
      });

      mockInsertOne.mockResolvedValue({ insertedId: 'new-cat-id' });
      mockInsertMany.mockResolvedValue({ insertedCount: 2 });
      mockFindOne.mockResolvedValue({
        id: 'new-cat-id',
        name: 'New Catalogue',
        event_count: 2,
        status: 'processing',
        version_state: 'initial',
      });

      const requestBody = {
        name: 'New Catalogue',
        events: [
          {
            time: '2024-01-15T10:00:00Z',
            latitude: -41.5,
            longitude: 174.0,
            depth: 25,
            magnitude: 5.0,
          },
          {
            time: '2024-01-15T11:00:00Z',
            latitude: -42.0,
            longitude: 173.5,
            depth: 15,
            magnitude: 4.5,
          },
        ],
        metadata: {
          description: 'Test catalogue',
          data_source: 'Test data',
        },
      };

      // Act
      const { POST } = await import('@/app/api/catalogues/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Length': '500' },
      });
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
      expect(mockInsertOne).toHaveBeenCalled();
    });

    it('should reject creation without authentication', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const requestBody = {
        name: 'New Catalogue',
        events: [],
      };

      // Act
      const { POST } = await import('@/app/api/catalogues/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should reject creation for viewer role', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });

      const requestBody = {
        name: 'New Catalogue',
        events: [],
      };

      // Act
      const { POST } = await import('@/app/api/catalogues/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(403);
    });

    it('should reject catalogue without name', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      const requestBody = {
        name: '', // Empty name
        events: [],
      };

      // Act
      const { POST } = await import('@/app/api/catalogues/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Length': '100' },
      });
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should reject request body too large', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      // Act
      const { POST } = await import('@/app/api/catalogues/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', events: [] }),
        headers: { 'Content-Length': '200000000' }, // 200MB - exceeds limit
      });
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(413);
    });
  });

  describe('GET /api/catalogues/[id]', () => {
    const mockFindOne = jest.fn();

    beforeEach(() => {
      (getCollection as jest.Mock).mockResolvedValue({
        findOne: mockFindOne,
      });
    });

    it('should return a single catalogue by ID', async () => {
      // Arrange
      const mockCatalogue = {
        id: 'cat-123',
        name: 'Test Catalogue',
        event_count: 100,
        created_at: new Date().toISOString(),
      };
      mockFindOne.mockResolvedValue(mockCatalogue);

      // Act
      const { GET } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/cat-123');
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.id).toBe('cat-123');
      expect(body.name).toBe('Test Catalogue');
    });

    it('should return 404 for non-existent catalogue', async () => {
      // Arrange
      mockFindOne.mockResolvedValue(null);

      // Act
      const { GET } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/non-existent');
      const response = await GET(request, { params: Promise.resolve({ id: 'non-existent' }) });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/catalogues/[id]', () => {
    const mockFindOne = jest.fn();
    const mockUpdateOne = jest.fn();

    beforeEach(() => {
      (getCollection as jest.Mock).mockResolvedValue({
        findOne: mockFindOne,
        updateOne: mockUpdateOne,
        insertOne: jest.fn().mockResolvedValue({ acknowledged: true }), // audit log
        bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
      });
    });

    it('should update catalogue metadata', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      mockFindOne.mockResolvedValue({
        id: 'cat-123',
        name: 'Old Name',
        status: 'complete',
        version: '1.0.0',
      });
      mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      // Metadata fields sit at the top level of the body, beside the name.
      const requestBody = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      // Act
      const { PATCH } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/cat-123', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'cat-123' }) });

      // Assert
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, version: '1.0.1' });
      const [filter, update] = mockUpdateOne.mock.calls[0];
      expect(filter).toMatchObject({ id: 'cat-123' });
      expect(update.$set).toMatchObject({
        name: 'Updated Name',
        description: 'Updated description',
        modified_by: 'editor-123',
        version: '1.0.1',
      });
    });

    it('should return 404 when updating a non-existent catalogue', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });
      mockFindOne.mockResolvedValue(null);

      const { PATCH } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/missing', {
        method: 'PATCH',
        body: JSON.stringify({ description: 'x' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'missing' }) });

      expect(response.status).toBe(404);
      expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    it('should reject update without authentication', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue(null);

      // Act
      const { PATCH } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/cat-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'cat-123' }) });

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/catalogues/[id]', () => {
    const mockUpdateOne = jest.fn();
    const mockDeleteOne = jest.fn();
    const mockDeleteMany = jest.fn();

    beforeEach(() => {
      (getCollection as jest.Mock).mockResolvedValue({
        updateOne: mockUpdateOne,
        deleteOne: mockDeleteOne,
        deleteMany: mockDeleteMany,
        insertOne: jest.fn().mockResolvedValue({ acknowledged: true }), // audit log
        bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
      });
    });

    it('should delete catalogue and its events', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }); // marked 'deleting'
      mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
      mockDeleteMany.mockResolvedValue({ deletedCount: 100 });

      // Act
      const { DELETE } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/cat-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'cat-123' }) });

      // Assert: marked first, then its events and import history, then the row itself.
      expect(response.status).toBe(200);
      expect(mockUpdateOne.mock.calls[0][1]).toMatchObject({ $set: { status: 'deleting' } });
      expect(mockDeleteMany).toHaveBeenCalledWith({ catalogue_id: 'cat-123' });
      expect(mockDeleteOne).toHaveBeenCalledWith({ id: 'cat-123', status: 'deleting' });
    });

    it('should return 404 for non-existent catalogue', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      // Act
      const { DELETE } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'non-existent' }) });

      // Assert
      expect(response.status).toBe(404);
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });
});

describe('Catalogue Events API', () => {
  const mockFind = jest.fn();
  const mockToArray = jest.fn();
  const mockSort = jest.fn();
  const mockCountDocuments = jest.fn();
  const mockSkip = jest.fn();
  const mockLimit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockLimit.mockReturnValue({ toArray: mockToArray });
    mockSkip.mockReturnValue({ limit: mockLimit });
    mockSort.mockReturnValue({ skip: mockSkip });
    mockFind.mockReturnValue({ sort: mockSort });

    (getCollection as jest.Mock).mockResolvedValue({
      find: mockFind,
      countDocuments: mockCountDocuments,
    });
  });

  describe('GET /api/catalogues/[id]/events', () => {
    it('should return paginated events', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });

      const mockEvents = [
        { id: 'evt-1', time: '2024-01-15T10:00:00Z', magnitude: 5.0 },
        { id: 'evt-2', time: '2024-01-15T11:00:00Z', magnitude: 4.5 },
      ];
      mockToArray.mockResolvedValue(mockEvents);
      mockCountDocuments.mockResolvedValue(100);

      // Act
      const { GET } = await import('@/app/api/catalogues/[id]/events/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/events?page=1&limit=10'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });
      const body = await response.json();

      // Assert: a paginated response carries the rows in `data`.
      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.totalItems).toBe(100);
    });
  });
});

describe('Catalogue Export API', () => {
  const mockFindOne = jest.fn();
  const mockFind = jest.fn();
  const mockToArray = jest.fn();
  const mockSort = jest.fn();
  const mockCountDocuments = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockSort.mockReturnValue({ toArray: mockToArray });
    mockFind.mockReturnValue({ sort: mockSort });

    (getCollection as jest.Mock).mockResolvedValue({
      findOne: mockFindOne,
      find: mockFind,
      countDocuments: mockCountDocuments,
    });
  });

  describe('GET /api/catalogues/[id]/export', () => {
    it('should export catalogue as CSV', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });

      mockFindOne.mockResolvedValue({
        id: 'cat-123',
        name: 'Export Test',
        event_count: 2,
      });
      mockToArray.mockResolvedValue([
        { id: 'evt-1', time: '2024-01-15T10:00:00Z', latitude: -41.5, longitude: 174.0, magnitude: 5.0 },
        { id: 'evt-2', time: '2024-01-15T11:00:00Z', latitude: -42.0, longitude: 173.5, magnitude: 4.5 },
      ]);

      // Act
      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=csv'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });
      const text = await response.text();
      const headerLine = csvTable(text).header.join(',');

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('csv');

      // Verify all expected column headers are present
      const expectedColumns = [
        'ID', 'CatalogueID', 'Time', 'CreatedAt',
        'Latitude', 'Longitude', 'Depth', 'Magnitude', 'MagnitudeType',
        'EventType', 'EventTypeCertainty', 'Region', 'LocationName',
        'Source', 'SourceEventsJSON', 'SourceID', 'PublicID',
        'TimeUncertainty', 'LatitudeUncertainty', 'LongitudeUncertainty',
        'DepthUncertainty', 'HorizontalUncertainty', 'MagnitudeUncertainty',
        'DepthType', 'EarthModelID', 'MethodID', 'AgencyID', 'Author',
        'MagnitudeStationCount', 'MagnitudeMethodID', 'MagnitudeEvaluationMode', 'MagnitudeEvaluationStatus',
        'AzimuthalGap', 'UsedStationCount', 'UsedPhaseCount', 'StandardError',
        'MinimumDistance', 'MaximumDistance', 'AssociatedPhaseCount', 'AssociatedStationCount', 'DepthPhaseCount',
        'EvaluationMode', 'EvaluationStatus', 'PreferredOriginID', 'PreferredMagnitudeID',
      ];
      for (const col of expectedColumns) {
        expect(headerLine).toContain(col);
      }
    });

    it('should export catalogue as JSON', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });

      mockFindOne.mockResolvedValue({
        id: 'cat-123',
        name: 'Export Test',
        event_count: 1,
      });
      mockToArray.mockResolvedValue([
        { id: 'evt-1', time: '2024-01-15T10:00:00Z', latitude: -41.5, longitude: 174.0, magnitude: 5.0 },
      ]);

      // Act
      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=json'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('json');
    });

    it('should fetch paginated events when unpaginated export result is capped', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });

      mockFindOne.mockResolvedValue({
        id: 'cat-123',
        name: 'Export Test',
        event_count: 2,
      });

      const cappedEvent = { id: 'evt-1', time: '2024-01-15T10:00:00Z', latitude: -41.5, longitude: 174.0, magnitude: 5.0 };
      const secondEvent = { id: 'evt-2', time: '2024-01-16T10:00:00Z', latitude: -42.5, longitude: 175.0, magnitude: 4.0 };
      const paginatedToArray = jest.fn().mockResolvedValue([cappedEvent, secondEvent]);
      const limit = jest.fn().mockReturnValue({ toArray: paginatedToArray });
      const skip = jest.fn().mockReturnValue({ limit });
      const paginatedSort = jest.fn().mockReturnValue({ skip });

      mockFind
        .mockReturnValueOnce({ sort: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([cappedEvent]) }) })
        .mockReturnValueOnce({ sort: paginatedSort });
      mockCountDocuments.mockResolvedValue(2);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=json'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.events).toHaveLength(2);
      expect(skip).toHaveBeenCalledWith(0);
      expect(limit).toHaveBeenCalledWith(5000);
    });

    it('should export catalogue as GeoJSON', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 1 });
      mockToArray.mockResolvedValue([
        { id: 'evt-1', time: '2024-01-15T10:00:00Z', latitude: -41.5, longitude: 174.0, magnitude: 5.0, depth: 10 },
      ]);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=geojson'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('geo+json');

      const body = await response.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(1);
      expect(body.features[0].geometry.type).toBe('Point');
    });

    it('should export catalogue as KML', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 1 });
      mockToArray.mockResolvedValue([
        { id: 'evt-1', time: '2024-01-15T10:00:00Z', latitude: -41.5, longitude: 174.0, magnitude: 5.0, depth: 10 },
      ]);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=kml'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('kml');

      const text = await response.text();
      expect(text).toContain('<?xml');
      expect(text).toContain('<kml');
    });

    it('should export catalogue as QuakeML', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 1 });
      mockToArray.mockResolvedValue([
        { id: 'evt-1', time: '2024-01-15T10:00:00Z', latitude: -41.5, longitude: 174.0, magnitude: 5.0, depth: 10 },
      ]);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=quakeml'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('xml');

      const text = await response.text();
      expect(text).toContain('<q:quakeml');
    });

    it('should return 400 for unsupported format', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=xlsx'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(400);
    });

    it('should return 404 when catalogue not found', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue(null);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/nonexistent/export?format=csv'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
    });

    it('should return 200 with empty CSV body for a catalogue with no events', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Empty Cat', event_count: 0 });
      mockToArray.mockResolvedValue([]);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=csv'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(200);
      const text = await response.text();
      // Should contain the header row but no data rows
      const { header, rows } = csvTable(text);
      expect(header).toEqual(expect.arrayContaining(['Time', 'Latitude', 'Longitude']));
      expect(rows).toEqual([]);
    });

    it('should quote CSV fields containing commas', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 1 });
      mockToArray.mockResolvedValue([
        {
          id: 'evt-1',
          time: '2024-01-15T10:00:00Z',
          latitude: -41.5,
          longitude: 174.0,
          magnitude: 5.0,
          depth: 10,
          region: 'Wellington, New Zealand', // contains comma
          source_events: '[]',
        },
      ]);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=csv'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('"Wellington, New Zealand"');
    });

    it('should include depth=0 as 0 not empty in CSV', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 1 });
      mockToArray.mockResolvedValue([
        {
          id: 'evt-1',
          time: '2024-01-15T10:00:00Z',
          latitude: -41.5,
          longitude: 174.0,
          magnitude: 3.5,
          depth: 0, // surface event
          source_events: '[]',
        },
      ]);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=csv'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(200);
      const text = await response.text();
      const { header, rows } = csvTable(text);
      expect(rows).toHaveLength(1);
      expect(rows[0][header.indexOf('Depth')]).toBe('0');
    });

    it('should set Content-Disposition header with filename', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
      });
      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 1 });
      mockToArray.mockResolvedValue([
        { id: 'evt-1', time: '2024-01-15T10:00:00Z', latitude: -41.5, longitude: 174.0, magnitude: 5.0 },
      ]);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=csv'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('.csv');
    });

    it('should return 401 when unauthenticated', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const { GET } = await import('@/app/api/catalogues/[id]/export/route');
      const request = new NextRequest(
        'http://localhost:3000/api/catalogues/cat-123/export?format=csv'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'cat-123' }) });

      expect(response.status).toBe(401);
    });
  });
});
