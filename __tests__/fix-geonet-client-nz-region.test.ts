/** @jest-environment node */
/**
 * GeoNetClient: the New Zealand region query and the raw QuakeML fetch.
 *
 * fetchNZEvents used a 165-179 E, 47.5-34 S box, which drops the Kermadec arc, the
 * Chatham Islands and everything east of 179 E. It now queries NZ_NATIONAL_BOUNDS,
 * which crosses 180 degrees, as the two halves FDSN requires.
 *
 * fetchEventQuakeMLText hands the importer the XML as served, so attributes such as
 * nodalPlanes/@preferredPlane and every publicID survive (finding #107).
 */

import { GeoNetClient } from '@/lib/geonet-client';
import { NZ_NATIONAL_BOUNDS } from '@/lib/geo-bounds-utils';

const header = '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType';
const row = (id: string, time: string, lat: number, lon: number) =>
  `${id}|${time}|${lat}|${lon}|10|GNS|NZ|GNS|${id}|ML|3.2|GNS|somewhere|earthquake`;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GeoNetClient.fetchNZEvents', () => {
  it('queries the national box, including the Kermadec and Chatham Islands, in two halves', async () => {
    const urls: URL[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url);
      const west = url.searchParams.get('maxlongitude') === '180';
      const body = west
        ? [header, row('2024p000002', '2024-01-02T00:00:00', -41.3, 174.8), row('2024p000180', '2024-01-01T12:00:00', -30, 180)]
        : [header, row('2024p000003', '2024-01-03T00:00:00', -29.3, -177.9), row('2024p000180', '2024-01-01T12:00:00', -30, 180)];
      return new Response(body.join('\n'), { status: 200, headers: { 'content-type': 'text/plain' } });
    }) as unknown as typeof fetch;

    const events = await new GeoNetClient().fetchNZEvents(new Date('2024-01-01T00:00:00Z'), new Date('2024-01-04T00:00:00Z'));

    const boxes = urls.map((u) => ['minlatitude', 'maxlatitude', 'minlongitude', 'maxlongitude'].map((k) => Number(u.searchParams.get(k))));
    expect(boxes).toEqual([
      [NZ_NATIONAL_BOUNDS.minLatitude, NZ_NATIONAL_BOUNDS.maxLatitude, NZ_NATIONAL_BOUNDS.minLongitude, 180],
      [NZ_NATIONAL_BOUNDS.minLatitude, NZ_NATIONAL_BOUNDS.maxLatitude, -180, NZ_NATIONAL_BOUNDS.maxLongitude],
    ]);
    // Raoul Island (Kermadec) is included; the event on 180 degrees is kept once; newest first.
    expect(events.map((e) => e.EventID)).toEqual(['2024p000003', '2024p000002', '2024p000180']);
  });
});

describe('GeoNetClient.fetchEventQuakeMLText', () => {
  it('returns the document as served, attributes intact', async () => {
    const xml = '<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">' +
      '<eventParameters publicID="smi:nz.org.geonet/EventParameters"><event publicID="smi:nz.org.geonet/2016p858000">' +
      '<focalMechanism publicID="smi:nz.org.geonet/fm/1"><nodalPlanes preferredPlane="2"></nodalPlanes></focalMechanism>' +
      '</event></eventParameters></q:quakeml>';
    const fetchMock = jest.fn(async () => new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const text = await new GeoNetClient().fetchEventQuakeMLText('2016p858000');

    expect(text).toBe(xml);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('eventid')).toBe('2016p858000');
    expect(url.searchParams.get('format')).toBe('xml');
  });

  it('returns null when GeoNet has no such event', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(new GeoNetClient().fetchEventQuakeMLText('2016p000000')).resolves.toBeNull();
  });
});
