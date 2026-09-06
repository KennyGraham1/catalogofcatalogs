/**
 * Regression tests for the export/import defects fixed in the `exporters` cluster.
 *
 * Every expected value here is derived from the format specification (RFC 4180, RFC 7946,
 * the KML reference) or from the platform's own validation bounds, not from what the code
 * happens to print.
 */

import {
  eventsToCSV,
  eventsToGeoJSON,
  eventsToJSON,
  eventsToKML,
  CSV_EVENT_HEADERS,
} from '@/lib/exporters';
import { csvField, csvRow } from '@/lib/export-utils';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { parseCSV } from '@/lib/parsers';
import type { MergedEvent } from '@/lib/db';

const event = (over: Partial<MergedEvent> = {}): MergedEvent => ({
  id: 'evt-1',
  catalogue_id: 'cat-1',
  time: '2024-01-15T10:00:00Z',
  latitude: -41.2865,
  longitude: 174.7762,
  depth: 12.5,
  magnitude: 4.2,
  source_events: '[{"catalogueId":"a","source":"GeoNet"}]',
  created_at: '2024-01-01T00:00:00Z',
  ...over,
} as MergedEvent);

// ─────────────────────────────────────────────────────────────────────────────
// CSV export is a plain RFC 4180 file by default (was: '#'-prefixed prologue)
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV export conforms to RFC 4180', () => {
  const metadata = { catalogueName: 'GeoNet NZ', license: 'CC BY 4.0', generatedAt: 'G' };

  it('puts the header record on line 1 — RFC 4180 §2 defines no comment convention', () => {
    const csv = eventsToCSV([event(), event({ id: 'evt-2' })], metadata);
    const lines = csv.split('\n');

    expect(lines[0]).toBe(CSV_EVENT_HEADERS.join(','));
    expect(lines).toHaveLength(3); // header + 2 records
    expect(csv.startsWith('#')).toBe(false);
    expect(csv.split('\n').some(line => line.startsWith('#'))).toBe(false);
  });

  it('is readable back by the platform\'s own CSV parser', () => {
    const csv = eventsToCSV(
      [event(), event({ id: 'evt-2', time: '2024-02-20T04:30:00Z', magnitude: 2.1, depth: 33 })],
      metadata
    );

    const parsed = parseCSV(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.success).toBe(true);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0].latitude).toBeCloseTo(-41.2865, 6);
    expect(parsed.events[0].longitude).toBeCloseTo(174.7762, 6);
    expect(parsed.events[0].depth).toBeCloseTo(12.5, 6);
    expect(parsed.events[0].magnitude).toBeCloseTo(4.2, 6);
    expect(parsed.events[1].magnitude).toBeCloseTo(2.1, 6);
  });

  it('emits the metadata prologue only when explicitly opted in', () => {
    const csv = eventsToCSV([event()], metadata, { metadataComments: true });
    const lines = csv.split('\n');

    expect(lines[0]).toBe('# Catalogue: GeoNet NZ');
    expect(lines).toContain('# License: CC BY 4.0');
    expect(lines).toContain('# Event Count: 1');
    // The header record still follows the prologue verbatim.
    expect(lines).toContain(CSV_EVENT_HEADERS.join(','));
  });

  it('quotes a field containing a comma, a quote or a newline (RFC 4180 §2.6, §2.7)', () => {
    const csv = eventsToCSV([event({ region: 'Wellington, New Zealand', author: 'A "B" C' })]);
    expect(csv).toContain('"Wellington, New Zealand"');
    expect(csv).toContain('"A ""B"" C"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Spreadsheet formula injection
// ─────────────────────────────────────────────────────────────────────────────

describe('csvField neutralises spreadsheet formulas', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+SUM(A1:A9)', "'+SUM(A1:A9)"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['-cmd|calc', "'-cmd|calc"],
    ['\tlead', "'\tlead"],
  ])('prefixes %s with an apostrophe', (input, expected) => {
    // The tab case still needs no quoting: a tab is not a CSV delimiter here.
    expect(csvField(input).replace(/^"|"$/g, '')).toBe(expected);
  });

  it.each([
    ['-41.2865'],
    ['+3'],
    ['-0.5'],
    ['1e-3'],
    ['-1.5E+2'],
  ])('leaves the numeric literal %s untouched so the file stays numeric', (input) => {
    expect(csvField(input)).toBe(input);
  });

  it('leaves negative numbers untouched when passed as numbers', () => {
    expect(csvField(-41.2865)).toBe('-41.2865');
    expect(csvField(-0.4)).toBe('-0.4');
  });

  it('escapes a formula that also needs quoting', () => {
    // Both rules apply: apostrophe first, then RFC 4180 quoting for the comma.
    expect(csvField('=HYPERLINK("x","y"),1')).toBe('"\'=HYPERLINK(""x"",""y""),1"');
  });

  it('csvRow escapes every field and joins with commas', () => {
    expect(csvRow(['a', 'b,c', null, 3, undefined])).toBe('a,"b,c",,3,');
  });

  it('carries the neutralisation into the CSV export', () => {
    const csv = eventsToCSV([event({ region: '=cmd|calc' })]);
    expect(csv).toContain("'=cmd|calc");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KML magnitude banding
// ─────────────────────────────────────────────────────────────────────────────

describe('KML export covers the whole magnitude domain', () => {
  it('emits one Placemark per event across M -3 to M 10', () => {
    // lib/validation.ts admits magnitudes from -3 upward; negative local magnitudes are
    // routine in NZ microseismic and induced-seismicity catalogues.
    const magnitudes = [-3, -1.4, -0.4, 0, 0.9, 2.9, 3, 4.5, 5.5, 6.5, 7, 9.1, 10];
    const events = magnitudes.map((magnitude, i) => event({ id: `evt-${i}`, magnitude }));

    const kml = eventsToKML(events);
    expect((kml.match(/<Placemark>/g) || []).length).toBe(magnitudes.length);
  });

  it('files sub-zero magnitudes in the "M < 3" folder and counts them', () => {
    const events = [-0.4, 1.2, 0.0].map((magnitude, i) => event({ id: `evt-${i}`, magnitude }));
    const kml = eventsToKML(events);

    // XML 1.0 §2.4: '<' is not allowed as character data, so the band label is escaped.
    expect(kml).toContain('<name>M &lt; 3 (3 events)</name>');
    expect(kml).toContain('<name>M -0.4</name>');
  });

  it('keeps the icon scale of every band finite', () => {
    const kml = eventsToKML([event({ magnitude: -0.4 })]);
    expect(kml).not.toContain('NaN');
    expect(kml).not.toContain('Infinity');
  });

  it('produces well-formed XML for every band', () => {
    // The "M < 3" folder name used to be written with a literal '<', which makes the document
    // malformed and unopenable in Google Earth.
    const events = [-0.4, 1.2, 3.5, 4.5, 5.5, 6.5, 8.0].map(
      (magnitude, i) => event({ id: `evt-${i}`, magnitude })
    );
    const doc = new DOMParser().parseFromString(eventsToKML(events), 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('Placemark')).toHaveLength(events.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Streamed serialisation is byte-identical to the whole-document form
// ─────────────────────────────────────────────────────────────────────────────

describe('streamed JSON/GeoJSON serialisation stays canonical', () => {
  // The contract is: the output is exactly JSON.stringify(document, null, 2). Re-stringifying
  // the parsed output must therefore reproduce the output character for character.
  it.each([0, 1, 2, 5])('holds for %i events', (n) => {
    const events = Array.from({ length: n }, (_, i) => event({ id: `evt-${i}`, magnitude: i }));
    const meta = { catalogueName: 'X', generatedAt: 'G' };

    for (const out of [eventsToGeoJSON(events, meta), eventsToJSON(events, meta)]) {
      expect(out).toBe(JSON.stringify(JSON.parse(out), null, 2));
    }
  });

  it('reports the true event count and emits every feature', () => {
    const events = Array.from({ length: 7 }, (_, i) => event({ id: `evt-${i}` }));
    const doc = JSON.parse(eventsToGeoJSON(events));

    expect(doc.type).toBe('FeatureCollection');
    expect(doc.metadata.count).toBe(7);
    expect(doc.features).toHaveLength(7);
    expect(doc.features.map((f: any) => f.id)).toEqual(events.map(e => e.id));

    const json = JSON.parse(eventsToJSON(events));
    expect(json.metadata.eventCount).toBe(7);
    expect(json.events).toHaveLength(7);
  });

  it('carries the catalogue-level merge configuration', () => {
    const mergeConfig = { strategy: 'union', distanceThresholdKm: 10, timeThresholdSec: 5 };
    const doc = JSON.parse(eventsToGeoJSON([event()], { mergeConfig }));
    expect(doc.metadata.merge.config).toEqual(mergeConfig);

    const json = JSON.parse(eventsToJSON([event()], { mergeConfig }));
    expect(json.metadata.merge.config).toEqual(mergeConfig);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GeoJSON import: third-coordinate depth and geometry authority
// ─────────────────────────────────────────────────────────────────────────────

describe('GeoJSON third-coordinate depth disambiguation', () => {
  const feature = (z: number | undefined, props: Record<string, unknown> = {}) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: z === undefined ? [174.8, -41.3] : [174.8, -41.3, z],
    },
    properties: { time: '2024-01-01T00:00:00Z', magnitude: 3.0, ...props },
  });

  const depthOf = (z: number | undefined, props?: Record<string, unknown>) => {
    const result = parseGeoJSON(JSON.stringify({ type: 'FeatureCollection', features: [feature(z, props)] }));
    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    return result.events[0].depth;
  };

  it.each([
    // RFC 7946 §3.1.1: the third position element is elevation in metres, positive up.
    // A hypocentre at depth d km is written as -d*1000, so -800 m is 0.8 km deep.
    [-800, 0.8],
    [-1000, 1.0],
    [-30000, 30],
    [-600000, 600],
  ])('reads elevation %i m as %f km depth', (z, expected) => {
    expect(depthOf(z)).toBeCloseTo(expected, 9);
  });

  it.each([
    // USGS/ComCat and GeoNet write depth in km, positive down, in the same slot.
    [0, 0],
    [10, 10],
    [35, 35],
    [700, 700],
    // lib/validation.ts admits depths down to -5 km, so the -5..0 band stays km:
    // these are events located above the datum, not millimetre-scale elevations.
    [-0.8, -0.8],
    [-5, -5],
  ])('keeps km depth %f as %f', (z, expected) => {
    expect(depthOf(z)).toBeCloseTo(expected, 9);
  });

  it('keeps a whole shallow catalogue rather than rejecting it', () => {
    // Previously every hypocentre shallower than 1 km failed validation as -800 km.
    const fc = {
      type: 'FeatureCollection',
      features: [-800, -30000, -1000].map((z, i) => feature(z, { time: `2024-01-0${i + 1}T00:00:00Z` })),
    };
    const result = parseGeoJSON(JSON.stringify(fc));

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.events.map(e => e.depth)).toEqual([0.8, 30, 1]);
  });

  it('prefers an explicit properties.depth (km) over the third coordinate', () => {
    expect(depthOf(-12500, { depth: 12.5 })).toBeCloseTo(12.5, 9);
  });

  it('round-trips this app\'s own GeoJSON export', () => {
    const parsed = parseGeoJSON(eventsToGeoJSON([event({ depth: 0.4 })]));
    expect(parsed.success).toBe(true);
    expect(parsed.events[0].depth).toBeCloseTo(0.4, 9);
  });
});

describe('GeoJSON geometry outranks the properties bag (RFC 7946 §3.2)', () => {
  const parseOne = (properties: Record<string, unknown>) =>
    parseGeoJSON(JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [174.8, -41.3, 12] },
      properties: { time: '2024-01-01T00:00:00Z', magnitude: 3.0, ...properties },
    }));

  it('ignores string-typed latitude/longitude properties instead of rejecting the file', () => {
    const result = parseOne({ latitude: '-41.3', longitude: '174.8' });

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].latitude).toBe(-41.3);
    expect(result.events[0].longitude).toBe(174.8);
  });

  it('ignores a stale in-range latitude property instead of relocating the event', () => {
    // 41.3 (northern hemisphere) instead of -41.3 would have been stored with no error at all.
    const result = parseOne({ latitude: 41.3, longitude: 174.8 });

    expect(result.events[0].latitude).toBe(-41.3);
    expect(result.events[0].longitude).toBe(174.8);
  });

  it.each(['lat', 'lon', 'lng', 'Latitude', 'LONGITUDE', 'x', 'y'])(
    'ignores the coordinate alias property "%s"',
    (key) => {
      const result = parseOne({ [key]: 99 });
      expect(result.errors).toEqual([]);
      expect(result.events[0].latitude).toBe(-41.3);
      expect(result.events[0].longitude).toBe(174.8);
    }
  );

  it('still copies unrelated properties through', () => {
    const result = parseOne({ agency_id: 'WEL', customField: 'kept' });
    expect((result.events[0] as any).customField).toBe('kept');
    expect(result.detectedFields).toContain('customField');
  });
});
