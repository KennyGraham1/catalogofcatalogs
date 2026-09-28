/**
 * @jest-environment node
 *
 * POST /api/upload and POST /api/upload/finalize (contract C15, findings #49, #36/#46,
 * #51 consumer side).
 *
 *  - #49: both routes returned every parsed event (raw columns plus canonical fields, ~5x
 *    the source size), so an ordinary upload broke Vercel's 4.5 MB payload limit. They
 *    must return counts, the parser's column resolution and a bounded preview.
 *  - #36/#46: finalize handed the stored delimiter NAME ('pipe') to the parser, so any
 *    explicit delimiter on a chunked upload produced zero events.
 *  - C9: pending uploads are stored for, and chunk sessions looked up by, the session user.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ session: {}, user: { id: 'editor-1', email: 'e@example.com', role: 'editor' } })),
}));

jest.mock('@/lib/pending-uploads', () => ({
  storePendingUpload: jest.fn(async () => 'pending-1'),
  createPendingUpload: jest.fn(async () => ({ uploadId: 'pending-stream', expiresAt: new Date(Date.now() + 1000) })),
  appendPendingUploadEvents: jest.fn(async (_id: string, events: unknown[], seq: number) => seq + events.length),
}));

jest.mock('@/lib/upload-chunks', () => {
  const actual = jest.requireActual('@/lib/upload-chunks');
  return {
    ...actual,
    getUploadSession: jest.fn(),
    assembleChunks: jest.fn(),
    assembleChunksToFile: jest.fn(),
    deleteUploadSession: jest.fn(async () => undefined),
  };
});

import { POST as upload } from '@/app/api/upload/route';
import { POST as finalize } from '@/app/api/upload/finalize/route';
import { storePendingUpload, appendPendingUploadEvents } from '@/lib/pending-uploads';
import { getUploadSession, assembleChunks, assembleChunksToFile } from '@/lib/upload-chunks';
import { writeFileSync } from 'fs';

const csvRows = (n: number) => {
  const header = 'eventid,origintime,latitude,longitude,depth,magnitude,magnitudetype,region,agency,evaluationstatus';
  const rows = Array.from({ length: n }, (_, i) =>
    `2024p${String(i).padStart(6, '0')},2024-01-01T00:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z,` +
    `${(-41 - (i % 100) / 100).toFixed(3)},${(174 + (i % 50) / 100).toFixed(3)},${(5 + (i % 30)).toFixed(1)},${(2 + (i % 20) / 10).toFixed(1)},ML,Wellington region,WEL,reviewed`);
  return [header, ...rows].join('\n');
};

const uploadRequest = (content: string, name: string, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.append('file', new File([content], name, { type: 'text/csv' }));
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return new NextRequest('http://localhost/api/upload', { method: 'POST', body: form });
};

const finalizeRequest = () => new NextRequest('http://localhost/api/upload/finalize', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: 'session-1' }),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/upload response is bounded (#49, C15)', () => {
  it('returns counts, resolution and a bounded preview instead of every event', async () => {
    const content = csvRows(20000);
    const response = await upload(uploadRequest(content, 'geonet.csv'));
    const raw = await response.text();
    const body = JSON.parse(raw);

    expect(response.status).toBe(200);
    expect(body.events).toBeUndefined();
    expect(body.eventCount).toBe(20000);
    expect(body.pendingUploadId).toBe('pending-1');
    expect(body.previewEvents.length).toBeGreaterThan(0);
    expect(body.previewEvents.length).toBeLessThanOrEqual(1000);
    expect(body.previewIndices).toHaveLength(body.previewEvents.length);
    expect(body.previewTruncated).toBe(true);
    expect(body.detectedFields).toContain('origintime');
    expect(body).toHaveProperty('resolvedFieldSources');
    expect(body).toHaveProperty('fileDecisions');
    // Far below Vercel's 4.5 MB response limit although the parsed set is much larger.
    expect(Buffer.byteLength(raw)).toBeLessThan(2.5 * 1024 * 1024);

    // The whole parsed set goes to the pending store, owned by the uploader (C9).
    const [storedEvents, ownerId] = (storePendingUpload as jest.Mock).mock.calls[0];
    expect(storedEvents).toHaveLength(20000);
    expect(ownerId).toBe('editor-1');
  });

  it('rejects an explicit delimiter it cannot honour', async () => {
    const response = await upload(uploadRequest(csvRows(2), 'a.csv', { delimiter: 'colon' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_DELIMITER');
  });

  it('accepts the .quakeml extension', async () => {
    const xml = `<?xml version="1.0"?><q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"><eventParameters publicID="smi:x/ep"><event publicID="smi:x/e/1"><origin publicID="smi:x/o/1"><time><value>2024-01-01T00:00:00Z</value></time><latitude><value>-41</value></latitude><longitude><value>174</value></longitude></origin><magnitude publicID="smi:x/m/1"><mag><value>3.5</value></mag></magnitude><preferredOriginID>smi:x/o/1</preferredOriginID></event></eventParameters></q:quakeml>`;
    const form = new FormData();
    form.append('file', new File([xml], 'events.quakeml', { type: 'application/xml' }));
    const response = await upload(new NextRequest('http://localhost/api/upload', { method: 'POST', body: form }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.eventCount).toBe(1);
    expect(body.previewEvents[0].quakeml).toBeUndefined();
  });
});

describe('POST /api/upload/finalize', () => {
  const pipeText = [
    '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName',
    '2024p000001|2024-01-01T00:00:00|-41.2|174.7|10|GNS|NZ|WEL|2024p000001|ML|3.2|GNS|Wellington',
    '2024p000002|2024-01-02T00:00:00|-41.3|174.8|12|GNS|NZ|WEL|2024p000002|ML|3.4|GNS|Wellington',
  ].join('\n');

  it('maps the stored delimiter name to its character (#36/#46)', async () => {
    (getUploadSession as jest.Mock).mockResolvedValue({
      session_id: 'session-1', file_name: 'fdsn.txt', file_size: 4_000_000, total_chunks: 2, delimiter: 'pipe',
    });
    (assembleChunks as jest.Mock).mockResolvedValue(pipeText);

    const response = await finalize(finalizeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.eventCount).toBe(2);
    expect(body.events).toBeUndefined();
    expect(body.previewEvents).toHaveLength(2);
    expect(storePendingUpload).toHaveBeenCalledWith(expect.any(Array), 'editor-1');
  });

  it('looks the session up for the requesting user only (C9)', async () => {
    (getUploadSession as jest.Mock).mockResolvedValue(null);
    const response = await finalize(finalizeRequest());
    expect(response.status).toBe(404);
    expect(getUploadSession).toHaveBeenCalledWith('session-1', 'editor-1');
  });

  it('rejects a stored delimiter or date format that cannot be mapped', async () => {
    (getUploadSession as jest.Mock).mockResolvedValue({
      session_id: 'session-1', file_name: 'x.csv', file_size: 4_000_000, total_chunks: 2, delimiter: 'comma!',
    });
    expect((await finalize(finalizeRequest())).status).toBe(400);

    (getUploadSession as jest.Mock).mockResolvedValue({
      session_id: 'session-1', file_name: 'x.csv', file_size: 4_000_000, total_chunks: 2, date_format: 'lunar',
    });
    const response = await finalize(finalizeRequest());
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_DATE_FORMAT');
    expect(assembleChunks).not.toHaveBeenCalled();
  });

  it('streams a .quakeml upload and stores it for the owner', async () => {
    const xml = `<?xml version="1.0"?><q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"><eventParameters publicID="smi:x/ep"><event publicID="smi:x/e/1"><origin publicID="smi:x/o/1"><time><value>2024-01-01T00:00:00Z</value></time><latitude><value>-41</value></latitude><longitude><value>174</value></longitude></origin><magnitude publicID="smi:x/m/1"><mag><value>3.5</value></mag></magnitude><preferredOriginID>smi:x/o/1</preferredOriginID></event></eventParameters></q:quakeml>`;
    (getUploadSession as jest.Mock).mockResolvedValue({
      session_id: 'session-1', file_name: 'big.quakeml', file_size: 4_000_000, total_chunks: 2,
    });
    (assembleChunksToFile as jest.Mock).mockImplementation(async (_s: string, _n: number, filePath: string) => {
      writeFileSync(filePath, xml);
      return { bytesWritten: xml.length };
    });

    const response = await finalize(finalizeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(assembleChunks).not.toHaveBeenCalled();
    expect(body.pendingUploadId).toBe('pending-stream');
    expect(body.eventCount).toBe(1);
    const call = (appendPendingUploadEvents as jest.Mock).mock.calls[0];
    expect(call[4]).toBe('editor-1');
  });
});
