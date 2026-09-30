/**
 * @jest-environment node
 *
 * The merge review API (contract M5): GET /api/catalogues/[id]/review lists a merged
 * catalogue's held (or resolved) events, POST /api/catalogues/[id]/review/[eventId] records
 * a reviewer's decision. Auth, the data layer (contract M3's getEventsForReview /
 * resolveMergedEventReview) and the audit log are mocked; the routes are the real code.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(),
  requireEditor: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  dbQueries: { getCatalogueById: jest.fn() },
  getEventsForReview: jest.fn(),
  resolveMergedEventReview: jest.fn(),
}));

jest.mock('@/lib/audit', () => ({
  writeAuditLog: jest.fn(async () => undefined),
}));

import { requireViewer, requireEditor } from '@/lib/auth/middleware';
import { dbQueries, getEventsForReview, resolveMergedEventReview } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { GET } from '@/app/api/catalogues/[id]/review/route';
import { POST } from '@/app/api/catalogues/[id]/review/[eventId]/route';

const viewer = { session: {}, user: { id: 'user-viewer', email: 'v@example.org', role: 'viewer' } };
const editor = { session: {}, user: { id: 'user-editor', email: 'e@example.org', role: 'editor' } };
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });

const getCatalogueById = (dbQueries as any).getCatalogueById as jest.Mock;
const listMock = getEventsForReview as jest.Mock;
const resolveMock = resolveMergedEventReview as jest.Mock;
const auditMock = writeAuditLog as jest.Mock;

const REPORTS = [
  { catalogueId: 'cat-a', source: 'GeoNet', selected: true, originalData: { time: '2016-11-13T11:02:56.000Z', latitude: -42.69, longitude: 173.02, depth: 15.1, magnitude: 7.8 } },
  { catalogueId: 'cat-b', source: 'USGS', originalData: { time: '2016-11-13T11:02:59.000Z', latitude: -42.74, longitude: 173.05, depth: 22, magnitude: 7.8 } },
];

function storedEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    catalogue_id: 'cat-m',
    time: '2016-11-13T11:02:56.000Z',
    latitude: -42.69,
    longitude: 173.02,
    depth: 15.1,
    magnitude: 7.8,
    magnitude_type: 'Mw',
    source_events: JSON.stringify(REPORTS),
    created_at: '2024-01-01T00:00:00.000Z',
    merge_strategy: 'quality',
    merge_parameters: '{}',
    review_status: 'pending',
    review_reasons: ['Depth range 6.9 km exceeds the group threshold'],
    reviewed_by: null,
    reviewed_at: null,
    review_choice: null,
    ...over,
  };
}

const list = async (query = '', id = 'cat-m') => {
  const response = await GET(new NextRequest(`http://localhost/api/catalogues/${id}/review${query ? `?${query}` : ''}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
};

const decide = async (body: unknown, eventId = 'evt-1', id = 'cat-m') => {
  const init = { method: 'POST', headers: { 'content-type': 'application/json' } };
  const request = new NextRequest(`http://localhost/api/catalogues/${id}/review/${eventId}`, {
    ...init,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({ id, eventId }) });
  return { status: response.status, body: await response.json() };
};

beforeEach(() => {
  jest.clearAllMocks();
  (requireViewer as jest.Mock).mockResolvedValue(viewer);
  (requireEditor as jest.Mock).mockResolvedValue(editor);
  getCatalogueById.mockResolvedValue({ id: 'cat-m', name: 'Merged', source_catalogues: '[{"id":"cat-a"},{"id":"cat-b"}]' });
  listMock.mockResolvedValue({ events: [storedEvent()], nextCursor: null, pendingCount: 1, resolvedCount: 0 });
  resolveMock.mockImplementation(async (_catalogueId: string, _eventId: string, choice: unknown) => ({
    event: storedEvent({
      review_status: 'resolved',
      review_choice: choice === 'keep' ? 'keep' : `report:${(choice as { report: number }).report}`,
      reviewed_by: 'user-editor',
      reviewed_at: '2026-09-30T00:00:00.000Z',
    }),
    pendingCount: 0,
  }));
});

describe('GET /api/catalogues/[id]/review', () => {
  it('returns the auth response for a caller who is not a viewer', async () => {
    (requireViewer as jest.Mock).mockResolvedValueOnce(forbidden());
    const { status } = await list();
    expect(status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('404s an unknown catalogue before touching the queue', async () => {
    getCatalogueById.mockResolvedValueOnce(undefined);
    const { status, body } = await list('', 'nope');
    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('lists pending events by default, 50 at a time, with parsed source_events and the counts', async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(listMock).toHaveBeenCalledWith('cat-m', { status: 'pending', limit: 50, after: null });
    expect(body.pendingCount).toBe(1);
    expect(body.resolvedCount).toBe(0);
    expect(body.nextCursor).toBeNull();
    expect(body.events).toHaveLength(1);
    const event = body.events[0];
    expect(event).toMatchObject({
      id: 'evt-1', time: '2016-11-13T11:02:56.000Z', latitude: -42.69, longitude: 173.02, depth: 15.1,
      magnitude: 7.8, magnitude_type: 'Mw', review_status: 'pending', merge_strategy: 'quality',
      reviewed_by: null, reviewed_at: null, review_choice: null,
    });
    expect(event.review_reasons).toEqual(['Depth range 6.9 km exceeds the group threshold']);
    expect(Array.isArray(event.source_events)).toBe(true);
    expect(event.source_events[0]).toMatchObject({ catalogueId: 'cat-a', source: 'GeoNet', selected: true });
    expect(event.source_events[1].originalData.depth).toBe(22);
    // Only the contract's members are exposed: the stored row's other columns stay server-side.
    expect(event).not.toHaveProperty('merge_parameters');
    expect(event).not.toHaveProperty('catalogue_id');
  });

  it('forwards status=resolved, limit and the cursor', async () => {
    listMock.mockResolvedValueOnce({ events: [], nextCursor: '2016-11-13T11:02:56.000Z|evt-9', pendingCount: 3, resolvedCount: 7 });
    const { status, body } = await list('status=resolved&limit=10&after=2016-11-13T11%3A02%3A56.000Z%7Cevt-1');
    expect(status).toBe(200);
    expect(listMock).toHaveBeenCalledWith('cat-m', { status: 'resolved', limit: 10, after: '2016-11-13T11:02:56.000Z|evt-1' });
    expect(body.nextCursor).toBe('2016-11-13T11:02:56.000Z|evt-9');
    expect(body.pendingCount).toBe(3);
    expect(body.resolvedCount).toBe(7);
  });

  it('rejects an unknown status or an out-of-range limit with 400', async () => {
    expect((await list('status=held')).status).toBe(400);
    expect((await list('limit=0')).status).toBe(400);
    expect((await list('limit=201')).status).toBe(400);
    expect((await list('limit=ten')).status).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('tolerates an unreadable source_events column and a missing reasons array', async () => {
    listMock.mockResolvedValueOnce({
      events: [storedEvent({ source_events: '{not json', review_reasons: null })],
      nextCursor: null, pendingCount: 1, resolvedCount: 0,
    });
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.events[0].source_events).toEqual([]);
    expect(body.events[0].review_reasons).toEqual([]);
  });

  it('keeps the data layer\'s client-facing status and masks anything else', async () => {
    listMock.mockRejectedValueOnce(new AppError('Malformed cursor', 400, 'BAD_CURSOR'));
    const bad = await list('after=garbage');
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'Malformed cursor', code: 'BAD_CURSOR' });

    listMock.mockRejectedValueOnce(new Error('MongoServerError: connection refused at 10.0.0.1'));
    const masked = await list();
    expect(masked.status).toBe(500);
    expect(JSON.stringify(masked.body)).not.toContain('10.0.0.1');
  });
});

describe('POST /api/catalogues/[id]/review/[eventId]', () => {
  it('returns the auth response for a caller who is not an editor', async () => {
    (requireEditor as jest.Mock).mockResolvedValueOnce(forbidden());
    const { status } = await decide({ choice: 'keep' });
    expect(status).toBe(403);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', ''],
    ['invalid JSON', '{choice'],
    ['no choice', {}],
    ['an unknown choice word', { choice: 'discard' }],
    ['a negative report index', { choice: { report: -1 } }],
    ['a fractional report index', { choice: { report: 0.5 } }],
    ['a string report index', { choice: { report: '1' } }],
    ['an array choice', { choice: ['keep'] }],
  ])('rejects %s with 400 and records nothing', async (_label, body) => {
    const { status, body: response } = await decide(body);
    expect(status).toBe(400);
    expect(response.code).toBe('VALIDATION_ERROR');
    expect(resolveMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('keeps the provisional solution, returns the row and the new pending count, and audits the decision', async () => {
    const { status, body } = await decide({ choice: 'keep' });
    expect(status).toBe(200);
    expect(resolveMock).toHaveBeenCalledWith('cat-m', 'evt-1', 'keep', { userId: 'user-editor' });
    expect(body.pendingCount).toBe(0);
    expect(body.event).toMatchObject({ id: 'evt-1', review_status: 'resolved', review_choice: 'keep', reviewed_by: 'user-editor' });
    expect(auditMock).toHaveBeenCalledTimes(1);
    const [entry, request] = auditMock.mock.calls[0];
    expect(entry).toMatchObject({
      action: 'merge.review',
      actor_id: 'user-editor',
      actor_email: 'e@example.org',
      target_id: 'evt-1',
      metadata: { catalogueId: 'cat-m', eventId: 'evt-1', choice: 'keep' },
    });
    expect(request).toBeInstanceOf(NextRequest);
  });

  it('publishes a report by index and records the report choice in the audit metadata', async () => {
    const { status, body } = await decide({ choice: { report: 1 } });
    expect(status).toBe(200);
    expect(resolveMock).toHaveBeenCalledWith('cat-m', 'evt-1', { report: 1 }, { userId: 'user-editor' });
    expect(body.event.review_choice).toBe('report:1');
    expect(auditMock.mock.calls[0][0].metadata).toEqual({ catalogueId: 'cat-m', eventId: 'evt-1', choice: 'report:1' });
  });

  it.each([
    [404, 'Merged event not found', 'NOT_FOUND'],
    [409, 'Event is not pending review', 'NOT_PENDING'],
    [400, 'Entry 3 is superseded and cannot be published', 'BAD_REPORT'],
  ])('maps the data layer\'s %s to the response and audits nothing', async (statusCode, message, code) => {
    resolveMock.mockRejectedValueOnce(new AppError(message, statusCode, code));
    const { status, body } = await decide({ choice: { report: 3 } });
    expect(status).toBe(statusCode);
    expect(body).toEqual({ error: message, code });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('masks unexpected failures as a generic 500', async () => {
    resolveMock.mockRejectedValueOnce(new Error('E11000 duplicate key at merged_events'));
    const { status, body } = await decide({ choice: 'keep' });
    expect(status).toBe(500);
    expect(body.code).toBe('REVIEW_FAILED');
    expect(JSON.stringify(body)).not.toContain('E11000');
    expect(auditMock).not.toHaveBeenCalled();
  });
});
