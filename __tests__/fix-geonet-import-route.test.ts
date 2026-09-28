/**
 * @jest-environment node
 *
 * POST /api/import/geonet (findings #102, #103 and #112; contract C13).
 *
 *  #102  the form's dates are labelled UTC but were parsed with new Date(), i.e. in the
 *        server's timezone: on a Pacific/Auckland host 2024-10-24T00:00 was sent to
 *        GeoNet as 2024-10-23T11:00Z. A lone start or end date was silently replaced by
 *        the last 24 hours. (The window below is what GeoNet is asked for.)
 *  #103  an existing target catalogue must exist and be a GeoNet import catalogue.
 *  C13   every import run is audited as import.geonet with the acting user.
 *
 * The route, the import service and the chunker run for real; the GeoNet HTTP client,
 * the database layer, the session check and the audit sink are replaced.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => (fn: () => unknown) => fn(),
}));

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({
    session: {},
    user: { id: 'editor-1', email: 'editor@example.org', role: 'editor' },
  })),
}));

jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));

jest.mock('@/lib/geonet-client', () => ({
  __esModule: true,
  geonetClient: {
    fetchEventsText: jest.fn(),
    fetchEventQuakeMLText: jest.fn(async () => null),
    getLastFetchDiagnostics: jest.fn(() => ({ skippedRows: 0, truncatedTail: false })),
  },
}));

jest.mock('@/lib/db', () => {
  const actual = jest.requireActual('@/lib/db');
  return {
    __esModule: true,
    ...actual,
    dbQueries: {
      getCatalogueById: jest.fn(),
      insertCatalogue: jest.fn(async () => undefined),
      getEventsBySourceIds: jest.fn(async () => new Map()),
      getEventBySourceId: jest.fn(),
      getEventCoordinatesByIds: jest.fn(async () => []),
      bulkInsertEvents: jest.fn(async (rows: unknown[]) => rows.length),
      updateEvent: jest.fn(),
      updateCatalogueStatus: jest.fn(async () => undefined),
      updateCatalogueEventCount: jest.fn(async () => undefined),
      updateCatalogueGeoBounds: jest.fn(async () => undefined),
      countEventsByCatalogue: jest.fn(async () => 1),
      insertImportHistory: jest.fn(async () => undefined),
    },
  };
});

import { POST } from '@/app/api/import/geonet/route';
import { requireEditor } from '@/lib/auth/middleware';
import { writeAuditLog } from '@/lib/audit';
import { geonetClient } from '@/lib/geonet-client';
import { dbQueries } from '@/lib/db';

const client = geonetClient as unknown as Record<string, jest.Mock>;
const db = dbQueries as unknown as Record<string, jest.Mock>;

const row = {
  EventID: '2024p800001', Time: '2024-10-24T06:00:00', Latitude: -41.3, Longitude: 174.8,
  'Depth/km': 12, Author: 'GNS', Catalog: 'NZ', Contributor: 'GNS', ContributorID: '2024p800001',
  MagType: 'ML', Magnitude: 3.1, MagAuthor: 'GNS', EventLocationName: 'Wellington', EventType: 'earthquake',
};

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/import/geonet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  client.fetchEventsText.mockResolvedValue([row]);
  client.fetchEventQuakeMLText.mockResolvedValue(null);
  client.getLastFetchDiagnostics.mockReturnValue({ skippedRows: 0, truncatedTail: false });
  db.getCatalogueById.mockImplementation(async (id: string) =>
    id === 'cat-geonet'
      ? { id, name: 'GeoNet - Daily', merge_config: JSON.stringify({ source: 'GeoNet' }) }
      : id === 'cat-upload'
        ? { id, name: 'ISC upload', merge_config: JSON.stringify({ source: 'upload' }) }
        : undefined
  );
});

afterEach(() => jest.restoreAllMocks());

describe('#102 date window', () => {
  it('asks GeoNet for the UTC window the form labelled, whatever the server timezone', async () => {
    const response = await post({ startDate: '2024-10-24T00:00', endDate: '2024-10-25T00:00' });
    expect(response.status).toBe(200);

    const { starttime, endtime } = client.fetchEventsText.mock.calls[0][0];
    expect(starttime).toBe('2024-10-24T00:00:00.000Z');
    expect(endtime).toBe('2024-10-25T00:00:00.000Z');
  });

  it('honours an explicit offset', async () => {
    await post({ startDate: '2024-10-24T13:00:00+13:00', endDate: '2024-10-25T00:00:00Z' });
    expect(client.fetchEventsText.mock.calls[0][0].starttime).toBe('2024-10-24T00:00:00.000Z');
  });

  it('rejects a start date without an end date instead of importing the last 24 hours', async () => {
    const response = await post({ startDate: '2024-10-24T00:00' });
    expect(response.status).toBe(400);
    expect(client.fetchEventsText).not.toHaveBeenCalled();
  });

  it('rejects an hours window GeoNet cannot be asked for', async () => {
    const response = await post({ hours: 1e8 });
    expect(response.status).toBe(400);
    expect(client.fetchEventsText).not.toHaveBeenCalled();
  });
});

describe('#103 target catalogue', () => {
  it('imports into the chosen GeoNet catalogue', async () => {
    const response = await post({ hours: 24, catalogueId: 'cat-geonet', updateExisting: true });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ catalogueId: 'cat-geonet', catalogueName: 'GeoNet - Daily', newEvents: 1 });
    expect(db.insertCatalogue).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown catalogue and 400 for one it did not create', async () => {
    expect((await post({ hours: 24, catalogueId: 'nope' })).status).toBe(404);
    const refused = await post({ hours: 24, catalogueId: 'cat-upload' });
    expect(refused.status).toBe(400);
    expect((await refused.json()).message).toMatch(/not created by the GeoNet importer/);
    expect(client.fetchEventsText).not.toHaveBeenCalled();
    expect(db.insertCatalogue).not.toHaveBeenCalled();
  });

  it('records the editor as the creator of a new catalogue', async () => {
    await post({ hours: 24, catalogueName: 'GeoNet - Test' });
    expect(db.insertCatalogue).toHaveBeenCalledTimes(1);
    expect(db.insertCatalogue.mock.calls[0][1]).toBe('GeoNet - Test');
    // insertCatalogue takes the creator only from its trusted options argument
    // (lib/db.ts ignores metadata.created_by).
    expect(db.insertCatalogue.mock.calls[0][8]).toEqual({ createdBy: 'editor-1' });
  });
});

describe('C13 audit', () => {
  it('audits each import run as import.geonet', async () => {
    await post({ hours: 24, catalogueId: 'cat-geonet' });
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const [entry, request] = (writeAuditLog as jest.Mock).mock.calls[0];
    expect(entry).toEqual(expect.objectContaining({
      action: 'import.geonet',
      actor_id: 'editor-1',
      actor_email: 'editor@example.org',
      target_id: 'cat-geonet',
      target_type: 'catalogue',
      metadata: expect.objectContaining({ newEvents: 1, totalFetched: 1, catalogueCreated: false }),
    }));
    // The request goes along so the audit log records the client address.
    expect(request).toBeInstanceOf(NextRequest);
  });

  it('does not audit a request that was refused', async () => {
    (requireEditor as jest.Mock).mockResolvedValueOnce(
      NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    );
    expect((await post({ hours: 24 })).status).toBe(403);
    expect((await post({ hours: 24, catalogueId: 'nope' })).status).toBe(404);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});
