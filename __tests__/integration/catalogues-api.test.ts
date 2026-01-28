/**
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
 * NOTE: These tests require Node.js 18+ for native Web API support (Request/Response).
 * They will be skipped on older Node versions.
 */

// Ensure this file is treated as a module (prevents global scope pollution)
export {};

// Check for Web API support BEFORE any imports that might depend on them
const hasWebAPIs = typeof globalThis.Request !== 'undefined';
const describeIfWebAPIs = hasWebAPIs ? describe : describe.skip;

// Mock definitions - these are hoisted by Jest and run before any imports
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  getCollection: jest.fn(),
  withTransaction: jest.fn((callback) => callback({})),
  COLLECTIONS: {
    CATALOGUES: 'merged_catalogues',
    EVENTS: 'merged_events',
  },
}));

jest.mock('@/lib/cache', () => ({
  apiCache: { get: jest.fn(), set: jest.fn(), delete: jest.fn(), clear: jest.fn() },
  catalogueCache: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
  generateCacheKey: jest.fn((prefix, params) => `${prefix}:${JSON.stringify(params)}`),
  invalidateCacheByPrefix: jest.fn(),
}));

jest.mock('@/lib/rate-limiter', () => ({
  applyRateLimit: jest.fn(() => ({ success: true, headers: {} })),
  readRateLimiter: {},
  apiRateLimiter: {},
}));

// Conditionally import modules to avoid loading next/server on Node < 18
// Using require() inside conditional ensures the import doesn't happen at module parse time
let NextRequest: typeof import('next/server').NextRequest;
let getServerSession: typeof import('next-auth').getServerSession;
let getCollection: typeof import('@/lib/mongodb').getCollection;
let catalogueCache: typeof import('@/lib/cache').catalogueCache;

if (hasWebAPIs) {
  NextRequest = require('next/server').NextRequest;
  getServerSession = require('next-auth').getServerSession;
  getCollection = require('@/lib/mongodb').getCollection;
  catalogueCache = require('@/lib/cache').catalogueCache;
}

describeIfWebAPIs('Catalogue API Integration Tests', () => {
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
      const response = await GET(request, { params: { id: 'cat-123' } });
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
      const response = await GET(request, { params: { id: 'non-existent' } });

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
      });
      mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

      const requestBody = {
        name: 'Updated Name',
        metadata: { description: 'Updated description' },
      };

      // Act
      const { PATCH } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/cat-123', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });
      const response = await PATCH(request, { params: { id: 'cat-123' } });

      // Assert
      expect(response.status).toBe(200);
      expect(mockUpdateOne).toHaveBeenCalled();
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
      const response = await PATCH(request, { params: { id: 'cat-123' } });

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/catalogues/[id]', () => {
    const mockFindOne = jest.fn();
    const mockDeleteOne = jest.fn();
    const mockDeleteMany = jest.fn();

    beforeEach(() => {
      (getCollection as jest.Mock).mockResolvedValue({
        findOne: mockFindOne,
        deleteOne: mockDeleteOne,
        deleteMany: mockDeleteMany,
      });
    });

    it('should delete catalogue and its events', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'To Delete' });
      mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
      mockDeleteMany.mockResolvedValue({ deletedCount: 100 });

      // Act
      const { DELETE } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/cat-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: { id: 'cat-123' } });

      // Assert
      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent catalogue', async () => {
      // Arrange
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: 'editor-123', email: 'editor@example.com', role: 'editor' },
      });

      mockFindOne.mockResolvedValue(null);

      // Act
      const { DELETE } = await import('@/app/api/catalogues/[id]/route');
      const request = new NextRequest('http://localhost:3000/api/catalogues/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: { id: 'non-existent' } });

      // Assert
      expect(response.status).toBe(404);
    });
  });
});

describeIfWebAPIs('Catalogue Events API', () => {
  const mockFind = jest.fn();
  const mockToArray = jest.fn();
  const mockSort = jest.fn();
  const mockSkip = jest.fn();
  const mockLimit = jest.fn();
  const mockCountDocuments = jest.fn();

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
      const response = await GET(request, { params: { id: 'cat-123' } });
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.events).toHaveLength(2);
    });
  });
});

describeIfWebAPIs('Catalogue Export API', () => {
  const mockFindOne = jest.fn();
  const mockFind = jest.fn();
  const mockToArray = jest.fn();
  const mockSort = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockSort.mockReturnValue({ toArray: mockToArray });
    mockFind.mockReturnValue({ sort: mockSort });

    (getCollection as jest.Mock).mockResolvedValue({
      findOne: mockFindOne,
      find: mockFind,
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
      const response = await GET(request, { params: { id: 'cat-123' } });

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('csv');
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
      const response = await GET(request, { params: { id: 'cat-123' } });

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('json');
    });
  });
});
