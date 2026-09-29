/**
 * @jest-environment node
 *
 * Regressions found by the post-fix review of the upload routes.
 *
 *  - review #4: the response bound was extrapolated from the first 50 events and preview
 *    events kept their QuakeML picks and arrivals, so a file whose later events carry
 *    picks produced an 18 MB "bounded" response.
 *  - review #7: /api/upload/init accepted any date format and refused 'auto' and
 *    differently cased delimiter names, unlike /api/upload.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ session: {}, user: { id: 'editor-1', email: 'e@example.com', role: 'editor' } })),
}));
jest.mock('@/lib/pending-uploads', () => ({
  storePendingUpload: jest.fn(async () => 'pending-1'),
  createPendingUpload: jest.fn(async () => ({ uploadId: 'pending-stream', expiresAt: new Date(Date.now() + 1000) })),
  appendPendingUploadEvents: jest.fn(async (_id: string, events: unknown[], seq: number) => seq + events.length),
}));
jest.mock('@/lib/upload-chunks', () => ({
  ...jest.requireActual('@/lib/upload-chunks'),
  createUploadSession: jest.fn(async () => 'session-1'),
}));

import { NextRequest } from 'next/server';
import { POST as upload } from '@/app/api/upload/route';
import { POST as init } from '@/app/api/upload/init/route';
import { createUploadSession } from '@/lib/upload-chunks';

function quakemlEvent(i: number, picks: number) {
  const t = new Date(Date.UTC(2000, 0, 1) + i * 3600_000).toISOString();
  let pickXml = '';
  let arrivalXml = '';
  for (let p = 0; p < picks; p++) {
    pickXml += `<pick publicID="smi:nz.org.geonet/Pick/2024${i}.${p}"><time><value>${t}</value><uncertainty>0.05</uncertainty></time>` +
      `<waveformID networkCode="NZ" stationCode="ST${p}" channelCode="HHZ" locationCode="10"/><phaseHint>P</phaseHint>` +
      `<evaluationMode>manual</evaluationMode><creationInfo><agencyID>WEL</agencyID><author>scautopick</author></creationInfo></pick>`;
    arrivalXml += `<arrival publicID="smi:nz.org.geonet/Arrival/${i}.${p}"><pickID>smi:nz.org.geonet/Pick/2024${i}.${p}</pickID><phase>P</phase>` +
      `<azimuth>${p}</azimuth><distance>0.${p}</distance><timeResidual>0.1</timeResidual><timeWeight>1</timeWeight></arrival>`;
  }
  return `<event publicID="smi:nz.org.geonet/${i}">${pickXml}` +
    `<origin publicID="smi:nz.org.geonet/Origin/${i}"><time><value>${t}</value></time><latitude><value>-41.1</value></latitude>` +
    `<longitude><value>174.2</value></longitude><depth><value>12000</value></depth>${arrivalXml}</origin>` +
    `<magnitude publicID="smi:nz.org.geonet/Mag/${i}"><mag><value>3.1</value></mag><type>ML</type><originID>smi:nz.org.geonet/Origin/${i}</originID></magnitude>` +
    `<preferredOriginID>smi:nz.org.geonet/Origin/${i}</preferredOriginID><preferredMagnitudeID>smi:nz.org.geonet/Mag/${i}</preferredMagnitudeID></event>`;
}

describe('review #4: the upload response is bounded whatever the events carry', () => {
  it('a QuakeML file whose later events carry picks stays far below the payload limit', async () => {
    const events = Array.from({ length: 1500 }, (_, i) => quakemlEvent(i, i < 50 ? 0 : 25));
    const xml = `<?xml version="1.0" encoding="UTF-8"?><q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2"><eventParameters publicID="smi:x">${events.join('')}</eventParameters></q:quakeml>`;
    const form = new FormData();
    form.append('file', new File([xml], 'cat.xml', { type: 'application/xml' }));

    const response = await upload(new NextRequest('http://localhost/api/upload', { method: 'POST', body: form }));
    const raw = await response.text();
    const body = JSON.parse(raw);

    expect(response.status).toBe(200);
    expect(body.eventCount).toBe(1500);
    expect(Buffer.byteLength(raw)).toBeLessThan(2 * 1024 * 1024);
    for (const event of body.previewEvents) {
      expect(event.picks).toBeUndefined();
      expect(event.arrivals).toBeUndefined();
      expect(event.origins).toBeUndefined();
    }
    expect(body.previewEvents[0]).toMatchObject({ magnitude: 3.1, latitude: -41.1 });
  }, 60000);
});

describe('review #7: /api/upload/init validates like /api/upload', () => {
  const post = (body: Record<string, unknown>) => init(new NextRequest('http://localhost/api/upload/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'big.csv', fileSize: 4_000_000, totalChunks: 2, ...body }),
  }));

  beforeEach(() => jest.clearAllMocks());

  it("accepts 'auto' and delimiter names in any case, storing the canonical name", async () => {
    expect((await post({ delimiter: 'auto' })).status).toBe(200);
    expect((createUploadSession as jest.Mock).mock.calls[0][3]).toBeUndefined();
    expect((await post({ delimiter: 'Comma' })).status).toBe(200);
    expect((createUploadSession as jest.Mock).mock.calls[1][3]).toBe('comma');
    expect((await post({ delimiter: 'colon' })).status).toBe(400);
  });

  it('validates the date format and stores its canonical spelling', async () => {
    expect((await post({ dateFormat: 'us' })).status).toBe(200);
    expect((createUploadSession as jest.Mock).mock.calls[0][4]).toBe('US');
    expect((await post({ dateFormat: 'auto' })).status).toBe(200);
    expect((createUploadSession as jest.Mock).mock.calls[1][4]).toBeUndefined();
    const refused = await post({ dateFormat: 'lunar' });
    expect(refused.status).toBe(400);
    expect((await refused.json()).code).toBe('INVALID_DATE_FORMAT');
    expect(createUploadSession).toHaveBeenCalledTimes(2);
  });
});
