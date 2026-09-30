/**
 * @jest-environment node
 *
 * /api/settings/merge-authority: viewers may read the effective table, only administrators
 * may replace or reset it, every write is validated with lib/merge-authority's own rules
 * and audited as 'settings.merge_authority'.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(),
  requireAdmin: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));
jest.mock('@/lib/merge-authority', () => {
  const actual = jest.requireActual('@/lib/merge-authority-table');
  return {
    ...actual,
    loadMergeAuthority: jest.fn(),
    saveMergeAuthority: jest.fn(),
    resetMergeAuthority: jest.fn(),
  };
});

import { DELETE, GET, PUT } from '@/app/api/settings/merge-authority/route';
import { requireAdmin, requireViewer } from '@/lib/auth/middleware';
import { writeAuditLog } from '@/lib/audit';
import {
  DEFAULT_MERGE_AUTHORITY,
  loadMergeAuthority,
  resetMergeAuthority,
  saveMergeAuthority,
} from '@/lib/merge-authority';

const admin = { session: {}, user: { id: 'admin-1', email: 'admin@example.test', role: 'admin' } };
const viewer = { session: {}, user: { id: 'viewer-1', email: 'viewer@example.test', role: 'viewer' } };
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });
const unauthorised = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const url = 'http://localhost/api/settings/merge-authority';
const get = () => new NextRequest(url);
const put = (body: unknown, raw = false) =>
  new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) });
const del = () => new NextRequest(url, { method: 'DELETE' });

const goodBody = {
  hierarchy: [{ patterns: ['USGS', 'neic'], priority: 1, description: 'USGS first', agency: 'usgs' }],
  regions: [{ name: 'JP', bounds: { minLat: 24, maxLat: 46, minLon: 122, maxLon: 154 }, hierarchy: [{ patterns: ['jma'], priority: 1, agency: 'jma' }] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (requireViewer as jest.Mock).mockResolvedValue(viewer);
  (requireAdmin as jest.Mock).mockResolvedValue(admin);
  (loadMergeAuthority as jest.Mock).mockResolvedValue(DEFAULT_MERGE_AUTHORITY);
  (saveMergeAuthority as jest.Mock).mockImplementation(async table => ({ ...table, source: 'custom', updatedAt: '2026-09-30T00:00:00.000Z' }));
  (resetMergeAuthority as jest.Mock).mockResolvedValue(undefined);
});

describe('GET /api/settings/merge-authority', () => {
  it('answers the effective table to a viewer', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('default');
    expect(body.hierarchy).toEqual(DEFAULT_MERGE_AUTHORITY.hierarchy);
    expect(body.regions).toHaveLength(2);
    expect(requireViewer).toHaveBeenCalledTimes(1);
  });

  it('refuses an anonymous request with the middleware\'s response', async () => {
    (requireViewer as jest.Mock).mockResolvedValue(unauthorised());
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(loadMergeAuthority).not.toHaveBeenCalled();
  });
});

describe('PUT /api/settings/merge-authority', () => {
  it('requires an administrator', async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(forbidden());
    const res = await PUT(put(goodBody));
    expect(res.status).toBe(403);
    expect(saveMergeAuthority).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('rejects a malformed JSON body', async () => {
    const res = await PUT(put('{not json', true));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON body');
    expect(saveMergeAuthority).not.toHaveBeenCalled();
  });

  it('rejects an invalid table with the validator\'s message and stores nothing', async () => {
    const res = await PUT(put({ hierarchy: [{ patterns: ['geo net'], priority: 1 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Invalid authority table: hierarchy\.0\.patterns\.0/);
    expect(saveMergeAuthority).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('saves the normalised table, audits it and answers what was stored', async () => {
    const req = put(goodBody);
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.table.source).toBe('custom');
    expect(body.table.updatedAt).toBe('2026-09-30T00:00:00.000Z');
    // Patterns reach storage lower-cased: the engine matches lower-cased tokens.
    expect(body.table.hierarchy[0].patterns).toEqual(['usgs', 'neic']);

    expect(saveMergeAuthority).toHaveBeenCalledTimes(1);
    expect((saveMergeAuthority as jest.Mock).mock.calls[0][0]).toMatchObject({ source: 'custom', hierarchy: [{ patterns: ['usgs', 'neic'] }] });

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const [entry, request] = (writeAuditLog as jest.Mock).mock.calls[0];
    expect(entry).toMatchObject({
      action: 'settings.merge_authority',
      actor_id: 'admin-1',
      actor_email: 'admin@example.test',
      target_id: 'merge_authority',
      target_type: 'settings',
      metadata: { operation: 'save', hierarchyEntries: 1, regions: ['JP'], updatedAt: '2026-09-30T00:00:00.000Z' },
    });
    expect(request).toBe(req);
  });

  it('answers 500 when the store refuses the write', async () => {
    (saveMergeAuthority as jest.Mock).mockRejectedValue(new Error('write refused'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await PUT(put(goodBody));
    expect(res.status).toBe(500);
    expect(writeAuditLog).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('DELETE /api/settings/merge-authority', () => {
  it('requires an administrator', async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(forbidden());
    const res = await DELETE(del());
    expect(res.status).toBe(403);
    expect(resetMergeAuthority).not.toHaveBeenCalled();
  });

  it('resets, audits and answers the default table', async () => {
    const res = await DELETE(del());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.table.source).toBe('default');
    expect(body.table.hierarchy).toEqual(DEFAULT_MERGE_AUTHORITY.hierarchy);
    expect(resetMergeAuthority).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'settings.merge_authority', actor_id: 'admin-1', metadata: { operation: 'reset' } }),
      expect.anything(),
    );
  });

  it('answers 500 when the store refuses the delete', async () => {
    (resetMergeAuthority as jest.Mock).mockRejectedValue(new Error('gone'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await DELETE(del());
    expect(res.status).toBe(500);
    error.mockRestore();
  });
});
