/** @jest-environment node */

/**
 * POST /api/merge (cluster B1): contract C13 (a saved merge writes a `merge.create` audit
 * entry, with the client address from the request), the server-attested creator of the
 * merged catalogue, and C10 (a Custom Order ranking survives validation and reaches the
 * merge). The route, lib/merge and lib/audit run for real; the database, MongoDB audit
 * collection and session lookup are the stubbed boundaries.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'editor-1', email: 'editor@example.org', role: 'editor' } })),
}));

const auditInserts: any[] = [];
jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  getCollection: jest.fn(async () => ({ insertOne: jest.fn(async (doc: any) => { auditInserts.push(doc); return {}; }) })),
  COLLECTIONS: { AUDIT_LOGS: 'audit_logs', EVENTS: 'events', CATALOGUES: 'catalogues' },
  withTransaction: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  dbQueries: {
    transaction: jest.fn(async (fn: any) => fn({ id: 'session' })),
    insertCatalogue: jest.fn(),
    getEventsByCatalogueIdCursor: jest.fn(async (id: string) => ({
      data: [{
        id: `${id}-1`, catalogue_id: id, time: id === 'cat-a' ? '2024-01-01T00:00:00Z' : '2024-01-01T00:00:01Z',
        latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 4.1, magnitude_type: 'ML', source_events: '[]',
      }],
      pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
    })),
    getCatalogueById: jest.fn(async (id: string) => ({ id, status: 'complete' })),
    bulkInsertEvents: jest.fn(async (rows: any[]) => rows.length),
    updateCatalogueGeoBounds: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueStatus: jest.fn(),
  },
}));

import { POST } from '@/app/api/merge/route';
import { POST as previewPOST } from '@/app/api/merge/preview/route';
import { dbQueries } from '@/lib/db';

const db = dbQueries as unknown as Record<string, jest.Mock>;

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/merge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  }));
}

const request = (config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  name: 'Merged NZ Catalogue',
  sourceCatalogues: [
    { id: 'cat-a', name: 'Alpha', events: 1, source: 'Alpha' },
    { id: 'cat-b', name: 'Bravo', events: 1, source: 'Bravo' },
  ],
  config: { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'newest', ...config },
  ...extra,
});

beforeEach(() => {
  auditInserts.length = 0;
  db.insertCatalogue.mockClear();
  db.bulkInsertEvents.mockClear();
  db.getCatalogueById.mockImplementation(async (id: string) => ({ id, status: 'complete' }));
});

describe('POST /api/merge', () => {
  it('audits a saved merge as merge.create, attributed to the session user (C13)', async () => {
    const response = await post(request());
    expect(response.status).toBe(200);
    const result = await response.json();

    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]).toMatchObject({
      action: 'merge.create',
      actor_id: 'editor-1',
      actor_email: 'editor@example.org',
      target_id: result.catalogueId,
      target_type: 'catalogue',
      metadata: {
        name: 'Merged NZ Catalogue',
        sourceCatalogueIds: ['cat-a', 'cat-b'],
        mergeStrategy: 'priority',
        priority: 'newest',
        eventCount: result.eventCount,
      },
    });
    // The client address comes from the request (lib/audit resolves it like the rate limiter).
    expect(auditInserts[0].ip).toBe('203.0.113.7');
  });

  it('records the session user as the merged catalogue\'s creator', async () => {
    await post(request());
    expect(db.insertCatalogue.mock.calls[0][8]).toEqual({ createdBy: 'editor-1' });
  });

  it('does not audit an export-only merge, which creates nothing', async () => {
    const response = await post(request({}, { exportOnly: true }));
    expect(response.status).toBe(200);
    expect(auditInserts).toHaveLength(0);
    expect(db.insertCatalogue).not.toHaveBeenCalled();
  });

  it('carries a Custom Order ranking through validation into the stored configuration (C10)', async () => {
    const response = await post(request({ priority: 'custom', priorityOrder: ['cat-b', 'cat-a'] }));
    expect(response.status).toBe(200);
    expect(JSON.parse(db.insertCatalogue.mock.calls[0][3]).priorityOrder).toEqual(['cat-b', 'cat-a']);
    expect(auditInserts[0].metadata.priorityOrder).toEqual(['cat-b', 'cat-a']);
  });

  it('rejects a ranking that names a catalogue outside the merge', async () => {
    const response = await post(request({ priority: 'custom', priorityOrder: ['cat-b', 'cat-z'] }));
    expect(response.status).toBe(400);
    expect(db.insertCatalogue).not.toHaveBeenCalled();
  });
});


describe.each([['save', POST], ['preview', previewPOST]] as const)('%s source validation', (_mode, handler) => {
  it.each([
    ['missing', undefined, 404, 'CATALOGUE_NOT_FOUND'],
    ['processing', { id: 'cat-a', status: 'processing' }, 409, 'CATALOGUE_NOT_READY'],
  ])('rejects a %s source with a useful client error', async (_label, catalogue, status, code) => {
    db.getCatalogueById.mockResolvedValue(catalogue);
    const response = await handler(new NextRequest('http://localhost/api/merge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request()),
    }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(db.bulkInsertEvents).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
  });
});

describe('a missing or malformed JSON body', () => {
  const raw = (url: string, body: string) => new NextRequest(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  });

  it('is a 400 INVALID_JSON from the merge and the preview, not a failed merge', async () => {
    for (const [route, url] of [[POST, 'http://localhost/api/merge'], [previewPOST, 'http://localhost/api/merge/preview']] as const) {
      for (const body of ['', '{"name":']) {
        const res = await route(raw(url, body));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Invalid JSON body', code: 'INVALID_JSON' });
      }
    }
  });
});
