/**
 * @jest-environment node
 *
 * File Upload Security Tests
 *
 * Tests that the upload API enforces authentication, file type restrictions,
 * and size limits via real calls into the route handler.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(),
  requireAdmin: jest.fn(),
  requireViewer: jest.fn(),
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: {
    USERS: 'users',
    CATALOGUES: 'merged_catalogues',
    EVENTS: 'merged_events',
    AUDIT_LOGS: 'audit_logs',
    PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  },
  isConnected: jest.fn().mockResolvedValue(true),
  getDb: jest.fn(),
}));

jest.mock('@/lib/db', () => ({ dbQueries: null }));

jest.mock('@/lib/parsers', () => ({
  parseFile: jest.fn().mockReturnValue({
    success: true,
    events: [],
    errors: [],
    warnings: [],
    detectedFields: [],
  }),
}));

jest.mock('@/lib/pending-uploads', () => ({
  storePendingUpload: jest.fn().mockResolvedValue('pending-id-123'),
  getPendingUploadEvents: jest.fn().mockResolvedValue(null),
  deletePendingUpload: jest.fn().mockResolvedValue(undefined),
  iteratePendingUploadEventBatches: jest.fn(),
}));

jest.mock('@/lib/cache', () => ({
  apiCache: { get: jest.fn(), set: jest.fn() },
  catalogueCache: { get: jest.fn(), set: jest.fn() },
  generateCacheKey: jest.fn().mockReturnValue('key'),
  invalidateCacheByPrefix: jest.fn(),
}));

jest.mock('@/lib/id', () => ({ createId: jest.fn().mockReturnValue('test-id') }));

import { requireEditor } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

function mockUnauthenticated() {
  (requireEditor as jest.Mock).mockResolvedValue(
    NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  );
}

function mockAuthenticated() {
  const user = { id: 'u1', email: 'test@example.com', role: 'editor' };
  (requireEditor as jest.Mock).mockResolvedValue({ session: { user }, user });
}

function makeUploadRequest(file: File): NextRequest {
  const formData = new FormData();
  formData.append('file', file);
  return new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Authentication gate
// ---------------------------------------------------------------------------

describe('POST /api/upload — authentication gate', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated();
    const { POST } = await import('@/app/api/upload/route');
    const file = new File(['content'], 'test.csv', { type: 'text/csv' });
    const res = await POST(makeUploadRequest(file));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Extension filtering
// ---------------------------------------------------------------------------

describe('POST /api/upload — extension filtering', () => {
  beforeEach(() => mockAuthenticated());

  const disallowedFiles: [string, string][] = [
    ['malware.exe', 'application/octet-stream'],
    ['shell.php', 'text/plain'],
    ['script.js', 'application/javascript'],
    ['payload.sh', 'text/plain'],
    ['archive.zip', 'application/zip'],
    ['document.pdf', 'application/pdf'],
    ['image.jpg', 'image/jpeg'],
  ];

  it.each(disallowedFiles)(
    'returns 400 for disallowed file "%s"',
    async (filename, mimeType) => {
      const { POST } = await import('@/app/api/upload/route');
      const file = new File(['content'], filename, { type: mimeType });
      const res = await POST(makeUploadRequest(file));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid file type/i);
    }
  );

  const allowedFiles: [string, string][] = [
    ['data.csv', 'text/csv'],
    ['data.txt', 'text/plain'],
    ['data.json', 'application/json'],
    ['data.geojson', 'application/geo+json'],
    ['data.xml', 'text/xml'],
    ['data.qml', 'application/vnd.quakeml+xml'],
  ];

  it.each(allowedFiles)(
    'passes extension check for "%s"',
    async (filename, mimeType) => {
      const { POST } = await import('@/app/api/upload/route');
      const file = new File(['content'], filename, { type: mimeType });
      const res = await POST(makeUploadRequest(file));
      // Should not be rejected for file type
      const body = await res.json();
      expect(body.error ?? '').not.toMatch(/invalid file type/i);
    }
  );
});

// ---------------------------------------------------------------------------
// MIME type filtering (secondary check — extension is valid, MIME is wrong)
// ---------------------------------------------------------------------------

describe('POST /api/upload — MIME type filtering', () => {
  beforeEach(() => mockAuthenticated());

  const forbiddenMimeTypes: string[] = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/javascript',
    'text/javascript',
    'application/x-executable',
    'application/x-msdownload',
    'application/x-sh',
  ];

  it.each(forbiddenMimeTypes)(
    'returns 400 when MIME type is "%s" even though extension is valid',
    async (mimeType) => {
      const { POST } = await import('@/app/api/upload/route');
      // Use a valid extension (.csv) but attach a forbidden MIME type
      const file = new File(['content'], 'data.csv', { type: mimeType });
      const res = await POST(makeUploadRequest(file));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/mime type/i);
    }
  );

  it('accepts empty MIME type (some clients omit it)', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = new File(['content'], 'data.csv', { type: '' });
    const res = await POST(makeUploadRequest(file));
    const body = await res.json();
    expect(body.error ?? '').not.toMatch(/mime type/i);
  });

  it('accepts application/octet-stream (generic binary fallback)', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = new File(['content'], 'data.csv', { type: 'application/octet-stream' });
    const res = await POST(makeUploadRequest(file));
    const body = await res.json();
    expect(body.error ?? '').not.toMatch(/mime type/i);
  });
});

// ---------------------------------------------------------------------------
// File size limits
// ---------------------------------------------------------------------------

describe('POST /api/upload — size limits', () => {
  it('returns 413 with UPLOAD_PARSE_LIMIT_EXCEEDED when file exceeds sync-parse limit', async () => {
    mockAuthenticated();
    // Set sync-parse limit to 1 byte so a tiny file triggers the 413
    const saved = process.env.UPLOAD_MAX_SYNC_PARSE_MB;
    process.env.UPLOAD_MAX_SYNC_PARSE_MB = '0.000001';
    try {
      const { POST } = await import('@/app/api/upload/route');
      const file = new File(['a'.repeat(200)], 'data.csv', { type: 'text/csv' });
      const res = await POST(makeUploadRequest(file));
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.code).toBe('UPLOAD_PARSE_LIMIT_EXCEEDED');
      expect(body.fileSize).toBeGreaterThan(0);
      expect(body.limit).toBeGreaterThan(0);
    } finally {
      if (saved === undefined) {
        delete process.env.UPLOAD_MAX_SYNC_PARSE_MB;
      } else {
        process.env.UPLOAD_MAX_SYNC_PARSE_MB = saved;
      }
    }
  });

  it('returns 400 for missing file in formdata', async () => {
    mockAuthenticated();
    const { POST } = await import('@/app/api/upload/route');
    const formData = new FormData();
    // No file appended — formData is empty
    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });
});
