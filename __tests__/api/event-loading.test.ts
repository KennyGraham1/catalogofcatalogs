/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { GET } from '@/app/api/catalogues/[id]/events/route';
import { GET as getDetail } from '@/app/api/catalogues/[id]/events/[eventId]/route';
import { dbQueries } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { eventCache } from '@/lib/cache';

jest.mock('@/lib/auth/middleware', () => ({ requireViewer: jest.fn() }));
jest.mock('@/lib/db', () => ({ dbQueries: { getEventsByCatalogueIdCursor: jest.fn(), getEventById: jest.fn() } }));

describe('event loading API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventCache.clearAll();
    (requireViewer as jest.Mock).mockResolvedValue({ user: { id: 'viewer' } });
    (dbQueries!.getEventsByCatalogueIdCursor as jest.Mock).mockImplementation(async (_id, options) => ({
      data: [{ id: 'event', ...(options.summary ? {} : { picks: 'large nested record' }) }],
      pagination: { hasMore: false, nextCursor: null, limit: options.limit },
    }));
  });
  const request = (query: string) => new NextRequest(`http://localhost/api/catalogues/cat/events?${query}`);
  const context = { params: Promise.resolve({ id: 'cat' }) };

  it('uses bounded cursor pages and keeps summary/full caches separate', async () => {
    const summary = await GET(request('view=summary&limit=500'), context);
    expect((await summary.json()).data[0].picks).toBeUndefined();
    expect(dbQueries!.getEventsByCatalogueIdCursor).toHaveBeenCalledWith('cat', expect.objectContaining({ limit: 500, summary: true }));
    const full = await GET(request('limit=500'), context);
    expect((await full.json()).data[0].picks).toBe('large nested record');
    await GET(request('view=summary&limit=500'), context);
    expect(dbQueries!.getEventsByCatalogueIdCursor).toHaveBeenCalledTimes(2);
  });

  it('caps requested summary pages and rejects malformed cursors before querying', async () => {
    await GET(request('view=summary&limit=50000'), context);
    expect(dbQueries!.getEventsByCatalogueIdCursor).toHaveBeenCalledWith('cat', expect.objectContaining({ limit: 10000 }));
    const bad = await GET(request('view=summary&cursor=not-a-cursor'), context);
    expect(bad.status).toBe(400);
    expect(dbQueries!.getEventsByCatalogueIdCursor).toHaveBeenCalledTimes(1);
  });

  it('requires authentication for pages and full event details', async () => {
    (requireViewer as jest.Mock).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    expect((await GET(request('view=summary'), context)).status).toBe(401);
    expect((await getDetail(request(''), { params: Promise.resolve({ id: 'cat', eventId: 'e' }) })).status).toBe(401);
    expect(dbQueries!.getEventById).not.toHaveBeenCalled();
  });

  it('returns full selected-event details and reports missing events', async () => {
    const event = { id: 'e', catalogue_id: 'cat', picks: '[{"station":"ABC"}]' };
    (dbQueries!.getEventById as jest.Mock).mockResolvedValueOnce(event).mockResolvedValueOnce(undefined);
    const params = { params: Promise.resolve({ id: 'cat', eventId: 'e' }) };
    expect(await (await getDetail(request(''), params)).json()).toEqual(event);
    expect(dbQueries!.getEventById).toHaveBeenCalledWith('cat', 'e');
    expect((await getDetail(request(''), params)).status).toBe(404);
  });
});
