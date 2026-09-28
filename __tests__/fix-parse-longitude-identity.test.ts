/** @jest-environment node */
/**
 * gap gi#6: a longitude on the 0-360 convention (Kermadec 182.72) is kept, as -177.28,
 * whatever the file format; it used to be wrapped on the CSV/JSON path and rejected on
 * the GeoJSON and QuakeML paths.
 * gap gi#2 (parser side): a GeoJSON feature's identity comes from its publicid/publicID
 * property ahead of a GeoServer feature id ('quake_search_v1.fid-...').
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCSV, parseJSON, parseQuakeML, parseQuakeMLFileStream } from '@/lib/parsers';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';

const KERMADEC = { time: '2021-03-04T19:28:31Z', latitude: -29.72, longitude: 182.72, depth: 21, magnitude: 8.1 };

const quakeml = `<?xml version="1.0"?>
<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">
  <eventParameters publicID="smi:test/ep">
    <event publicID="smi:nz.org.geonet/2021p169083">
      <preferredOriginID>smi:test/origin/1</preferredOriginID>
      <origin publicID="smi:test/origin/1">
        <time><value>${KERMADEC.time}</value></time>
        <latitude><value>${KERMADEC.latitude}</value></latitude>
        <longitude><value>${KERMADEC.longitude}</value></longitude>
        <depth><value>21000</value></depth>
      </origin>
      <origin publicID="smi:test/origin/2">
        <time><value>${KERMADEC.time}</value></time>
        <latitude><value>-29.7</value></latitude>
        <longitude><value>182.8</value></longitude>
      </origin>
      <magnitude publicID="smi:test/mag/1"><mag><value>8.1</value></mag><type>Mw</type></magnitude>
    </event>
  </eventParameters>
</q:quakeml>`;

describe('gi#6: 0-360 longitudes are wrapped by every parser', () => {
  it('CSV and JSON (already did)', () => {
    const csv = `time,latitude,longitude,depth,magnitude\n${Object.values(KERMADEC).join(',')}`;
    expect(parseCSV(csv).events[0].longitude).toBeCloseTo(-177.28, 10);
    expect(parseJSON(JSON.stringify([KERMADEC])).events[0].longitude).toBeCloseTo(-177.28, 10);
  });

  it('GeoJSON geometry', () => {
    const result = parseGeoJSON(JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [KERMADEC.longitude, KERMADEC.latitude] },
      properties: { time: KERMADEC.time, mag: KERMADEC.magnitude, depth: KERMADEC.depth },
    }));
    expect(result.errors).toEqual([]);
    expect(result.events[0].longitude).toBeCloseTo(-177.28, 10);
    expect(result.fileDecisions.wrappedLongitudes).toBe(1);
  });

  it('QuakeML, in memory and streamed, including the stored origins', async () => {
    const inMemory = parseQuakeML(quakeml);
    expect(inMemory.errors).toEqual([]);
    expect(inMemory.events[0].longitude).toBeCloseTo(-177.28, 10);
    expect(inMemory.fileDecisions.wrappedLongitudes).toBe(1);
    // Every origin of the event, so the origins blob and the scalar agree.
    const origins = JSON.parse(quakemlEventToDbFields(inMemory.events[0].quakeml!).origins as string);
    expect(origins.map((o: any) => o.longitude.value)).toEqual([expect.closeTo(-177.28, 10), expect.closeTo(-177.2, 10)]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-parse-lon-'));
    try {
      const file = path.join(dir, 'kermadec.xml');
      fs.writeFileSync(file, quakeml);
      const streamed = await parseQuakeMLFileStream(file);
      expect(streamed.errors).toEqual([]);
      expect(streamed.events[0].longitude).toBeCloseTo(-177.28, 10);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('in-range values are unchanged, 360 is 0, and beyond 360 is still rejected', () => {
    const lon = (longitude: number) => parseGeoJSON(JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, -29.72] },
      properties: { time: KERMADEC.time, mag: 5 },
    }));
    expect(lon(180).events[0].longitude).toBe(180);
    expect(lon(-177.28).events[0].longitude).toBe(-177.28);
    expect(lon(360).events[0].longitude).toBe(0);
    expect(lon(361).events).toHaveLength(0);
  });
});

describe('gi#2: GeoJSON identity comes from the public ID property', () => {
  const wfsFeature = (properties: Record<string, unknown>) => JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'quake_search_v1.fid-6b0a4c1e_18f',
      geometry: { type: 'Point', coordinates: [173.02, -42.69, 15.1] },
      properties: { origintime: '2016-11-13T11:02:56.346Z', magnitude: 7.8, ...properties },
    }],
  });

  it('GeoNet WFS publicid wins over the GeoServer feature id', () => {
    const event = parseGeoJSON(wfsFeature({ publicid: '2016p858000' })).events[0];
    expect(event.eventId).toBe('2016p858000');
    const fields = parsedEventToDbFields(event);
    expect(fields.event_public_id).toBe('2016p858000');
    expect(fields.source_id).toBe('2016p858000');
  });

  it('GeoNet quake API publicID wins too', () => {
    expect(parseGeoJSON(wfsFeature({ publicID: '2016p858000' })).events[0].eventId).toBe('2016p858000');
  });

  it('without a public ID the feature id is still used', () => {
    expect(parseGeoJSON(wfsFeature({})).events[0].eventId).toBe('quake_search_v1.fid-6b0a4c1e_18f');
  });
});
