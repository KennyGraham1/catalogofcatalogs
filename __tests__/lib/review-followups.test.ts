/** @jest-environment node */

// Regressions found in review of the 2026-09 fixes.

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({ requireEditor: jest.fn(async () => ({ user: { id: 'editor' } })) }));
const calls: any = { insertMany: [], deleteOne: [] };
const stub: any = {
  countDocuments: jest.fn(async () => calls.insertMany.flat().length),
  insertOne: jest.fn(async () => ({})),
  insertMany: jest.fn(async (docs: any[]) => { calls.insertMany.push(docs); return { insertedCount: docs.length }; }),
  updateOne: jest.fn(async () => ({ matchedCount: 1 })),
  findOne: jest.fn(async (q: any) => ({ id: q.id, name: 'x' })),
  deleteOne: jest.fn(async (q: any) => { calls.deleteOne.push(q); return {}; }),
  deleteMany: jest.fn(async () => ({})),
};
jest.mock('@/lib/mongodb', () => ({ getDb: jest.fn(), getCollection: jest.fn(async () => stub), COLLECTIONS: { CATALOGUES: 'catalogues', EVENTS: 'events', IMPORT_HISTORY: 'import_history' }, withTransaction: jest.fn() }));
jest.mock('@/lib/cache', () => ({ ...jest.requireActual('@/lib/cache'), invalidateCatalogueCache: jest.fn(), invalidateCacheByPrefix: jest.fn() }));
jest.mock('@/lib/rate-limiter', () => ({ applyRateLimit: jest.fn(() => ({ success: true, headers: {} })), readRateLimiter: {}, apiRateLimiter: {} }));
jest.mock('@/lib/pending-uploads', () => ({ deletePendingUpload: jest.fn(async () => undefined), getPendingUploadEvents: jest.fn(async () => null), iteratePendingUploadEventBatches: jest.fn() }));
jest.mock('p-limit', () => ({ __esModule: true, default: () => (fn: any) => fn() }));

import { POST } from '@/app/api/catalogues/route';
import { calculateSeismicMoment } from '@/lib/seismological-analysis';
import { groupMatchingEvents, mergeEventGroup, buildMergedEventFields, mergeByAverage, mergeByQuality, convertToMw } from '@/lib/merge';
import { GeoNetClient } from '@/lib/geonet-client';
import { parseCSV } from '@/lib/parsers';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { eventToQuakeML } from '@/lib/quakeml-exporter';
import { validateQuakeMLStructure } from '@/lib/quakeml-validator';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';

describe('upload route mirrors the DB contract instead of failing the whole upload', () => {
  const base = { time: '2020-01-01T00:00:00.000Z', latitude: -41, longitude: 174, magnitude: 4, depth: 10 };
  const post = (events: unknown[]) => POST(new NextRequest('http://localhost/api/catalogues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Probe', events }) }));
  beforeEach(() => { calls.insertMany = []; calls.deleteOne = []; });

  it('drops an out-of-range optional value and stores the row', async () => {
    const r = await post([base, { ...base, latitude: -42, horizontal_uncertainty: 150 }, { ...base, latitude: -43 }]);
    expect(r.status).toBe(201);
    const stored = calls.insertMany.flat();
    expect(stored).toHaveLength(3);
    expect(stored.find((d: any) => d.latitude === -42).horizontal_uncertainty).toBeUndefined();
    expect(calls.deleteOne).toHaveLength(0);
  });
  it('skips a future-dated row with a reason and keeps the rest', async () => {
    const r = await post([base, { ...base, latitude: -42, time: '2031-01-01T00:00:00.000Z' }]);
    const body = await r.json();
    expect(r.status).toBe(201);
    expect(calls.insertMany.flat()).toHaveLength(1);
    expect(JSON.stringify(body)).toMatch(/outside the accepted range/);
  });
});

describe('seismic moment eligibility', () => {
  const e = (magnitude: number, magnitude_type?: string): any => ({ id: `${magnitude}${magnitude_type}`, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude, magnitude_type });
  it("counts GeoNet's bare 'M' summary magnitude under the ML assumption", () => {
    const r = calculateSeismicMoment([e(5, 'M'), e(4, ' m '), e(5, 'MLv')]);
    expect([r.assumedMwCount, r.excludedCount]).toEqual([3, 0]);
  });
});

describe('merge association and identity', () => {
  const cfg: any = { timeThreshold: 30, distanceThreshold: 10, mergeStrategy: 'average', priority: 'quality' };
  const ev = (id: string, sec: number, extra: Record<string, unknown> = {}): any => ({ id, time: new Date(Date.UTC(2024, 0, 1) + sec * 1000).toISOString(), latitude: 0, longitude: 0, depth: 10, magnitude: 3, source: id, catalogueId: id, ...extra });

  it('a dense single-agency swarm groups in linear time', () => {
    const swarm = Array.from({ length: 400 }, (_, i) => ({ ...ev('s' + i, i * 0.1, { latitude: i * 1e-5 }), source: 'A', catalogueId: 'A' }));
    const t = Date.now();
    expect(groupMatchingEvents(swarm, cfg)).toHaveLength(400);
    expect(Date.now() - t).toBeLessThan(2000);
  });
  it('an averaged record keeps the base agency on its source_id and never borrows another agency\'s id', () => {
    const geonet = ev('g', 0, { source: 'GeoNet', catalogueId: 'GeoNet', source_id: '123' });
    const isc = ev('i', 1, { source: 'ISC', catalogueId: 'ISC', source_id: '123', magnitude: 3.1 });
    const merged = mergeEventGroup([geonet, isc], cfg);
    expect(buildMergedEventFields(merged, ['source_id']).source_id).toBe('GeoNet:123');
    const noId = ev('g2', 0, { source: 'GeoNet', catalogueId: 'GeoNet' });
    const filled = mergeEventGroup([noId, { ...isc, id: 'i2' }], cfg);
    expect(buildMergedEventFields(filled, ['source_id']).source_id).not.toBe('GeoNet:123');
  });
  it('id-less members of a rejected provisional group are all emitted', () => {
    const w = ev('W', 0, { magnitude: 3 });
    const t1: any = { ...ev('T1', 1, { magnitude: 5 }), id: undefined };
    const t2: any = { ...ev('T2', 16, { magnitude: 5, longitude: 0.2 }), id: undefined };
    const emitted = groupMatchingEvents([w, t1, t2], { ...cfg, timeThreshold: 10 }).flatMap((g) => g.events);
    expect(emitted).toHaveLength(3);
  });
  it('the stored magnitudes column is read defensively and inside the physical range', () => {
    const bad = (magnitudes: string) => mergeByAverage([ev('a', 0, { magnitude: 4, magnitude_type: 'ML', magnitudes })]).magnitude;
    expect(bad('[null]')).toBe(4);
    expect(bad('[{"type":7,"mag":{"value":4.1}}]')).toBe(4);
    expect(bad('[{"type":"Mw","mag":{"value":"4.4"}}]')).toBe(4);
    expect(bad('[{"type":"Mw","mag":{"value":99}}]')).toBe(4);
  });
  it('quality ties are broken by populated core fields, not input order', () => {
    const a = ev('a', 0, { depth: null }); const b = ev('b', 1, { depth: 12 });
    expect(mergeByQuality([a, b]).depth).toBe(12);
    expect(mergeByQuality([b, a]).depth).toBe(12);
  });
  it('the merged preferred_magnitude_id points at the selected measurement', () => {
    const geonet = ev('g', 0, { source: 'GeoNet', catalogueId: 'GeoNet', magnitude: 5.4, magnitude_type: 'ML', preferred_magnitude_id: 'smi:geonet/mag/ml',
      magnitudes: JSON.stringify([{ publicID: 'smi:geonet/mag/ml', type: 'ML', mag: { value: 5.4 } }, { publicID: 'smi:geonet/mag/mw', type: 'Mw', mag: { value: 5.9 } }]) });
    const isc = ev('i', 1, { source: 'ISC', catalogueId: 'ISC', magnitude: 5.5, magnitude_type: 'mb' });
    const merged: any = mergeEventGroup([geonet, isc], cfg);
    expect([merged.magnitude, merged.preferred_magnitude_id]).toEqual([5.9, 'smi:geonet/mag/mw']);
  });
  it("an all-caps 'MB' is short-period mb, only 'mB' is broadband", () => {
    expect(convertToMw(5, 'MB')?.value).toBeCloseTo(0.85 * 5 + 1.03, 6);
    expect(convertToMw(5, 'mB')).toBeNull();
  });
});

describe('GeoNet client text parsing', () => {
  const header = '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType';
  const row = (id: string) => `${id}|2024-01-01T00:00:00|-41|174|10|GNS|NZ|GNS|${id}|ML|3.2|GNS|Wellington|earthquake`;
  const params = { starttime: '2024-01-01T00:00:00Z', endtime: '2024-01-01T02:00:00Z' };
  const mockText = (body: string) => { global.fetch = jest.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch; };
  afterEach(() => jest.restoreAllMocks());
  it('a final row missing any column is a truncated body', async () => {
    mockText([header, row('E0'), row('E1').split('|').slice(0, 12).join('|')].join('\n'));
    await expect(new GeoNetClient().fetchEventsText(params)).rejects.toThrow(/truncated/);
  });
  it('a comment line containing a pipe is not mistaken for the header', async () => {
    mockText(`# Generated by GeoNet | FDSN-WS 1.2\n${header}\n${row('VALID')}`);
    await expect(new GeoNetClient().fetchEventsText(params)).resolves.toHaveLength(1);
  });
});

describe('ingestion follow-ups', () => {
  it('split date columns reject an impossible calendar value and keep years below 100', () => {
    const at = (row: string) => parseCSV(`year,month,day,hour,minute,second,latitude,longitude,magnitude\n${row}`, ',', 'International');
    expect(at('2024,13,1,0,0,0,-41,174,3').events).toHaveLength(0);
    expect(at('2024,4,31,0,0,0,-41,174,3').events).toHaveLength(0);
    expect(at('1024,1,15,10,30,0,-41,174,3').events[0].time).toBe('1024-01-15T10:30:00.000Z');
  });
  it('magnitude columns resolve the same way whatever their order', () => {
    const run = (head: string, row: string) => { const e: any = parseCSV(`time,latitude,longitude,${head}\n2024-01-01T00:00:00Z,-41,174,${row}`, ',', 'International').events[0]; return [e.magnitude, e.magnitude_type, JSON.parse(e.magnitudes ?? 'null')]; };
    const expected = [4.1, 'Mw', [{ type: 'ML', mag: { value: 3.2 } }]];
    expect(run('magnitude,magnitude_type,Mw', '3.2,ML,4.1')).toEqual(expected);
    expect(run('Mw,magnitude,magnitude_type', '4.1,3.2,ML')).toEqual(expected);
    expect(run('ML,Mw', '3.2,4.1')).toEqual(expected);
    expect(run('ML', '3.2').slice(0, 2)).toEqual([3.2, 'ML']);
  });
  it('blank ellipse cells stay absent rather than becoming 0', () => {
    const e: any = parseCSV('time,latitude,longitude,magnitude,min_horizontal_uncertainty,max_horizontal_uncertainty,azimuth_max_horizontal_uncertainty\n2024-01-01T00:00:00Z,-41,174,3,,,', ',', 'International').events[0];
    const f: any = parsedEventToDbFields(e);
    expect([f.min_horizontal_uncertainty, f.max_horizontal_uncertainty, f.azimuth_max_horizontal_uncertainty]).toEqual([undefined, undefined, undefined]);
  });
  it('a bare ampersand in a small QuakeML file is tolerated', () => {
    const { parseQuakeML } = require('@/lib/parsers');
    const NS = 'xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"';
    const doc = `<?xml version="1.0"?><q:quakeml ${NS}><eventParameters publicID="smi:local/ep"><event publicID="smi:local/event/1"><description><text>Cook Strait & Marlborough</text></description><origin publicID="smi:local/origin/1"><time><value>2024-01-01T00:00:00Z</value></time><latitude><value>-41</value></latitude><longitude><value>174</value></longitude></origin><magnitude publicID="smi:local/mag/1"><mag><value>3.5</value></mag></magnitude><preferredOriginID>smi:local/origin/1</preferredOriginID></event></eventParameters></q:quakeml>`;
    const r = parseQuakeML(doc);
    expect(r.events).toHaveLength(1);
  });
  it('a GeoPandas-style epoch-seconds time is read as seconds', () => {
    const f = { type: 'Feature', id: 'f', geometry: { type: 'Point', coordinates: [174, -41, 10] }, properties: { time: 1704067200, magnitude: 3 } };
    expect(parseGeoJSON(JSON.stringify(f)).events[0].time).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('QuakeML follow-ups', () => {
  it('reads a focal-mechanism waveformID text resourceURI, single-quoted ids, xs:boolean 1/0 and split CDATA', () => {
    const e: any = parseQuakeMLEvent(`<event publicID='smi:x/e/1'><description><text>\n <![CDATA[Kai]]><![CDATA[koura]]> &amp; x\n</text></description><origin publicID='smi:x/o/1'><time><value>2024-01-01T00:00:00Z</value><uncertainty>0.5abc</uncertainty></time><latitude><value>-41</value></latitude><longitude><value>174</value></longitude><timeFixed>1</timeFixed></origin><focalMechanism publicID="smi:x/fm/1"><waveformID networkCode="BW" stationCode="FUR">smi:ch/wf/a&amp;b</waveformID></focalMechanism></event>`);
    expect(e.publicID).toBe('smi:x/e/1');
    expect(e.description[0].text).toBe('Kaikoura & x');
    expect(e.origins[0].timeFixed).toBe(true);
    expect(e.origins[0].time.uncertainty).toBeUndefined();
    expect(e.focalMechanisms[0].waveformID[0].resourceURI).toBe('smi:ch/wf/a&b');
  });
  it('resource-id escaping is injective and a preference never names an omitted plane', () => {
    const pid = (id: string) => (eventToQuakeML({ id, catalogue_id: 'c', source_id: id, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 3 } as any).match(/<event publicID="([^"]+)"/) || [])[1];
    expect(new Set(['@00', '䀀', '#01', '⌁'].map(pid)).size).toBe(4);
    const xml = eventToQuakeML({ id: 'e', catalogue_id: 'c', source_id: 'e', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 3, focal_mechanisms: JSON.stringify([{ publicID: 'smi:x/fm/1', nodalPlanes: { preferredPlane: 2, nodalPlane1: { strike: { value: 1 }, dip: { value: 2 }, rake: { value: 3 } }, nodalPlane2: { strike: { value: 9 } } } }]) } as any);
    expect(xml).not.toMatch(/preferredPlane=/);
  });
  it('the structure validator survives a CDATA section containing a comment opener', () => {
    const NS = 'xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"';
    expect(validateQuakeMLStructure(`<?xml version="1.0"?><q:quakeml ${NS}><eventParameters publicID="smi:x/ep"><event publicID="smi:x/e/1"><comment><text><![CDATA[ <!-- ]]></text></comment><comment><text><![CDATA[ --> ]]></text></comment></event></eventParameters></q:quakeml>`).isValid).toBe(true);
  });
});
