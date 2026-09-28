/** @jest-environment node */
/**
 * #71 / gap gi#3: the platform's own JSON export ({metadata, events:[{location:{...},
 * magnitude:{value,...}, uncertainties:{...}, ...}]}) re-imports. Every event used to be
 * rejected ('Latitude is required; Longitude is required; Magnitude must be a number'),
 * and hoisting only the core fields would still have stored location_name as
 * "[object Object]" (location is its alias) and lost the source id.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFile, parseJSON, parseJSONStream } from '@/lib/parsers';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { eventsToJSON } from '@/lib/exporters';

const ROWS: any[] = [
  {
    id: 'row-7f3a', catalogue_id: 'cat-geonet', created_at: '2024-01-02T00:00:00Z',
    time: '2016-11-13T11:02:56.346Z', latitude: -42.6925, longitude: 173.0197, depth: 15.11,
    depth_type: 'from location', magnitude: 7.8, magnitude_type: 'Mw', magnitude_uncertainty: 0.1,
    event_public_id: 'smi:nz.org.geonet/2016p858000', source_id: '2016p858000', agency_id: 'WEL', author: 'duty seismologist',
    region: 'Canterbury', location_name: '20 km SE of Hanmer Springs', event_type: 'earthquake',
    evaluation_mode: 'manual', evaluation_status: 'reviewed',
    azimuthal_gap: 45, used_phase_count: 120, used_station_count: 60, standard_error: 0.4,
    horizontal_uncertainty: 1.2, depth_uncertainty: 2.1, time_uncertainty: 0.3,
    min_horizontal_uncertainty: 0.8, max_horizontal_uncertainty: 1.5, azimuth_max_horizontal_uncertainty: 35,
    source_events: '[]',
    focal_mechanisms: JSON.stringify([{ publicID: 'smi:fm/1', nodalPlanes: { nodalPlane1: { strike: { value: 20 }, dip: { value: 40 }, rake: { value: 90 } } } }]),
  },
  {
    id: 'row-2b', catalogue_id: 'cat-geonet', created_at: '2024-01-02T00:00:00Z',
    time: '2021-03-04T19:28:31.000Z', latitude: -29.72, longitude: -177.28, depth: null,
    magnitude: 8.1, magnitude_type: 'Mw', source_id: '2021p169083', source_events: '[]',
  },
];

describe('#71 / gi#3: the JSON export re-imports', () => {
  const exported = eventsToJSON(ROWS);

  it('every exported event is accepted with its core fields', () => {
    for (const result of [parseFile(exported, 'Test_export.json'), parseJSON(exported)]) {
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.events.map((e) => [e.time, e.latitude, e.longitude, e.depth ?? null, e.magnitude])).toEqual([
        ['2016-11-13T11:02:56.346Z', -42.6925, 173.0197, 15.11, 7.8],
        ['2021-03-04T19:28:31.000Z', -29.72, -177.28, null, 8.1],
      ]);
    }
  });

  it('identifiers, provenance, uncertainties and quality survive the round trip', () => {
    const fields: any = parsedEventToDbFields(parseJSON(exported).events[0]);
    for (const key of [
      'event_public_id', 'source_id', 'agency_id', 'author', 'region', 'location_name', 'event_type',
      'depth_type', 'magnitude_type', 'magnitude_uncertainty', 'evaluation_mode', 'evaluation_status',
      'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
      'horizontal_uncertainty', 'depth_uncertainty',
      'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'azimuth_max_horizontal_uncertainty',
    ]) {
      expect([key, fields[key]]).toEqual([key, ROWS[0][key]]);
    }
    expect(JSON.parse(fields.focal_mechanisms)).toEqual(JSON.parse(ROWS[0].focal_mechanisms));
    // The nested objects are unpacked, not stored under names the pipeline misreads.
    expect(fields.location_name).not.toContain('[object Object]');
  });

  it('the upload shows flat, canonical field names', () => {
    const fields = parseJSON(exported).detectedFields;
    expect(fields).toEqual(expect.arrayContaining(['latitude', 'longitude', 'depth', 'magnitude', 'magnitude_type', 'source_id']));
    expect(fields).not.toContain('location');
    expect(fields).not.toContain('origin');
  });

  it('an NDJSON stream of exported records reads the same way', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-parse-export-'));
    const file = path.join(dir, 'export.ndjson');
    fs.writeFileSync(file, JSON.parse(exported).events.map((e: unknown) => JSON.stringify(e)).join('\n'));
    try {
      const seen: any[] = [];
      const result = await parseJSONStream(file, (event) => { seen.push(event); });
      expect(result.errors).toEqual([]);
      expect(seen.map((e) => [e.latitude, e.longitude, e.magnitude])).toEqual([[-42.6925, 173.0197, 7.8], [-29.72, -177.28, 8.1]]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a generic JSON record with a location string is left alone', () => {
    const result = parseJSON(JSON.stringify([{ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 4, location: 'Wellington' }]));
    expect(result.success).toBe(true);
    expect((result.events[0] as any).location_name).toBe('Wellington');
  });
});
